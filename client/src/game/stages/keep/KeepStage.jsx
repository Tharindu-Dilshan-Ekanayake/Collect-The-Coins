import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Color,
  EquirectangularReflectionMapping,
  Euler,
  DoubleSide,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshMatcapMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  Quaternion,
  SpriteMaterial,
  Vector3,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import { getStage, useNet } from '../../../net/net'
import Multiplayer from '../../../net/RemotePlayers'
import { useGame } from '../../../state/game'
import { useQuality } from '../../../state/quality'
import { useRun } from '../../../state/run'
import { TOOLS, speedBoost } from '../../../state/stageContent'
import FirstPersonCamera from '../../FirstPersonCamera'
import { registerDebug } from '../../lib/debug'
import Instances from '../../lib/Instances'
import { Kit } from '../../lib/kit'
import { MATERIALS, useDisposable } from '../../lib/resources'
import { halosMaterial, padDiscMaterial, snowMaterial } from '../../lib/shaders'
import {
  brickTexture,
  canvasTexture,
  coinFaceTexture,
  drawFloatingSign,
  drawPricePlaques,
  flagstoneTexture,
  goldMatcapTexture,
  jungleGrassTexture,
  skyTexture,
  snowTexture,
} from '../../lib/textures'
import Player from '../../Player'
import CoinField from './CoinField'
import { CHEST, CHEST_REACH, HALL, KEEP_WORLD, MAP, RACK, RACK_REACH, SPAWN, SPAWN_YAW, THEME, configureMap } from './layout'
import {
  buildBedTop,
  buildChest,
  buildChestHoard,
  buildChestLid,
  buildFieldCoin,
  buildFloor,
  buildHall,
  buildHallGlow,
  buildPlaques,
  buildRack,
  buildWalls,
  chestGlowSpots,
  RACK_SLOT_X,
} from './models'
import { buildTool } from './tools'

const KEY_DIR = new Vector3(0.35, 1, 0.25).normalize()
const KEY_POS = KEY_DIR.clone().multiplyScalar(30).toArray()

const _q = new Quaternion()
const _v = new Vector3()
/** Where the hand is, in camera space: low and to the right. */
const HOLD_OFFSET = new Vector3(0.34, -0.36, -0.62)

/**
 * How each tool sits in the hand in first person. The shelf models stand upright with
 * their origin at the base, so each gets a grip point (in model space, moved to the
 * hand), a rotation and a scale. Long tools point their working end forward.
 */
const HOLDS = {
  hands: { grip: [0, 0.3, 0], rot: [-1.15, -0.35, 0.25], scale: 0.5, spin: 0 },
  // The bowl's open side faces you, so you see the coins in it.
  scoop: { grip: [0, 0.98, 0], rot: [1.75, 0.25, 0.3], scale: 0.7, spin: Math.PI },
  rake: { grip: [0, 1.05, 0], rot: [1.8, 0.25, 0.3], scale: 0.6, spin: 0 },
  // The vac's tank rides on your back; you hold its nozzle wand like the scoop.
  vac: { grip: [0, 0.9, 0], rot: [1.75, 0.25, 0.3], scale: 0.62, spin: Math.PI },
  lodestone: { grip: [0, 0.25, 0], rot: [-0.1, 0.5, 0], scale: 0.34, spin: 0 },
}

/** The hall world plus Swift Boots from this run. */
const WORLD = {
  ...KEEP_WORLD,
  speedBoost: () => speedBoost(useRun.getState().levels.boots),
}

/** No pointer lock while a panel or the results screen is open. */
const canLock = () => {
  const run = useRun.getState()
  return !run.panel && !run.result
}

function HallLighting({ bodyRef }) {
  const keyRef = useRef(null)
  const scene = useThree((s) => s.scene)
  const { shadows, shadowMapSize } = useQuality((s) => s.settings)

  useLayoutEffect(() => {
    const key = keyRef.current
    if (!key) return undefined
    const cam = key.shadow.camera
    cam.left = -20
    cam.right = 20
    cam.top = 20
    cam.bottom = -20
    cam.near = 1
    cam.far = 70
    cam.updateProjectionMatrix()
    scene.add(key.target)
    return () => scene.remove(key.target)
  }, [scene, shadows, shadowMapSize])

  useFrame(() => {
    const key = keyRef.current
    const body = bodyRef.current
    if (!key || !body) return
    const p = body.translation()
    key.target.position.set(p.x, 0, p.z)
    key.position.copy(key.target.position).addScaledVector(KEY_DIR, 30)
  })

  return (
    <>
      <hemisphereLight args={[THEME.skyLight, THEME.groundLight, THEME.hemi]} />
      <directionalLight
        key={shadows ? shadowMapSize : 'off'}
        ref={keyRef}
        castShadow={shadows}
        color={THEME.key}
        intensity={1.5}
        position={KEY_POS}
        shadow-mapSize={shadows ? [shadowMapSize, shadowMapSize] : [1, 1]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
        shadow-intensity={0.6}
      />
      <directionalLight color={THEME.fill} intensity={0.45} position={[-20, 12, -18]} />
    </>
  )
}

/** Outdoor maps: a painted sky as the scene background (one full-screen quad). */
function SkyBackground({ kind }) {
  const scene = useThree((s) => s.scene)
  const texSize = useQuality((s) => s.settings.texSize)
  const sky = useDisposable(() => {
    const map = skyTexture(kind, Math.min(1024, texSize))
    map.mapping = EquirectangularReflectionMapping
    return { map }
  }, [kind, texSize])
  useEffect(() => {
    scene.background = sky.map
    return () => {
      scene.background = null
    }
  }, [scene, sky])
  return null
}

/** Falling snow over the whole basin (MEDIUM/HIGH; LOW has no particles). */
function Snow({ count }) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const snow = useDisposable(() => {
    const height = HALL.height + 3
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const w = HALL.maxX - HALL.minX
    const d = HALL.maxZ - HALL.minZ
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = HALL.minX + Math.random() * w
      positions[i * 3 + 1] = Math.random() * height
      positions[i * 3 + 2] = HALL.minZ + Math.random() * d
      seeds[i] = Math.random()
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1))
    return { geometry, material: snowMaterial((size.height * dpr) / 2, height) }
  }, [count])
  useFrame((state) => {
    snow.material.uniforms.uTime.value = state.clock.elapsedTime
  })
  return <points geometry={snow.geometry} material={snow.material} frustumCulled={false} />
}

/** First-run guide: a big bouncing arrow and a light beam over the chest. */
function ChestGuide() {
  const pending = useGame((s) => !s.tutorialDone)
  const carrying = useRun((s) => s.bag > 0 && s.earned === 0 && !s.result)
  const show = pending && carrying
  const ref = useRef(null)
  const parts = useDisposable(() => {
    const k = new Kit(613)
    k.cone(0.7, 1.0, 4, '#ffd34d', { p: [0, 0, 0], r: [Math.PI, 0, 0] })
    k.box(0.45, 0.9, 0.45, '#ffd34d', { p: [0, 0.9, 0] })
    const beam = new CylinderGeometry(0.9, 0.9, 14, 16, 1, true)
    beam.translate(0, 7, 0)
    return {
      arrow: k.build(),
      beam,
      beamMaterial: new MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.18, depthWrite: false, side: DoubleSide }),
    }
  }, [])
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime
    ref.current.position.y = 4.6 + Math.abs(Math.sin(t * 3)) * 0.6
    ref.current.rotation.y = t * 1.5
  })
  if (!show) return null
  return (
    <group position={[CHEST.x, 0, CHEST.z]}>
      <mesh ref={ref} geometry={parts.arrow} material={MATERIALS.glow} />
      <mesh geometry={parts.beam} material={parts.beamMaterial} renderOrder={3} />
    </group>
  )
}

/** Image-based lighting for real-looking gold (MEDIUM/HIGH only). */
function Reflections() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const name = useQuality((s) => s.settings.name)
  const env = useDisposable(() => {
    if (name === 'low') return null
    const pmrem = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = pmrem.fromScene(room, 0.04)
    room.dispose()
    pmrem.dispose()
    return target
  }, [name, gl])

  useEffect(() => {
    if (!env) return undefined
    scene.environment = env.texture
    scene.environmentIntensity = 0.7
    return () => {
      scene.environment = null
    }
  }, [env, scene])
  return null
}

/** Chest banking, the tool-shelf prompt and the Coin Rush clock, at 10 Hz. */
function StageZones({ bodyRef }) {
  useEffect(() => {
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      const run = useRun.getState()
      const body = bodyRef.current
      if (!body || run.result) return
      const p = body.translation()

      if (p.y < -10) {
        body.setTranslation({ x: SPAWN[0], y: SPAWN[1] + 1, z: SPAWN[2] })
        body.setLinvel({ x: 0, y: 0, z: 0 })
      }

      // Online, the server banks (it knows where everyone stands); offline we do.
      if (!run.net) {
        const atChest = Math.hypot(p.x - CHEST.x, p.z - CHEST.z) < CHEST_REACH
        run.setBanking(atChest)
        if (atChest) run.bankTick(dt)
      }

      const rackFrontZ = RACK.z + 1.4
      run.setNearRack(Math.abs(p.x - RACK.x) < RACK.width / 2 + 0.5 && Math.abs(p.z - rackFrontZ) < RACK_REACH)

    }, 100)
    return () => clearInterval(id)
  }, [bodyRef])
  return null
}

/** The bank chest: lid swings open while you bank, a glow ring and a floating sign. */
function BankChest({ models, texSize }) {
  const lidRef = useRef(null)
  const hoardRef = useRef(null)
  const open = useRef(0)

  const ring = useDisposable(() => {
    const geometry = new CircleGeometry(CHEST_REACH - 0.6, 48)
    geometry.rotateX(-Math.PI / 2)
    geometry.setAttribute('aActive', new InstancedBufferAttribute(new Float32Array(1), 1))
    return { geometry, material: padDiscMaterial() }
  }, [])

  const sign = useDisposable(() => {
    const size = Math.min(1024, texSize)
    const map = canvasTexture(size, size / 2, (ctx, w, h) =>
      drawFloatingSign(ctx, w, h, { title: 'BANK', sub: 'Stand here to deposit' }),
    )
    return { map, material: new SpriteMaterial({ map, transparent: true, depthWrite: false }) }
  }, [texSize])

  const ringItems = useMemo(
    () => [{ x: CHEST.x + Math.sin(CHEST.ry) * 2.6, y: (MAP.walkway?.(CHEST.x, CHEST.z) ? 0.43 : 0.03), z: CHEST.z + Math.cos(CHEST.ry) * 2.6 }],
    [],
  )

  useFrame((state, delta) => {
    const run = useRun.getState()
    const target = run.banking ? 1 : 0
    open.current += (target - open.current) * Math.min(1, delta * 6)
    if (lidRef.current) lidRef.current.rotation.x = -open.current * 1.85
    if (hoardRef.current) hoardRef.current.visible = open.current > 0.05
    ring.material.uniforms.uTime.value = state.clock.elapsedTime
    const a = ring.geometry.attributes.aActive
    if (a.array[0] !== target) {
      a.array[0] = target
      a.needsUpdate = true
    }
  })

  return (
    <>
      <group position={[CHEST.x, 0, CHEST.z]} rotation={[0, CHEST.ry, 0]}>
        <mesh geometry={models.chest} material={MATERIALS.scenery} castShadow receiveShadow />
        <mesh ref={hoardRef} geometry={models.hoard} material={MATERIALS.metal} visible={false} />
        <group ref={lidRef} position={[0, 1.52, -0.8]}>
          <mesh geometry={models.lid} material={MATERIALS.scenery} castShadow />
        </group>
      </group>
      <Instances geometry={ring.geometry} material={ring.material} items={ringItems} colors={RING_COLORS} renderOrder={2} />
      <sprite
        material={sign.material}
        position={[CHEST.x + Math.sin(CHEST.ry) * 0.4, 4.2, CHEST.z + Math.cos(CHEST.ry) * 0.4]}
        scale={[3.6, 1.8, 1]}
      />
    </>
  )
}
const RING_COLORS = ['#ffd34d']

/** Smooth tool materials: reflective metal when the environment map exists. */
function useToolMaterials(reflective) {
  return useDisposable(
    () =>
      reflective
        ? {
            metal: new MeshStandardMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.24, side: DoubleSide }),
            matte: new MeshStandardMaterial({ vertexColors: true, metalness: 0.0, roughness: 0.62 }),
          }
        : {
            metal: new MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: '#ffe9b0', side: DoubleSide }),
            matte: new MeshLambertMaterial({ vertexColors: true }),
          },
    [reflective],
  )
}

/** The five tools turning slowly on their marble stands. */
function ToolDisplay({ tools, materials }) {
  const refs = useRef([])
  useFrame((_s, delta) => {
    refs.current.forEach((g, i) => {
      if (g) g.rotation.y += delta * (0.45 + i * 0.04)
    })
  })
  return TOOLS.map((t, i) => (
    <group
      key={t.id}
      ref={(g) => {
        refs.current[i] = g
      }}
      position={[RACK.x + RACK_SLOT_X[i], 1.12, RACK.z + 0.3]}
      scale={1.05}
    >
      <mesh geometry={tools[t.id].metal} material={materials.metal} castShadow />
      <mesh geometry={tools[t.id].matte} material={materials.matte} castShadow />
    </group>
  ))
}

/**
 * How other players hold each tool. The tool sits on their right hand and turns with the
 * arm (followHand in avatarRig), so this is authored as if the arm hung straight down:
 * the grip in the fist and long tools tipped a little forward past the forearm, so in the
 * carry pose (hand in front of the hip, elbow bent ~50 degrees) they point forward and
 * down at the coins. The vac's wand is held the same way (its tank is worn on the back,
 * see BACK); the lodestone sits on the palm.
 * `grip` overrides the first-person grip point (model space) where it differs.
 */
const CARRY = {
  scoop: { pos: [0, 0.06, 0], rot: [-0.25, 0, 0], scale: 0.8, spin: 0 },
  rake: { pos: [0, 0.06, 0], rot: [-0.25, 0, 0], scale: 0.75, spin: 0 },
  vac: { pos: [0, 0.06, 0], rot: [-0.25, 0, 0], scale: 0.8, spin: 0 },
  lodestone: { pos: [0, 0.05, 0.06], rot: [0.9, 0, 0], scale: 0.5, spin: 0, grip: [0, 0.12, 0] },
}

/** Tools whose hand part is a different model, because the rest is worn on the back. */
const IN_HAND = { vac: 'vacWand' }

/**
 * Tools worn on another player's back, authored like CARRY but relative to their upper
 * back (Spine2, 0.17 m below the shoulder top): the Whirl-Vac's tank sits just behind the
 * torso (its back face is 0.225 m behind the spine), gauge facing out, hose outlet on
 * their right, from the waist up to shoulder height.
 */
const BACK = {
  vac: { pos: [0, -0.47, -0.385], rot: [0, Math.PI, 0], scale: [0.85, 0.65, 0.68] },
}

/** A point in a tool model's space, placed by a CARRY/BACK entry (spin 0, grip offset). */
function placed(entry, point, grip = [0, 0, 0]) {
  const s = Array.isArray(entry.scale) ? entry.scale : [entry.scale, entry.scale, entry.scale]
  return new Vector3((point[0] - grip[0]) * s[0], (point[1] - grip[1]) * s[1], (point[2] - grip[2]) * s[2])
    .applyEuler(new Euler(...entry.rot))
    .add(new Vector3(...entry.pos))
}
/** Hose ends: the tank's outlet (back space) and the top of the wand (hand space). */
const HOSE_OUTLET = placed(BACK.vac, [0.33, 0.2, 0])
const HOSE_WAND = placed(CARRY.vac, [0, 1.1, 0], HOLDS.vac.grip)

const _hoseA = new Vector3()
const _hoseMid = new Vector3()
const _hoseDir = new Vector3()
const _hoseQ = new Quaternion()
const _up = new Vector3(0, 1, 0)

/** Stretches a 1 m hose segment (centred, along +Y) from a to b. */
function stretch(mesh, a, b) {
  _hoseDir.subVectors(b, a)
  const len = Math.max(_hoseDir.length(), 1e-4)
  mesh.position.addVectors(a, b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(_up, _hoseDir.multiplyScalar(1 / len))
  mesh.scale.set(1, len, 1)
}

/**
 * The Whirl-Vac's tank on another player's back, and the hose from it to the wand in
 * their hand (two segments sagging out to the side). Hand and back groups are siblings
 * in the avatar group, so the hose is worked out in that space every frame.
 */
function RemoteBackpack({ toolId, hand, tools, materials }) {
  const root = useRef(null)
  const near = useRef(null)
  const far = useRef(null)
  useFrame(() => {
    const back = root.current?.parent
    const h = hand?.current
    if (!back || !h || !near.current || !far.current) return
    // Wand top: hand space -> avatar space -> back space.
    _hoseA.copy(HOSE_WAND).applyQuaternion(h.quaternion).add(h.position).sub(back.position)
    _hoseA.applyQuaternion(_hoseQ.copy(back.quaternion).invert())
    // The hose droops beside the hip, outside the leg, between the tank and the wand.
    _hoseMid.addVectors(HOSE_OUTLET, _hoseA).multiplyScalar(0.5)
    _hoseMid.x = Math.min(HOSE_OUTLET.x, _hoseA.x) - 0.08
    _hoseMid.y = Math.min(HOSE_OUTLET.y, _hoseA.y) - 0.18
    stretch(near.current, HOSE_OUTLET, _hoseMid)
    stretch(far.current, _hoseMid, _hoseA)
  })
  const wear = BACK[toolId]
  if (!wear) return null
  return (
    <group ref={root}>
      <group position={wear.pos} rotation={wear.rot} scale={wear.scale}>
        <mesh geometry={tools.vacPack.metal} material={materials.metal} />
        <mesh geometry={tools.vacPack.matte} material={materials.matte} />
      </group>
      <mesh geometry={tools.vacStraps.matte} material={materials.matte} />
      <mesh geometry={tools.vacStraps.metal} material={materials.metal} />
      <mesh ref={near} geometry={tools.hose.matte} material={materials.matte} />
      <mesh ref={far} geometry={tools.hose.matte} material={materials.matte} />
    </group>
  )
}

/** The tool another player has equipped, drawn in their hand. Bare hands show nothing. */
function RemoteTool({ toolId, tools, materials }) {
  const carry = CARRY[toolId]
  const tool = tools[IN_HAND[toolId] || toolId]
  if (!carry || !tool) return null
  const grip = carry.grip || HOLDS[toolId].grip
  return (
    <group position={carry.pos} rotation={carry.rot} scale={carry.scale}>
      <group position={[-grip[0], -grip[1], -grip[2]]}>
        <group rotation={[0, carry.spin, 0]}>
          <mesh geometry={tool.metal} material={materials.metal} />
          <mesh geometry={tool.matte} material={materials.matte} />
        </group>
      </group>
    </group>
  )
}

/** The equipped tool held in front of the first-person camera; swings on each grab. */
function HeldTool({ tools, materials }) {
  const camera = useThree((s) => s.camera)
  const ref = useRef(null)
  const [equipped, setEquipped] = useState(() => useRun.getState().equipped)

  useEffect(
    () =>
      useRun.subscribe((s, prev) => {
        if (s.equipped !== prev.equipped) setEquipped(s.equipped)
      }),
    [],
  )

  useFrame((state) => {
    const g = ref.current
    if (!g) return
    const run = useRun.getState()
    const since = run.lastGrab ? Date.now() - run.lastGrab.at : 9999
    const swing = since < 260 ? Math.sin((since / 260) * Math.PI) : 0
    const bob = Math.sin(state.clock.elapsedTime * 2.2) * 0.012
    _v.copy(HOLD_OFFSET)
    _v.y += bob - swing * 0.08
    _v.z -= swing * 0.18
    _v.applyQuaternion(camera.quaternion)
    g.position.copy(camera.position).add(_v)
    g.quaternion.copy(camera.quaternion)
    _q.setFromAxisAngle(_v.set(1, 0, 0), -swing * 0.6)
    g.quaternion.multiply(_q)
  })

  const tool = tools[IN_HAND[equipped] || equipped] || tools.hands
  const hold = HOLDS[equipped] || HOLDS.hands
  return (
    <group ref={ref}>
      <group rotation={hold.rot} scale={hold.scale}>
        <group position={[-hold.grip[0], -hold.grip[1], -hold.grip[2]]}>
          <group rotation={[0, hold.spin, 0]}>
            <mesh geometry={tool.metal} material={materials.metal} renderOrder={5} />
            <mesh geometry={tool.matte} material={materials.matte} renderOrder={5} />
          </group>
        </group>
      </group>
    </group>
  )
}

/** Price plaques under the shelf tools; redrawn only when the owned list changes. */
function Plaques({ geometry }) {
  const texSize = useQuality((s) => s.settings.texSize)
  const plaques = useDisposable(() => {
    const h = Math.min(texSize, 1000)
    const map = canvasTexture(Math.round((h / TOOLS.length) * 2), h, () => {})
    return { map, material: new MeshBasicMaterial({ map, transparent: true }) }
  }, [texSize])

  useLayoutEffect(() => {
    const draw = (tools) =>
      plaques.map.redraw((ctx, w, h) =>
        drawPricePlaques(ctx, w, h, TOOLS.map((t) => ({ ...t, owned: tools.includes(t.id) }))),
      )
    draw(useRun.getState().tools)
    return useRun.subscribe((s, prev) => {
      if (s.tools !== prev.tools) draw(s.tools)
    })
  }, [plaques])

  return <mesh geometry={geometry} material={plaques.material} />
}

/**
 * The Gilded Keep's Treasure Hall: a fixed pool of 40,000 coins, played in first
 * person. Lazy-loaded with the stage chunk; everything is disposed on unmount.
 */
export default function KeepStage() {
  // Lay out the chosen map first: every builder below reads the layout. The stage is
  // keyed by map in GameCanvas, so the map never changes while this is mounted.
  useState(() => configureMap(useGame.getState().modeId))
  const bodyRef = useRef(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const settings = useQuality((s) => s.settings)
  const reflective = settings.name !== 'low'
  // Multiplayer stage room (null offline, or if the connection drops mid-run).
  useNet((s) => s.roomVersion)
  const room = getStage()

  const models = useDisposable(
    () => ({
      walls: buildWalls(),
      floor: buildFloor(),
      bedTop: buildBedTop(),
      hall: buildHall(!reflective),
      glow: buildHallGlow(),
      chest: buildChest(),
      lid: buildChestLid(),
      hoard: buildChestHoard(),
      rack: buildRack(),
      plaques: buildPlaques(),
    }),
    [reflective],
  )
  const tools = useDisposable(
    () => ({
      ...Object.fromEntries(TOOLS.map((t) => [t.id, buildTool(t.id)])),
      // The Whirl-Vac as worn: tank on the back, wand in the hand, hose between them.
      vacPack: buildTool('vacPack'),
      vacStraps: buildTool('vacStraps'),
      vacWand: buildTool('vacWand'),
      hose: buildTool('hose'),
    }),
    [],
  )
  const coin = useDisposable(() => buildFieldCoin(reflective ? 12 : 6), [reflective])
  // Round coin faces come from a small texture cut out with alphaTest.
  const coinMaterial = useDisposable(() => {
    const map = coinFaceTexture(reflective ? 256 : 128)
    if (reflective) {
      const material = new MeshStandardMaterial({ map, alphaTest: 0.5, metalness: 0.7, roughness: 0.38, emissive: '#2a1a00' })
      material.userData.map = map
      return { material, map }
    }
    // LOW: a baked shiny-gold matcap. Unlit, so it costs no more than Lambert, but the
    // coins glint like metal instead of looking flat.
    const matcap = goldMatcapTexture(128)
    const material = new MeshMatcapMaterial({ map, matcap, alphaTest: 0.5 })
    material.userData.map = map
    return { material, map, matcap }
  }, [reflective])
  const toolMaterials = useToolMaterials(reflective)

  const surfaces = useDisposable(() => {
    const brick = brickTexture(Math.min(1024, settings.texSize), { bricks: THEME.bricks, mortar: THEME.mortar })
    const flags = flagstoneTexture(Math.min(512, settings.texSize))
    const groundSize = Math.min(512, settings.texSize)
    const ground = THEME.ground === 'snow' ? snowTexture(groundSize) : THEME.ground === 'grass' ? jungleGrassTexture(groundSize) : null
    return {
      brick,
      flags,
      walls: new MeshLambertMaterial({ map: brick }),
      ground,
      floor: new MeshLambertMaterial({ map: ground || flags, color: THEME.floor }),
      // The pool floor: dark tiles that show wherever coins have been taken.
      poolFloor: new MeshLambertMaterial({ map: flags, color: THEME.poolFloor }),
    }
  }, [settings.texSize])

  const halos = useDisposable(() => {
    if (!settings.particles) return null
    const list = [...models.glow.halos, ...chestGlowSpots()]
    const positions = new Float32Array(list.length * 3)
    const sizes = new Float32Array(list.length)
    list.forEach(([x, y, z, s], i) => {
      positions.set([x, y, z], i * 3)
      sizes[i] = s
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1))
    return { geometry, material: halosMaterial((size.height * dpr) / 2, new Color(...THEME.halo)) }
  }, [settings.particles, models])

  useEffect(() => {
    const game = useGame.getState()
    useRun.getState().start(MAP.id, game.party.difficulty, getStage())
    game.setStageReady(true)
    registerDebug('player', bodyRef)
    registerDebug('run', useRun)
    return () => useRun.getState().reset()
  }, [])

  // Panels need the mouse: release mouse-look when one opens.
  useEffect(
    () =>
      useRun.subscribe((s, prev) => {
        if ((s.panel && !prev.panel) || (s.result && !prev.result)) {
          if (document.pointerLockElement) document.exitPointerLock()
        }
      }),
    [],
  )

  useEffect(() => {
    camera.far = Math.min(settings.viewDistance, 160)
    camera.fov = 70
    camera.updateProjectionMatrix()
    return () => {
      camera.fov = 55
      camera.updateProjectionMatrix()
    }
  }, [camera, settings.viewDistance])

  useFrame((state) => {
    if (halos) halos.material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <>
      {THEME.sky ? <SkyBackground kind={THEME.sky} /> : <color attach="background" args={[THEME.fog]} />}
      {THEME.weather === 'snow' && settings.particles && <Snow count={settings.name === 'high' ? 700 : 350} />}
      <fog attach="fog" args={reflective ? [THEME.fog, 35, 110] : [THEME.fog, 40, 120]} />
      <HallLighting bodyRef={bodyRef} />
      <Reflections />

      <mesh geometry={models.floor} material={surfaces.floor} receiveShadow />
      {THEME.env === 'hall' && <mesh geometry={models.walls} material={surfaces.walls} receiveShadow />}
      <mesh geometry={models.bedTop} material={surfaces.poolFloor} receiveShadow={settings.shadows} />
      <mesh geometry={models.hall} material={MATERIALS.scenery} castShadow receiveShadow />
      <mesh geometry={models.glow.geometry} material={MATERIALS.glow} />
      {halos && <points geometry={halos.geometry} material={halos.material} frustumCulled={false} />}

      <BankChest models={models} texSize={settings.texSize} />
      <ChestGuide />
      <mesh geometry={models.rack} material={MATERIALS.scenery} castShadow receiveShadow />
      <ToolDisplay tools={tools} materials={toolMaterials} />
      <Plaques geometry={models.plaques} />

      <CoinField bodyRef={bodyRef} coinGeometry={coin} coinMaterial={coinMaterial.material} room={room} />
      <Multiplayer
        kind="stage"
        bodyRef={bodyRef}
        handItem={(toolId) => <RemoteTool key={toolId} toolId={toolId} tools={tools} materials={toolMaterials} />}
        backItem={(toolId, hand) =>
          BACK[toolId] ? <RemoteBackpack key={toolId} toolId={toolId} hand={hand} tools={tools} materials={toolMaterials} /> : null
        }
      />

      <Player bodyRef={bodyRef} position={SPAWN} world={WORLD} firstPerson />
      <FirstPersonCamera bodyRef={bodyRef} initialYaw={SPAWN_YAW} canLock={canLock} />
      <HeldTool tools={tools} materials={toolMaterials} />
      <StageZones bodyRef={bodyRef} />
    </>
  )
}
