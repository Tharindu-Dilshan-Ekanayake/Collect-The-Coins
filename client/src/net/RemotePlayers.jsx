import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Color, Matrix4, SpriteMaterial, Vector3 } from 'three'

import { LOBBY_CAPACITY, MAX_PARTY } from '@shared/lobby.js'

import { AvatarBoundary } from '../game/Player'
import PlayerAvatar from '../game/PlayerAvatar'
import { Kit } from '../game/lib/kit'
import { MATERIALS, useDisposable } from '../game/lib/resources'
import { canvasTexture, drawNameTag } from '../game/lib/textures'
import { useQuality } from '../state/quality'
import { bubbleFor } from './chat'
import { getLobby, getStage, useNet } from './net'

const SEND_MS = 100
const TAG_MS = 250
const TAG_RANGE = 26
const TAG_MIN = 3
/** Body origin (capsule centre) to feet. */
const HALF_HEIGHT = 0.9
const TAGS = { low: 3, medium: 6, high: 10 }
/**
 * How many other players get their real Boxity avatar (the nearest ones). Each costs
 * about 8 draw calls, so this is what keeps a full lobby inside the budget; everyone
 * further away stays a cheap instanced body in their own colours.
 */
const AVATARS = { low: 6, medium: 6, high: 6 }
/** Where a right hand hangs / the upper back is, until the real avatar has loaded. */
const HAND_REST = [-0.5, 0.85, 0.05]
const BACK_REST = [0, 1.15, 0]
const AVATAR_RANGE = 160
const AVATAR_KEEP_RANK = 2

const parseLook = (look) => {
  try {
    return JSON.parse(look || '{}')
  } catch {
    return {}
  }
}

const _hidden = new Matrix4().makeScale(0, 0, 0)
const _body = new Matrix4()
const _local = new Matrix4()
const _out = new Matrix4()
const _color = new Color()
const _cam = new Vector3()
const _fwd = new Vector3()

/** Blocky stand-in bodies. White, so each instance takes its player's colours. */
function buildParts() {
  const torso = new Kit(301)
  torso.box(0.6, 0.62, 0.36, '#ffffff', { p: [0, 0, 0] })
  const head = new Kit(302)
  head.box(0.46, 0.42, 0.42, '#ffffff', { p: [0, 0, 0] })
  head.box(0.07, 0.09, 0.02, '#2b1d14', { p: [-0.1, 0.03, 0.215] })
  head.box(0.07, 0.09, 0.02, '#2b1d14', { p: [0.1, 0.03, 0.215] })
  // Limbs hang from their pivot (hip / shoulder) at the origin.
  const arm = new Kit(303)
  arm.box(0.2, 0.6, 0.24, '#ffffff', { p: [0, -0.28, 0] })
  const leg = new Kit(304)
  leg.box(0.28, 0.8, 0.3, '#ffffff', { p: [0, -0.4, 0] })
  return { torso: torso.build(), head: head.build(), arm: arm.build(), leg: leg.build() }
}

/**
 * Everyone else in the room. Positions arrive ~20 times a second and are smoothed
 * here every frame. All bodies are four InstancedMeshes, so 30 players cost four
 * draw calls; only the nearest few get a name tag (one sprite each).
 */
function RemotePlayers({ room, max, handItem, backItem }) {
  const preset = useQuality((s) => s.settings.name)
  const shadows = useQuality((s) => s.settings.shadows)
  const texSize = useQuality((s) => s.settings.texSize)
  const camera = useThree((s) => s.camera)
  const tagCount = TAGS[preset] || 3
  const avatarCount = AVATARS[preset] || 2

  const parts = useDisposable(buildParts, [])
  const torsoRef = useRef(null)
  const headRef = useRef(null)
  const armRef = useRef(null)
  const legRef = useRef(null)
  /** The four meshes, kept in one stable array so the frame loop allocates nothing. */
  const meshes = useRef([])

  /** Per-instance smoothing state. Allocated once per room. */
  const sim = useMemo(
    () => ({
      ids: new Array(max).fill(null),
      slotOf: new Map(),
      x: new Float32Array(max),
      y: new Float32Array(max),
      z: new Float32Array(max),
      ry: new Float32Array(max),
      speed: new Float32Array(max),
      phase: new Float32Array(max),
      dance: new Uint8Array(max),
      seen: new Uint32Array(max),
      frame: 0,
      active: 0,
      dt: 0,
    }),
    [max],
  )

  const tagSize = Math.min(512, texSize)
  const tags = useDisposable(
    () =>
      Array.from({ length: tagCount }, () => {
        const map = canvasTexture(tagSize, tagSize / 4, () => {})
        return { map, material: new SpriteMaterial({ map, transparent: true, depthWrite: false }), slot: -1, key: '' }
      }),
    [tagCount, tagSize],
  )
  const tagRefs = useRef([])

  // Real avatars for the nearest players: slot -> { id, look }, re-picked four times a second.
  const [assigned, setAssigned] = useState(() => new Array(avatarCount).fill(null))
  const assignedRef = useRef(assigned)
  const avatarGroups = useRef([])
  /** Slot -> true once that avatar finished loading; until then the blocky body stays. */
  const avatarReady = useRef([])
  const motions = useMemo(
    () => Array.from({ length: avatarCount }, () => ({ time: 0, speed: 0, grounded: true, maxSpeed: 6 })),
    [avatarCount],
  )
  /** When each player last grabbed coins (ms), from the room's 'taken' messages. */
  const grabAt = useMemo(() => new Map(), [])
  useEffect(() => {
    const off = room.onMessage('taken', ({ by }) => {
      if (by && by !== room.sessionId) grabAt.set(by, performance.now())
    })
    return () => off?.()
  }, [room, grabAt])
  /** Per avatar slot: groups on the right hand and the upper back for their tool (followBone). */
  const hands = useMemo(() => Array.from({ length: avatarCount }, () => ({ current: null })), [avatarCount])
  const backs = useMemo(() => Array.from({ length: avatarCount }, () => ({ current: null })), [avatarCount])
  /** Instance slots drawn by a real avatar this frame (their blocky body is hidden). */
  const covered = useMemo(() => new Uint8Array(max), [max])

  useLayoutEffect(() => {
    meshes.current = [torsoRef.current, headRef.current, armRef.current, legRef.current]
    for (const mesh of meshes.current) {
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.setMatrixAt(i, _hidden)
        mesh.setColorAt(i, _color.set('#ffffff'))
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor.needsUpdate = true
    }
  }, [max])

  /** Copies a player's colours onto their instances (on join only). */
  const paint = (slot, p) => {
    _color.set(p.shirt)
    torsoRef.current.setColorAt(slot, _color)
    armRef.current.setColorAt(slot * 2, _color)
    armRef.current.setColorAt(slot * 2 + 1, _color)
    _color.set(p.pants)
    legRef.current.setColorAt(slot * 2, _color)
    legRef.current.setColorAt(slot * 2 + 1, _color)
    _color.set(p.skin)
    headRef.current.setColorAt(slot, _color)
    for (const mesh of meshes.current) mesh.instanceColor.needsUpdate = true
  }

  // One visitor for every frame, so the loop creates no closures.
  const visit = useMemo(
    () => (p, id) => {
      if (id === room.sessionId) return
      let slot = sim.slotOf.get(id)
      if (slot === undefined) {
        slot = sim.ids.indexOf(null)
        if (slot < 0) return // more players than instances: extra ones aren't drawn
        sim.ids[slot] = id
        sim.slotOf.set(id, slot)
        sim.x[slot] = p.x
        sim.y[slot] = p.y
        sim.z[slot] = p.z
        sim.ry[slot] = p.ry
        sim.active += 1
        paint(slot, p)
      }
      sim.seen[slot] = sim.frame
      const k = 1 - Math.exp(-12 * sim.dt)
      sim.x[slot] += (p.x - sim.x[slot]) * k
      sim.y[slot] += (p.y - sim.y[slot]) * k
      sim.z[slot] += (p.z - sim.z[slot]) * k
      let dr = p.ry - sim.ry[slot]
      dr = Math.atan2(Math.sin(dr), Math.cos(dr))
      sim.ry[slot] += dr * k
      sim.speed[slot] += (p.speed - sim.speed[slot]) * k
      sim.dance[slot] = p.dance ? 1 : 0
    },
    [room, sim],
  )

  useFrame((_, delta) => {
    sim.frame += 1
    sim.dt = Math.min(delta, 0.1)
    room.state?.players?.forEach(visit)

    const torso = torsoRef.current
    const head = headRef.current
    const arm = armRef.current
    const leg = legRef.current

    // Real avatars follow their player's smoothed position.
    const nowMs = performance.now()
    covered.fill(0)
    const slots = assignedRef.current
    for (let j = 0; j < slots.length; j += 1) {
      const group = avatarGroups.current[j]
      if (!group) continue
      const a = slots[j]
      const s = a ? sim.slotOf.get(a.id) : undefined
      if (s === undefined || sim.seen[s] !== sim.frame) {
        group.visible = false
        continue
      }
      group.visible = true
      group.position.set(sim.x[s], sim.y[s] - HALF_HEIGHT, sim.z[s])
      group.rotation.y = sim.ry[s]
      const m = motions[j]
      m.time += sim.dt
      m.speed = sim.speed[s]
      m.dance = sim.dance[s] === 1
      // A grab: the arm reaches out and the tool swings with it.
      const ga = grabAt.get(a.id)
      const gr = ga ? (nowMs - ga) / 380 : -1
      m.grab = gr >= 0 && gr < 1 ? gr : -1
      m.holding = Boolean(a.tool) && a.tool !== 'hands' && !m.dance
      if (avatarReady.current[j]) covered[s] = 1
    }

    for (let i = 0; i < max; i += 1) {
      const id = sim.ids[i]
      if (id === null) continue
      if (sim.seen[i] !== sim.frame) {
        // Left the room.
        sim.slotOf.delete(id)
        sim.ids[i] = null
        sim.active -= 1
        torso.setMatrixAt(i, _hidden)
        head.setMatrixAt(i, _hidden)
        arm.setMatrixAt(i * 2, _hidden)
        arm.setMatrixAt(i * 2 + 1, _hidden)
        leg.setMatrixAt(i * 2, _hidden)
        leg.setMatrixAt(i * 2 + 1, _hidden)
        continue
      }
      if (covered[i]) {
        torso.setMatrixAt(i, _hidden)
        head.setMatrixAt(i, _hidden)
        arm.setMatrixAt(i * 2, _hidden)
        arm.setMatrixAt(i * 2 + 1, _hidden)
        leg.setMatrixAt(i * 2, _hidden)
        leg.setMatrixAt(i * 2 + 1, _hidden)
        continue
      }
      const dancing = sim.dance[i] === 1
      const walk = dancing ? 1 : Math.min(1, sim.speed[i] / 6)
      sim.phase[i] += sim.dt * (dancing ? 8 : 4 + sim.speed[i] * 1.2) * (walk > 0.05 ? 1 : 0)
      const swing = Math.sin(sim.phase[i]) * (dancing ? 0.5 : 0.7) * walk
      const bob = Math.abs(Math.sin(sim.phase[i])) * (dancing ? 0.24 : 0.06) * walk
      const reachAt = grabAt.get(id)
      const reachT = reachAt ? (nowMs - reachAt) / 380 : 1
      const reach = reachT >= 0 && reachT < 1 ? -1.6 * Math.sin(reachT * Math.PI) : 0
      const armL = (dancing ? -2.5 + swing : -swing) + reach
      const armR = dancing ? -2.5 - swing : swing
      _body.makeRotationY(sim.ry[i]).setPosition(sim.x[i], sim.y[i] - HALF_HEIGHT + bob, sim.z[i])

      _local.makeTranslation(0, 1.11, 0)
      torso.setMatrixAt(i, _out.multiplyMatrices(_body, _local))
      _local.makeTranslation(0, 1.63, 0)
      head.setMatrixAt(i, _out.multiplyMatrices(_body, _local))
      _local.makeRotationX(swing).setPosition(-0.13, 0.8, 0)
      leg.setMatrixAt(i * 2, _out.multiplyMatrices(_body, _local))
      _local.makeRotationX(-swing).setPosition(0.13, 0.8, 0)
      leg.setMatrixAt(i * 2 + 1, _out.multiplyMatrices(_body, _local))
      _local.makeRotationX(armL).setPosition(-0.41, 1.4, 0)
      arm.setMatrixAt(i * 2, _out.multiplyMatrices(_body, _local))
      _local.makeRotationX(armR).setPosition(0.41, 1.4, 0)
      arm.setMatrixAt(i * 2 + 1, _out.multiplyMatrices(_body, _local))
    }
    const visible = sim.active > 0
    for (const mesh of meshes.current) {
      mesh.visible = visible
      if (visible) mesh.instanceMatrix.needsUpdate = true
    }

    for (let t = 0; t < tags.length; t += 1) {
      const sprite = tagRefs.current[t]
      if (!sprite) continue
      const slot = tags[t].slot
      sprite.visible = slot >= 0 && sim.ids[slot] !== null
      if (sprite.visible) sprite.position.set(sim.x[slot], sim.y[slot] + HALF_HEIGHT + 0.75, sim.z[slot])
    }
  })

  // Name tags go to the nearest players, re-picked four times a second.
  useEffect(() => {
    const order = []
    const id = setInterval(() => {
      camera.getWorldPosition(_cam)
      order.length = 0
      for (let i = 0; i < max; i += 1) {
        if (sim.ids[i] === null) continue
        const d = Math.hypot(sim.x[i] - _cam.x, sim.z[i] - _cam.z)
        // Distance in cm in the high bits, slot index in the low 7 bits (max < 128).
        // Too close to the lens a tag would fill the screen.
        if (d > TAG_MIN && d < TAG_RANGE) order.push(Math.floor(d * 100) * 128 + i)
      }
      order.sort((a, b) => a - b)
      tags.forEach((tag, t) => {
        const slot = t < order.length ? order[t] % 128 : -1
        tag.slot = slot
        if (slot < 0) return
        const p = room.state?.players?.get(sim.ids[slot])
        const name = p?.name || ''
        // A chat bubble shows above the name for a few seconds.
        const title = bubbleFor(p?.uid)
        const key = `${name}|${title}`
        if (key !== tag.key) {
          tag.key = key
          tag.map.redraw((ctx, w, h) => drawNameTag(ctx, w, h, { name, title }))
        }
      })
    }, TAG_MS)
    return () => clearInterval(id)
  }, [camera, max, room, sim, tags])

  // Pick who gets a real avatar: the nearest players, kept stable so nobody flickers.
  useEffect(() => {
    const ranked = []
    const id = setInterval(() => {
      camera.getWorldPosition(_cam)
      camera.getWorldDirection(_fwd)
      ranked.length = 0
      for (let i = 0; i < max; i += 1) {
        if (sim.ids[i] === null) continue
        const dx = sim.x[i] - _cam.x
        const dz = sim.z[i] - _cam.z
        const d = Math.hypot(dx, dz)
        if (d >= AVATAR_RANGE) continue
        // Players in front of the camera first: those behind you can't be seen anyway.
        const front = d < 0.001 ? 1 : (dx * _fwd.x + dz * _fwd.z) / (d * Math.hypot(_fwd.x, _fwd.z) || 1)
        ranked.push([front > 0.3 ? d : d * 4, sim.ids[i]])
      }
      ranked.sort((a, b) => a[0] - b[0])
      const rankOf = new Map(ranked.map(([, pid], r) => [pid, r]))
      const next = assignedRef.current.map((a) => (a && rankOf.has(a.id) && rankOf.get(a.id) < avatarCount + AVATAR_KEEP_RANK ? a : null))
      const taken = new Set(next.filter(Boolean).map((a) => a.id))
      for (const [, pid] of ranked) {
        if (taken.has(pid)) continue
        const free = next.indexOf(null)
        if (free < 0) break
        next[free] = { id: pid, look: '', tool: '' }
        taken.add(pid)
      }
      let changed = false
      for (let j = 0; j < next.length; j += 1) {
        const a = next[j]
        if (!a) {
          if (assignedRef.current[j]) changed = true
          continue
        }
        const pl = room.state?.players?.get(a.id)
        const look = pl?.look || '{}'
        const tool = pl?.tool || ''
        if (a.look !== look || a.tool !== tool) {
          next[j] = { id: a.id, look, tool }
          changed = true
        } else if (assignedRef.current[j] !== a) changed = true
      }
      if (!changed) return
      next.forEach((a, j) => {
        if (!a || a !== assignedRef.current[j]) avatarReady.current[j] = false
      })
      assignedRef.current = next
      setAssigned(next)
    }, TAG_MS)
    return () => clearInterval(id)
  }, [camera, max, room, sim, avatarCount])

  return (
    <>
      {assigned.map((a, j) => (
        <group
          key={j}
          ref={(el) => {
            avatarGroups.current[j] = el
          }}
          visible={false}
        >
          {a && (
            <AvatarBoundary fallback={null}>
              <Suspense fallback={null}>
                <PlayerAvatar
                  key={`${a.id}|${a.look}`}
                  remote
                  equipped={parseLook(a.look)}
                  targetHeight={1.8}
                  motionRef={{ current: motions[j] }}
                  handRef={a.tool ? hands[j] : undefined}
                  backRef={a.tool && backItem ? backs[j] : undefined}
                  onReady={() => {
                    avatarReady.current[j] = true
                  }}
                />
              </Suspense>
            </AvatarBoundary>
          )}
          <group ref={hands[j]} position={HAND_REST}>
            {a?.tool && handItem?.(a.tool)}
          </group>
          <group ref={backs[j]} position={BACK_REST}>
            {a?.tool && backItem?.(a.tool, hands[j])}
          </group>
        </group>
      ))}
      <instancedMesh ref={torsoRef} args={[parts.torso, MATERIALS.scenery, max]} frustumCulled={false} castShadow={shadows} />
      <instancedMesh ref={headRef} args={[parts.head, MATERIALS.scenery, max]} frustumCulled={false} castShadow={shadows} />
      <instancedMesh ref={armRef} args={[parts.arm, MATERIALS.scenery, max * 2]} frustumCulled={false} castShadow={shadows} />
      <instancedMesh ref={legRef} args={[parts.leg, MATERIALS.scenery, max * 2]} frustumCulled={false} castShadow={shadows} />
      {tags.map((tag, t) => (
        <sprite
          key={t}
          ref={(el) => {
            tagRefs.current[t] = el
          }}
          material={tag.material}
          scale={[2.6, 0.65, 1]}
          visible={false}
        />
      ))}
    </>
  )
}

/** Sends this player's position to the room, ten times a second when it changed. */
function useMoveSender(room, bodyRef) {
  useEffect(() => {
    if (!room) return undefined
    const last = { x: NaN, y: 0, z: 0, ry: 0, speed: -1 }
    const id = setInterval(() => {
      const body = bodyRef.current
      if (!body) return
      const p = body.translation()
      const speed = Math.round(body.speed * 10) / 10
      if (
        Math.abs(p.x - last.x) < 0.02 &&
        Math.abs(p.y - last.y) < 0.02 &&
        Math.abs(p.z - last.z) < 0.02 &&
        Math.abs(body.yaw - last.ry) < 0.03 &&
        speed === last.speed
      ) {
        return
      }
      last.x = p.x
      last.y = p.y
      last.z = p.z
      last.ry = body.yaw
      last.speed = speed
      room.send('move', { x: p.x, y: p.y, z: p.z, ry: body.yaw, speed })
    }, SEND_MS)
    return () => clearInterval(id)
  }, [room, bodyRef])
}

/**
 * Multiplayer presence for a scene: sends our moves and draws everyone else.
 * Renders nothing offline.
 */
export function Multiplayer({ kind, bodyRef, handItem, backItem }) {
  useNet((s) => s.roomVersion)
  const room = kind === 'lobby' ? getLobby() : getStage()
  useMoveSender(room, bodyRef)
  if (!room) return null
  return <RemotePlayers key={`${room.roomId}:${room.sessionId}`} room={room} handItem={handItem} backItem={backItem} max={(kind === 'lobby' ? LOBBY_CAPACITY : MAX_PARTY) - 1} />
}

export default Multiplayer
