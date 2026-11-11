import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  MeshBasicMaterial,
  Matrix4,
  Object3D,
  Plane,
  PlaneGeometry,
  PointsMaterial,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'

import { LAYER, POOL_FLOOR, applyTake, generatePool, planTake, stackTopY } from '@shared/pool.js'

import { sfx } from '../../../state/audio'
import { input, isTouchDevice } from '../../../state/input'
import { useQuality } from '../../../state/quality'
import { useRun } from '../../../state/run'
import { GRAB_REACH, TOOLS, grabInterval, grabSize } from '../../../state/stageContent'
import { mulberry32 } from '../../lib/kit'
import { canvasTexture } from '../../lib/textures'
import { useDisposable } from '../../lib/resources'
import { firefliesMaterial } from '../../lib/shaders'
import Goblins from './Goblins'
import { BED_TOP, CHEST_MOUTH, FIELD, MAP, setLivePool } from './layout'

const CHUNKS_X = 6
const CHUNKS_Z = 3
const FLY_POOL = 64
/** Most coins lit up white at once to show what the next grab will take. */
const HIGHLIGHT_MAX = 24
const FLY_TO_PLAYER_MS = 420
const FLY_TO_CHEST_MS = 520
const BANK_STREAM_S = 0.055
const BURST_POOL = 96
/**
 * LOW only: coin chunks further than this from the camera are drawn as flat round coins
 * (2 triangles each instead of 16). From that far a coin's face is all you can see, so
 * the whole pool stays visible without the triangle cost.
 */
const LOW_NEAR_DISTANCE = 28

// Scratch objects: allocated once, reused by every grab and every frame.
const _dummy = new Object3D()
const _hidden = new Matrix4().makeScale(0, 0, 0)
const _color = new Color()
const _ndc = new Vector2()
const _ray = new Raycaster()
const _plane = new Plane(new Vector3(0, 1, 0), -BED_TOP)
const _hit = new Vector3()
const _from = new Vector3()
const _fwd = new Vector3()

/**
 * Client view of the shared pool: the stacks plus which chunk/instance draws each
 * stack's top coin. One InstancedMesh per chunk so the camera can cull.
 */
function createView() {
  const pool = generatePool(MAP)
  // Aim at the average height of the gold on this map.
  _plane.constant = -(POOL_FLOOR + (MAP.coins / MAP.cells) * LAYER)
  const chunkW = (FIELD.maxX - FIELD.minX) / CHUNKS_X
  const chunkD = (FIELD.maxZ - FIELD.minZ) / CHUNKS_Z
  const chunkOf = new Uint8Array(pool.count)
  const slotOf = new Uint16Array(pool.count)
  const chunks = Array.from({ length: CHUNKS_X * CHUNKS_Z }, (_, i) => ({
    cx: FIELD.minX + ((i % CHUNKS_X) + 0.5) * chunkW,
    cz: FIELD.minZ + (Math.floor(i / CHUNKS_X) + 0.5) * chunkD,
    cells: [],
    left: 0,
    mesh: null,
    /** LOW only: the same coins as flat quads, for when the chunk is far away. */
    far: null,
    dirty: false,
  }))
  for (let i = 0; i < pool.count; i += 1) {
    const ci = Math.min(CHUNKS_X - 1, Math.floor((pool.x[i] - FIELD.minX) / chunkW))
    const cj = Math.min(CHUNKS_Z - 1, Math.floor((pool.z[i] - FIELD.minZ) / chunkD))
    const chunk = chunks[cj * CHUNKS_X + ci]
    chunkOf[i] = cj * CHUNKS_X + ci
    slotOf[i] = chunk.cells.length
    chunk.cells.push(i)
  }
  return { pool, chunks, chunkOf, slotOf }
}

/** Places the top coin of one stack (or hides it when the stack is empty). */
function drawCell(view, i) {
  const { pool } = view
  const chunk = view.chunks[view.chunkOf[i]]
  const slot = view.slotOf[i]
  const stack = pool.stacks[i]
  if (stack === 0) {
    chunk.mesh.setMatrixAt(slot, _hidden)
    chunk.far?.setMatrixAt(slot, _hidden)
  } else {
    const s = i * 4
    _dummy.position.set(pool.x[i], stackTopY(stack) - 0.03, pool.z[i])
    _dummy.rotation.set((pool.seeds[s + 1] - 0.5) * 0.5, pool.seeds[s + 2] * Math.PI * 2, (pool.seeds[s + 3] - 0.5) * 0.5)
    _dummy.scale.setScalar(0.92 + pool.seeds[s] * 0.2)
    _dummy.updateMatrix()
    chunk.mesh.setMatrixAt(slot, _dummy.matrix)
    chunk.far?.setMatrixAt(slot, _dummy.matrix)
  }
  chunk.dirty = true
}

function redrawCells(view, cells) {
  for (const i of cells) drawCell(view, i)
  for (const c of view.chunks) {
    if (!c.dirty) continue
    let left = 0
    for (const i of c.cells) if (view.pool.stacks[i]) left += 1
    c.left = left
    c.mesh.instanceMatrix.needsUpdate = true
    if (c.far) c.far.instanceMatrix.needsUpdate = true
    c.dirty = false
  }
}

const poolTotal = (pool) => pool.stacks.reduce((a, b) => a + b, 0)

/**
 * The coin pool: click/tap/hold to grab, coins flying to you and into the chest,
 * sparkle bursts, Lodestone pulls, and the goblin helpers.
 *
 * Offline it runs the rules locally. With a stage `room` (multiplayer) it predicts
 * your grab, sends it to the server, applies everyone's confirmed grabs and undoes
 * whatever the server rejected.
 */
export function CoinField({ bodyRef, coinGeometry, coinMaterial, room = null }) {
  const settings = useQuality((s) => s.settings)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const view = useMemo(() => createView(), [])
  const chunkRefs = useRef([])
  const farRefs = useRef([])
  const highlightRef = useRef(null)
  /** A soft white disc, drawn flat over the coins you are about to take. */
  const highlight = useDisposable(() => {
    const map = canvasTexture(64, 64, (ctx, w) => {
      const g = ctx.createRadialGradient(w / 2, w / 2, w * 0.12, w / 2, w / 2, w / 2)
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(0.78, 'rgba(255,255,255,0.8)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, w)
    })
    const geometry = new PlaneGeometry(0.82, 0.82)
    geometry.rotateX(-Math.PI / 2)
    const material = new MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0.7, toneMapped: false })
    return { map, geometry, material }
  }, [])
  const lod = settings.name === 'low'
  /** A flat round coin: just the top face of the full coin. */
  const flatCoin = useDisposable(() => {
    if (!lod) return null
    const g = new PlaneGeometry(0.72, 0.72)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0.04, 0)
    return g
  }, [lod])
  const flyRef = useRef(null)
  const burstRef = useRef(null)

  /** Flying coins, 9 floats per slot: from xyz, to xyz, start, duration, toPlayer. */
  const fly = useMemo(() => ({ d: new Float32Array(FLY_POOL * 9).fill(-1), next: 0, streamT: 0 }), [])
  const burst = useMemo(() => ({ v: new Float32Array(BURST_POOL * 3), age: new Float32Array(BURST_POOL).fill(9), next: 0 }), [])

  const sparkles = useDisposable(() => {
    if (!settings.particles) return null
    const rand = mulberry32(5)
    const n = settings.name === 'high' ? 160 : 90
    const positions = new Float32Array(n * 3)
    const seeds = new Float32Array(n)
    for (let i = 0; i < n; i += 1) {
      positions.set(
        [FIELD.minX + rand() * (FIELD.maxX - FIELD.minX), BED_TOP + 0.3 + rand() * 1.6, FIELD.minZ + rand() * (FIELD.maxZ - FIELD.minZ)],
        i * 3,
      )
      seeds[i] = rand()
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1))
    return { geometry, material: firefliesMaterial((size.height * dpr) / 2) }
  }, [settings.particles, settings.name])

  const bursts = useDisposable(() => {
    if (!settings.particles) return null
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(BURST_POOL * 3).fill(-999), 3))
    const material = new PointsMaterial({
      color: '#ffe38a',
      size: 0.13,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    return { geometry, material }
  }, [settings.particles])

  /** Solo goblins take coins through this (online the server does it). */
  const takeLocal = useCallback(
    (cells, counts) => {
      const n = applyTake(view.pool, cells, counts)
      redrawCells(view, cells)
      return n
    },
    [view],
  )

  /** Teammates banking: coins hop from them into the chest, a few times a second. */
  const remoteBank = useMemo(() => ({ t: 0 }), [])
  const bankVisitor = useMemo(
    () => (p, id) => {
      if (!room || id === room.sessionId || !p.banking || p.bag <= 0 || !fly.spawn) return
      fly.spawn(
        p.x + (Math.random() - 0.5) * 0.3,
        p.y + 0.2,
        p.z + (Math.random() - 0.5) * 0.3,
        CHEST_MOUTH[0] + (Math.random() - 0.5) * 0.5,
        CHEST_MOUTH[1] - 0.5,
        CHEST_MOUTH[2] + (Math.random() - 0.5) * 0.9,
        FLY_TO_CHEST_MS,
        false,
      )
    },
    [room, fly],
  )

  useLayoutEffect(() => {
    view.chunks.forEach((c, i) => {
      c.mesh = chunkRefs.current[i]
      c.far = lod ? farRefs.current[i] : null
      c.cells.forEach((cell, slot) => {
        const tint = _color.setScalar(0.82 + view.pool.seeds[cell * 4 + 1] * 0.3)
        c.mesh.setColorAt(slot, tint)
        c.far?.setColorAt(slot, tint)
      })
      c.mesh.instanceColor.needsUpdate = true
      if (c.far) c.far.instanceColor.needsUpdate = true
    })
    redrawCells(view, Array.from({ length: view.pool.count }, (_, i) => i))
    view.chunks.forEach((c) => {
      c.mesh.computeBoundingSphere()
      c.far?.computeBoundingSphere()
    })
    highlightRef.current.count = 0
    for (let i = 0; i < FLY_POOL; i += 1) flyRef.current.setMatrixAt(i, _hidden)
    flyRef.current.instanceMatrix.needsUpdate = true
    setLivePool(view.pool)
    if (!room) useRun.setState({ poolLeft: poolTotal(view.pool) })
    return () => setLivePool(null)
  }, [view, room, lod, flatCoin])

  // --- Grabbing: pointer input, timers and network (never inside useFrame) ----------
  useEffect(() => {
    const el = gl.domElement
    const pointer = { down: false, touch: false, x: 0, y: 0, sx: 0, sy: 0, t0: 0, moved: false, last: 0 }

    const setNdc = (e) => {
      if (document.pointerLockElement === el) {
        pointer.x = 0
        pointer.y = 0
        return
      }
      const rect = el.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }

    const spawnFly = (sx, sy, sz, tx, ty, tz, ms, toPlayer) => {
      fly.d.set([sx, sy, sz, tx, ty, tz, performance.now(), ms, toPlayer ? 1 : 0], fly.next * 9)
      fly.next = (fly.next + 1) % FLY_POOL
    }
    fly.spawn = spawnFly

    const spawnBurst = (x, y, z) => {
      const geo = burstRef.current?.geometry
      if (!geo) return
      const pos = geo.attributes.position
      for (let j = 0; j < 5; j += 1) {
        const i = burst.next
        burst.next = (burst.next + 1) % BURST_POOL
        pos.setXYZ(i, x, y + 0.1, z)
        const a = Math.random() * Math.PI * 2
        burst.v.set([Math.cos(a) * 1.4, 2.2 + Math.random() * 1.6, Math.sin(a) * 1.4], i * 3)
        burst.age[i] = 0
      }
    }

    /** Visuals for a take: coins fly to `target` (another player) or into my bag. */
    const showTake = (cells, counts, target) => {
      // Your own grab is a show; a teammate's is just a few coins quietly moving.
      const cap = target ? 3 : 10
      let shown = 0
      for (let k = 0; k < cells.length && shown < cap; k += 1) {
        const i = cells[k]
        const y = stackTopY(view.pool.stacks[i]) // called before the take is applied
        for (let n = 0; n < counts[k] && shown < cap; n += 1) {
          if (target) spawnFly(view.pool.x[i], y, view.pool.z[i], target.x, target.y + 0.6, target.z, FLY_TO_PLAYER_MS, false)
          else spawnFly(view.pool.x[i], y, view.pool.z[i], 0, 0, 0, FLY_TO_PLAYER_MS + shown * 25, true)
          shown += 1
        }
        if (!target && k < 3) spawnBurst(view.pool.x[i], y, view.pool.z[i])
      }
    }

    /** Multiplayer: our grabs the server hasn't answered yet, by seq. */
    const pendingTakes = new Map()

    const toolNow = () => {
      const run = useRun.getState()
      return TOOLS.find((t) => t.id === run.equipped) || TOOLS[0]
    }

    const grabAround = (px, pz, tool) => {
      const run = useRun.getState()
      if (run.result) return 0
      const room0 = run.room()
      if (room0 <= 0) {
        run.showHint('full')
        return 0
      }
      const plan = planTake(view.pool, px, pz, tool.radius, Math.min(room0, grabSize(tool, run.levels)))
      if (!plan.cells.length) return 0
      showTake(plan.cells, plan.counts, null)
      const n = applyTake(view.pool, plan.cells, plan.counts)
      redrawCells(view, plan.cells)
      sfx('coin', n)
      if (room) {
        const seq = run.predict(n)
        pendingTakes.set(seq, plan)
        room.send('grab', { seq, x: px, z: pz, cells: plan.cells, counts: plan.counts })
      } else {
        run.addToBag(n)
      }
      return n
    }

    /** `center`: aim at the crosshair (the COLLECT button) instead of the pointer. */
    const grabAtPointer = (center = false) => {
      const body = bodyRef.current
      if (!body) return
      const tool = toolNow()
      if (tool.passive) return
      _ndc.set(center ? 0 : pointer.x, center ? 0 : pointer.y)
      _ray.setFromCamera(_ndc, camera)
      if (!_ray.ray.intersectPlane(_plane, _hit)) return
      const pad = tool.radius
      if (_hit.x < FIELD.minX - pad || _hit.x > FIELD.maxX + pad || _hit.z < FIELD.minZ - pad || _hit.z > FIELD.maxZ + pad) return
      const p = body.translation()
      if (Math.hypot(_hit.x - p.x, _hit.z - p.z) > GRAB_REACH) {
        useRun.getState().showHint('far')
        return
      }
      grabAround(_hit.x, _hit.z, tool)
    }

    const interval = () => grabInterval(toolNow(), useRun.getState().levels)

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      setNdc(e)
      pointer.down = true
      pointer.touch = e.pointerType !== 'mouse'
      pointer.sx = e.clientX
      pointer.sy = e.clientY
      pointer.t0 = performance.now()
      pointer.moved = false
      if (!pointer.touch) {
        pointer.last = performance.now()
        grabAtPointer()
      }
    }
    const onMove = (e) => {
      setNdc(e)
      if (!pointer.down) return
      if (Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy) > 12) pointer.moved = true
    }
    const onUp = (e) => {
      if (!pointer.down) return
      if (pointer.touch && !pointer.moved && performance.now() - pointer.t0 < 350) {
        setNdc(e)
        grabAtPointer()
      }
      pointer.down = false
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)

    let collectLast = 0
    const holdTimer = setInterval(() => {
      if (input.collect) {
        const t = performance.now()
        if (t - collectLast >= interval()) {
          collectLast = t
          grabAtPointer(true)
        }
        return
      }
      if (!pointer.down) return
      const now = performance.now()
      if (pointer.touch && (pointer.moved || now - pointer.t0 < 220)) return
      if (now - pointer.last >= interval()) {
        pointer.last = now
        grabAtPointer()
      }
    }, 33)

    const touchAim = isTouchDevice()
    // White highlight: which coins the next grab would take. Ten times a second, not per frame.
    const highlightMesh = highlightRef.current
    const previewTimer = setInterval(() => {
      const mesh = highlightRef.current
      if (!mesh) return
      const body = bodyRef.current
      const run = useRun.getState()
      const tool = toolNow()
      if (!body || tool.passive || run.result || run.panel || run.room() <= 0) {
        mesh.count = 0
        return
      }
      // Phones aim with the crosshair (COLLECT); a mouse aims at the pointer.
      _ndc.set(touchAim ? 0 : pointer.x, touchAim ? 0 : pointer.y)
      _ray.setFromCamera(_ndc, camera)
      if (!_ray.ray.intersectPlane(_plane, _hit)) {
        mesh.count = 0
        return
      }
      const p = body.translation()
      const f = view.pool.field
      if (
        _hit.x < f.minX - tool.radius ||
        _hit.x > f.maxX + tool.radius ||
        _hit.z < f.minZ - tool.radius ||
        _hit.z > f.maxZ + tool.radius ||
        Math.hypot(_hit.x - p.x, _hit.z - p.z) > GRAB_REACH
      ) {
        mesh.count = 0
        return
      }
      const plan = planTake(view.pool, _hit.x, _hit.z, tool.radius, Math.min(run.room(), grabSize(tool, run.levels)))
      const n = Math.min(plan.cells.length, HIGHLIGHT_MAX)
      for (let k = 0; k < n; k += 1) {
        const i = plan.cells[k]
        _dummy.position.set(view.pool.x[i], stackTopY(view.pool.stacks[i]) + 0.035, view.pool.z[i])
        _dummy.rotation.set(0, 0, 0)
        _dummy.scale.setScalar(1)
        _dummy.updateMatrix()
        mesh.setMatrixAt(k, _dummy.matrix)
      }
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
    }, 90)

    let passiveLast = 0
    const passiveTimer = setInterval(() => {
      const tool = toolNow()
      const body = bodyRef.current
      if (!tool.passive || !body) return
      const now = performance.now()
      if (now - passiveLast < interval()) return
      passiveLast = now
      const p = body.translation()
      grabAround(p.x, p.z, tool)
    }, 100)

    // Multiplayer: authoritative pool, everyone's grabs, and corrections.
    const offs = []
    if (room) {
      offs.push(
        room.onMessage('pool', ({ stacks }) => {
          // Authoritative snapshot, then our unanswered grabs on top (they come after it).
          const next = Uint8Array.from(stacks)
          for (const t of pendingTakes.values()) applyTake({ stacks: next }, t.cells, t.counts)
          const changed = []
          for (let i = 0; i < view.pool.count; i += 1) {
            if (view.pool.stacks[i] !== next[i]) changed.push(i)
          }
          view.pool.stacks.set(next)
          if (changed.length) redrawCells(view, changed)
        }),
      )
      offs.push(
        room.onMessage('taken', ({ by, seq, cells, counts }) => {
          if (by === room.sessionId) {
            pendingTakes.delete(seq) // already applied when predicted
            return
          }
          const target = by !== 'sprites' ? room.state?.players?.get(by) : null
          if (target) showTake(cells, counts, target)
          applyTake(view.pool, cells, counts)
          redrawCells(view, cells)
        }),
      )
      offs.push(
        room.onMessage('rejected', ({ seq, cells, counts }) => {
          // The server didn't accept part of our prediction: put those coins back.
          pendingTakes.delete(seq)
          for (let k = 0; k < cells.length; k += 1) view.pool.stacks[cells[k]] += counts[k]
          redrawCells(view, cells)
        }),
      )
      room.send('sync') // handlers are ready: ask for the current pool
    }

    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      clearInterval(holdTimer)
      clearInterval(previewTimer)
      highlightMesh.count = 0
      clearInterval(passiveTimer)
      offs.forEach((off) => off?.())
    }
  }, [gl, camera, view, fly, burst, bodyRef, room])

  useLayoutEffect(() => {
    if (sparkles) sparkles.material.uniforms.uScale.value = (size.height * dpr) / 2
  }, [sparkles, size.height, dpr])

  // --- Per-frame animation only (matrices, buffers, uniforms; no store writes) -------
  useFrame((state, delta) => {
    const now = performance.now()
    const t = state.clock.elapsedTime
    if (sparkles) sparkles.material.uniforms.uTime.value = t
    const run = useRun.getState()

    for (const c of view.chunks) {
      if (!c.mesh) continue
      if (!c.left) {
        c.mesh.visible = false
        if (c.far) c.far.visible = false
      } else if (!c.far) {
        c.mesh.visible = true
      } else {
        const dx = camera.position.x - c.cx
        const dz = camera.position.z - c.cz
        const near = dx * dx + dz * dz < LOW_NEAR_DISTANCE * LOW_NEAR_DISTANCE
        c.mesh.visible = near
        c.far.visible = !near
      }
    }

    // Coins stream one by one from you into the chest while you bank.
    if (run.banking && run.bag > 0 && fly.spawn) {
      fly.streamT += delta
      while (fly.streamT >= BANK_STREAM_S) {
        fly.streamT -= BANK_STREAM_S
        sfx('deposit')
        camera.getWorldDirection(_fwd)
        _from.copy(camera.position).addScaledVector(_fwd, 1.3)
        _from.y -= 0.85
        fly.spawn(
          _from.x + (Math.random() - 0.5) * 0.3,
          _from.y,
          _from.z + (Math.random() - 0.5) * 0.3,
          CHEST_MOUTH[0] + (Math.random() - 0.5) * 0.5,
          CHEST_MOUTH[1] - 0.5,
          CHEST_MOUTH[2] + (Math.random() - 0.5) * 0.9,
          FLY_TO_CHEST_MS,
          false,
        )
      }
    } else {
      fly.streamT = 0
    }
    if (room) {
      remoteBank.t += delta
      if (remoteBank.t > 0.14) {
        remoteBank.t = 0
        room.state?.players?.forEach(bankVisitor)
      }
    }

    const flyMesh = flyRef.current
    if (flyMesh) {
      camera.getWorldDirection(_fwd)
      let changed = false
      for (let i = 0; i < FLY_POOL; i += 1) {
        const k = i * 9
        const start = fly.d[k + 6]
        if (start < 0) continue
        const u = (now - start) / fly.d[k + 7]
        changed = true
        if (u >= 1) {
          fly.d[k + 6] = -1
          flyMesh.setMatrixAt(i, _hidden)
          continue
        }
        let tx = fly.d[k + 3]
        let ty = fly.d[k + 4]
        let tz = fly.d[k + 5]
        if (fly.d[k + 8] === 1) {
          tx = camera.position.x + _fwd.x * 1.0
          ty = camera.position.y - 0.75
          tz = camera.position.z + _fwd.z * 1.0
        }
        const e = u * u * (3 - 2 * u)
        _dummy.position.set(
          fly.d[k] + (tx - fly.d[k]) * e,
          fly.d[k + 1] + (ty - fly.d[k + 1]) * e + Math.sin(u * Math.PI) * 1.1,
          fly.d[k + 2] + (tz - fly.d[k + 2]) * e,
        )
        _dummy.rotation.set(Math.PI / 2 + u * 3, u * 9, 0)
        _dummy.scale.setScalar(fly.d[k + 8] === 1 ? 1 - u * 0.85 : 0.55)
        _dummy.updateMatrix()
        flyMesh.setMatrixAt(i, _dummy.matrix)
      }
      if (changed) flyMesh.instanceMatrix.needsUpdate = true
    }

    const b = burstRef.current
    if (b) {
      const pos = b.geometry.attributes.position
      let live = false
      for (let i = 0; i < BURST_POOL; i += 1) {
        if (burst.age[i] > 0.8) continue
        burst.age[i] += delta
        burst.v[i * 3 + 1] -= 7 * delta
        pos.setXYZ(i, pos.getX(i) + burst.v[i * 3] * delta, pos.getY(i) + burst.v[i * 3 + 1] * delta, pos.getZ(i) + burst.v[i * 3 + 2] * delta)
        if (burst.age[i] > 0.8) pos.setY(i, -999)
        live = true
      }
      if (live) pos.needsUpdate = true
    }
  })

  return (
    <>
      {view.chunks.map((c, i) => (
        <instancedMesh
          key={i}
          ref={(m) => {
            chunkRefs.current[i] = m
          }}
          args={[coinGeometry, coinMaterial, c.cells.length]}
        />
      ))}
      {flatCoin &&
        view.chunks.map((c, i) => (
          <instancedMesh
            key={`far${i}`}
            ref={(m) => {
              farRefs.current[i] = m
            }}
            args={[flatCoin, coinMaterial, c.cells.length]}
          />
        ))}
      <instancedMesh
        ref={highlightRef}
        args={[highlight.geometry, highlight.material, HIGHLIGHT_MAX]}
        frustumCulled={false}
        renderOrder={4}
      />
      <instancedMesh ref={flyRef} args={[coinGeometry, coinMaterial, FLY_POOL]} frustumCulled={false} />
      <Goblins room={room} pool={view.pool} takeLocal={takeLocal} fly={fly} />
      {bursts && <points ref={burstRef} geometry={bursts.geometry} material={bursts.material} frustumCulled={false} />}
      {sparkles && <points geometry={sparkles.geometry} material={sparkles.material} frustumCulled={false} />}
    </>
  )
}

export default CoinField
