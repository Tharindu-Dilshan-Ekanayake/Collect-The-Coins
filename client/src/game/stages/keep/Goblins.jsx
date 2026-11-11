import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Matrix4, Object3D } from 'three'

import { GOBLIN_MAX, GOBLIN_PHASE, createGoblin, goblinCarry, stepGoblin } from '@shared/goblins.js'

import { sfx } from '../../../state/audio'
import { useRun } from '../../../state/run'
import { Kit } from '../../lib/kit'
import { MATERIALS, useDisposable } from '../../lib/resources'
import { CHEST, CHEST_MOUTH, KEEP_WORLD } from './layout'

/** Up to five goblins for each of four players. */
const CAP = GOBLIN_MAX * 4
const FULL_SACK = goblinCarry(4)
const FLY_TO_CHEST_MS = 520

const _o = new Object3D()
_o.rotation.order = 'YXZ'
const _hidden = new Matrix4().makeScale(0, 0, 0)

/** A little goblin, about 1 m tall, facing +Z: green skin, long ears, red cap, brown tunic. */
function buildGoblin() {
  const k = new Kit(611)
  const skin = '#6fbf4a'
  const dark = '#3f7a2c'
  const tunic = '#7a4a2a'
  k.box(0.12, 0.28, 0.14, dark, { p: [-0.09, 0.14, 0] })
  k.box(0.12, 0.28, 0.14, dark, { p: [0.09, 0.14, 0] })
  k.box(0.36, 0.32, 0.26, tunic, { p: [0, 0.44, 0] })
  k.box(0.38, 0.05, 0.28, '#3a2418', { p: [0, 0.32, 0] })
  k.box(0.04, 0.04, 0.02, '#ffc83a', { p: [0, 0.32, 0.145] })
  k.box(0.09, 0.28, 0.1, skin, { p: [-0.23, 0.44, 0.04], r: [-0.35, 0, 0.15] })
  k.box(0.09, 0.28, 0.1, skin, { p: [0.23, 0.44, 0.04], r: [-0.35, 0, -0.15] })
  k.box(0.32, 0.28, 0.28, skin, { p: [0, 0.76, 0.02] })
  k.cone(0.07, 0.32, 4, skin, { p: [-0.3, 0.8, 0], r: [0, 0, Math.PI / 2] })
  k.cone(0.07, 0.32, 4, skin, { p: [0.3, 0.8, 0], r: [0, 0, -Math.PI / 2] })
  k.box(0.08, 0.07, 0.02, '#ffe14a', { p: [-0.07, 0.8, 0.165] })
  k.box(0.08, 0.07, 0.02, '#ffe14a', { p: [0.07, 0.8, 0.165] })
  k.box(0.03, 0.04, 0.02, '#1a1a1a', { p: [-0.07, 0.8, 0.177] })
  k.box(0.03, 0.04, 0.02, '#1a1a1a', { p: [0.07, 0.8, 0.177] })
  k.cone(0.045, 0.12, 4, dark, { p: [0, 0.72, 0.21], r: [Math.PI / 2, 0, 0] })
  k.box(0.12, 0.025, 0.02, '#2a1a10', { p: [0, 0.66, 0.165] })
  k.cone(0.18, 0.2, 6, '#c0392b', { p: [0, 1.0, 0] })
  k.ico(0.04, '#fff1d0', { p: [0, 1.11, 0] }, 0, 0)
  return k.build()
}

/** A sack of coins, carried on the back. */
function buildSack() {
  const k = new Kit(612)
  k.ico(0.22, '#a07040', { s: [1, 0.9, 1] }, 0.06, 1)
  k.cyl(0.07, 0.09, 0.07, 6, '#5a3a20', { p: [0, 0.2, 0] })
  for (const [x, z] of [[0.04, 0.03], [-0.05, 0.0], [0.0, -0.05]]) {
    k.cyl(0.06, 0.06, 0.015, 8, '#ffc83a', { p: [x, 0.25, z], r: [0.3, 0, 0.2] })
  }
  return k.build()
}

/**
 * Goblin helpers in the hall. Online the server runs them (room.state.goblins) and
 * this only draws them; offline it also runs them with the shared rules. Everyone's
 * goblins are two InstancedMeshes, so 20 of them cost two draw calls.
 */
export function Goblins({ room, pool, takeLocal, fly }) {
  const bodyGeo = useDisposable(buildGoblin, [])
  const sackGeo = useDisposable(buildSack, [])
  const bodyRef = useRef(null)
  const sackRef = useRef(null)

  const sim = useMemo(
    () => ({
      x: new Float32Array(CAP),
      z: new Float32Array(CAP),
      ry: new Float32Array(CAP),
      sx: new Float32Array(CAP),
      sz: new Float32Array(CAP),
      sry: new Float32Array(CAP),
      phase: new Uint8Array(CAP),
      last: new Uint8Array(CAP).fill(255),
      carry: new Uint16Array(CAP),
      mine: new Uint8Array(CAP),
      init: new Uint8Array(CAP),
      stride: new Float32Array(CAP),
      active: 0,
      time: 0,
    }),
    [],
  )

  useLayoutEffect(() => {
    for (const mesh of [bodyRef.current, sackRef.current]) {
      for (let i = 0; i < CAP; i += 1) mesh.setMatrixAt(i, _hidden)
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [])

  // Solo: run the goblins here, with the same rules the server uses.
  useEffect(() => {
    if (room) return undefined
    const list = []
    const id = setInterval(() => {
      const run = useRun.getState()
      if (run.result || !run.startedAt) return
      const want = Math.min(GOBLIN_MAX, run.levels.sprites || 0)
      while (list.length < want) list.push(createGoblin(CHEST))
      list.length = want
      const ctx = {
        pool,
        chest: CHEST,
        level: run.levels.spriteSpeed || 0,
        take: takeLocal,
        bank: (n) => useRun.getState().addBanked(n),
      }
      list.forEach((g, i) => {
        stepGoblin(g, 0.1, ctx)
        sim.x[i] = g.x
        sim.z[i] = g.z
        sim.ry[i] = g.ry
        sim.phase[i] = g.phase
        sim.carry[i] = g.carry
        sim.mine[i] = 1
      })
      for (let i = list.length; i < sim.active; i += 1) sim.init[i] = 0
      sim.active = list.length
    }, 100)
    return () => clearInterval(id)
  }, [room, pool, takeLocal, sim])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    sim.time += dt
    if (room) {
      const list = room.state?.goblins
      const n = list ? Math.min(list.length, CAP) : 0
      for (let i = 0; i < n; i += 1) {
        const g = list[i]
        sim.x[i] = g.x
        sim.z[i] = g.z
        sim.ry[i] = g.ry
        sim.phase[i] = g.phase
        sim.carry[i] = g.carry
        sim.mine[i] = g.owner === room.sessionId ? 1 : 0
      }
      for (let i = n; i < sim.active; i += 1) sim.init[i] = 0
      sim.active = n
    }

    const body = bodyRef.current
    const sack = sackRef.current
    const k = 1 - Math.exp(-10 * dt)
    for (let i = 0; i < CAP; i += 1) {
      if (i >= sim.active) {
        body.setMatrixAt(i, _hidden)
        sack.setMatrixAt(i, _hidden)
        continue
      }
      if (!sim.init[i]) {
        sim.sx[i] = sim.x[i]
        sim.sz[i] = sim.z[i]
        sim.sry[i] = sim.ry[i]
        sim.last[i] = sim.phase[i]
        sim.init[i] = 1
      }
      const px = sim.sx[i]
      const pz = sim.sz[i]
      sim.sx[i] += (sim.x[i] - px) * k
      sim.sz[i] += (sim.z[i] - pz) * k
      let dr = sim.ry[i] - sim.sry[i]
      dr = Math.atan2(Math.sin(dr), Math.cos(dr))
      sim.sry[i] += dr * k
      sim.stride[i] += Math.hypot(sim.sx[i] - px, sim.sz[i] - pz) * 9

      const phase = sim.phase[i]
      // Dropping a sack: a few coins hop into the chest.
      if (phase !== sim.last[i]) {
        if (phase === GOBLIN_PHASE.drop && fly.spawn) {
          for (let c = 0; c < 4; c += 1) {
            fly.spawn(
              sim.sx[i] + (Math.random() - 0.5) * 0.3,
              KEEP_WORLD.groundAt(sim.sx[i], sim.sz[i]) + 0.8,
              sim.sz[i] + (Math.random() - 0.5) * 0.3,
              CHEST_MOUTH[0] + (Math.random() - 0.5) * 0.5,
              CHEST_MOUTH[1] - 0.5,
              CHEST_MOUTH[2] + (Math.random() - 0.5) * 0.8,
              FLY_TO_CHEST_MS + c * 70,
              false,
            )
          }
          if (sim.mine[i]) sfx('deposit')
        }
        sim.last[i] = phase
      }

      const y = KEEP_WORLD.groundAt(sim.sx[i], sim.sz[i])
      const hop = Math.abs(Math.sin(sim.stride[i])) * 0.08
      // Scooping: bobbing down into the gold. Dropping: a happy hop.
      const lean = phase === GOBLIN_PHASE.scoop ? 0.55 + Math.sin(sim.time * 12 + i) * 0.2 : 0
      const jump = phase === GOBLIN_PHASE.drop ? Math.abs(Math.sin(sim.time * 10)) * 0.15 : 0
      _o.position.set(sim.sx[i], y + hop + jump, sim.sz[i])
      _o.rotation.set(lean, sim.sry[i], 0)
      _o.scale.setScalar(1)
      _o.updateMatrix()
      body.setMatrixAt(i, _o.matrix)

      if (sim.carry[i] > 0) {
        const s = 0.8 + Math.min(1, sim.carry[i] / FULL_SACK) * 0.7
        const back = 0.24
        _o.position.set(sim.sx[i] - Math.sin(sim.sry[i]) * back, y + 0.5 + hop + jump, sim.sz[i] - Math.cos(sim.sry[i]) * back)
        _o.rotation.set(0, sim.sry[i], 0)
        _o.scale.setScalar(s)
        _o.updateMatrix()
        sack.setMatrixAt(i, _o.matrix)
      } else {
        sack.setMatrixAt(i, _hidden)
      }
    }
    body.visible = sim.active > 0
    sack.visible = sim.active > 0
    if (sim.active || body.count) {
      body.instanceMatrix.needsUpdate = true
      sack.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <instancedMesh ref={bodyRef} args={[bodyGeo, MATERIALS.scenery, CAP]} frustumCulled={false} castShadow />
      <instancedMesh ref={sackRef} args={[sackGeo, MATERIALS.scenery, CAP]} frustumCulled={false} />
    </>
  )
}

export default Goblins
