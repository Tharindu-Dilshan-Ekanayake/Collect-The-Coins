import {
  CapsuleGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import { Kit } from '../../lib/kit'

/**
 * Display-quality tool models: smooth normals, many segments, separate "metal" and
 * "matte" parts so metal can use a reflective material. Each tool is ~1 m tall with
 * its origin at the base, front facing +Z. Built once per stage mount.
 */

const lathe = (points, segments = 32) => new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), segments)

/** Turned wooden handle with a knob, as a lathe profile. */
function handle(k, length, color) {
  k.add(
    lathe([
      [0.001, 0],
      [0.05, 0.01],
      [0.045, 0.08],
      [0.038, length * 0.5],
      [0.042, length - 0.12],
      [0.06, length - 0.06],
      [0.05, length - 0.01],
      [0.001, length],
    ]),
    color,
    {},
  )
}

function glove(metal, matte) {
  const leather = '#8a4b2a'
  const dark = '#5e3018'
  matte.add(new RoundedBoxGeometry(0.42, 0.42, 0.16, 4, 0.07), leather, { p: [0, 0.42, 0] })
  for (let i = 0; i < 4; i += 1) {
    const len = [0.2, 0.25, 0.24, 0.19][i]
    matte.add(new CapsuleGeometry(0.045, len, 6, 12), leather, {
      p: [-0.15 + i * 0.1, 0.68 + len / 2, 0],
      r: [0.12, 0, (i - 1.5) * -0.06],
    })
  }
  matte.add(new CapsuleGeometry(0.05, 0.17, 6, 12), leather, { p: [0.26, 0.48, 0.02], r: [0, 0, -0.75] })
  matte.add(new CylinderGeometry(0.2, 0.23, 0.2, 28), dark, { p: [0, 0.14, 0] })
  metal.add(new TorusGeometry(0.205, 0.018, 10, 40), '#ffd25a', { p: [0, 0.25, 0], r: [Math.PI / 2, 0, 0] })
  metal.add(new SphereGeometry(0.03, 12, 10), '#ffd25a', { p: [0, 0.42, 0.085] })
}

function scoop(metal, matte) {
  matte.group({ p: [0, 0.32, 0] }, (g) => handle(g, 0.7, '#a8703f'))
  metal.add(new CylinderGeometry(0.06, 0.06, 0.09, 24), '#e2b04a', { p: [0, 0.34, 0] })
  // Deep rounded scoop bowl: half of a lathe shell, mouth facing up and forward.
  metal.add(
    new LatheGeometry(
      [
        [0.001, -0.17],
        [0.08, -0.165],
        [0.15, -0.13],
        [0.2, -0.06],
        [0.22, 0.02],
        [0.215, 0.1],
      ].map(([x, y]) => new Vector2(x, y)),
      32,
      0,
      Math.PI * 1.2,
    ),
    '#e2b04a',
    { p: [0, 0.2, 0.05], r: [0.5, Math.PI * 0.4, 0] },
  )
}

function rake(metal, matte) {
  matte.group({ p: [0, 0.25, 0] }, (g) => handle(g, 0.85, '#8a5a32'))
  metal.add(new CylinderGeometry(0.055, 0.05, 0.1, 24), '#ffd25a', { p: [0, 0.27, 0] })
  metal.add(new RoundedBoxGeometry(0.78, 0.08, 0.1, 3, 0.03), '#c9ccd6', { p: [0, 0.2, 0] })
  for (let i = 0; i < 9; i += 1) {
    metal.add(new CapsuleGeometry(0.018, 0.16, 4, 10), '#c9ccd6', { p: [-0.34 + i * 0.085, 0.08, 0.02], r: [0.15, 0, 0] })
  }
}

/** The Whirl-Vac's enamel tank with its bands, carry handle, gauge and foot. */
function vacTank(metal, matte) {
  // Rounded enamel tank.
  matte.add(
    lathe([
      [0.001, 0.12],
      [0.17, 0.13],
      [0.25, 0.2],
      [0.27, 0.32],
      [0.27, 0.72],
      [0.25, 0.84],
      [0.17, 0.9],
      [0.001, 0.91],
    ]),
    '#3f9fb8',
    {},
  )
  for (const y of [0.3, 0.74]) {
    metal.add(new TorusGeometry(0.272, 0.022, 10, 48), '#e2b04a', { p: [0, y, 0], r: [Math.PI / 2, 0, 0] })
  }
  metal.add(new CylinderGeometry(0.06, 0.08, 0.08, 20), '#e2b04a', { p: [0, 0.95, 0] })
  metal.add(new TorusGeometry(0.16, 0.025, 10, 32, Math.PI), '#2e2b38', { p: [0, 0.98, 0], r: [0, Math.PI / 2, 0] })
  // Pressure gauge.
  metal.add(new CylinderGeometry(0.075, 0.075, 0.04, 24), '#e2b04a', { p: [0, 0.55, 0.27], r: [Math.PI / 2, 0, 0] })
  matte.add(new CylinderGeometry(0.06, 0.06, 0.045, 24), '#f6f1e3', { p: [0, 0.55, 0.275], r: [Math.PI / 2, 0, 0] })
  matte.add(new CylinderGeometry(0.2, 0.22, 0.12, 32), '#2e2b38', { p: [0, 0.06, 0] })
}

/** On the shelf: the tank with its hose and nozzle. */
function vac(metal, matte) {
  vacTank(metal, matte)
  // Hose and flared nozzle.
  const hose = new CatmullRomCurve3([
    new Vector3(0.22, 0.25, 0.1),
    new Vector3(0.42, 0.12, 0.2),
    new Vector3(0.55, 0.25, 0.32),
    new Vector3(0.52, 0.55, 0.36),
  ])
  matte.add(new TubeGeometry(hose, 40, 0.035, 10, false), '#2e2b38', {})
  metal.add(
    lathe([
      [0.04, 0],
      [0.045, 0.1],
      [0.07, 0.16],
      [0.11, 0.2],
    ], 24),
    '#c9ccd6',
    { p: [0.52, 0.55, 0.36], r: [-0.3, 0, -0.2] },
  )
}

/** Worn on a player's back: the tank and a hose outlet low on one side (+X). */
function vacPack(metal, matte) {
  vacTank(metal, matte)
  metal.add(new CylinderGeometry(0.06, 0.07, 0.1, 20), '#e2b04a', { p: [0.28, 0.2, 0], r: [0, 0, Math.PI / 2] })
}

/**
 * Leather shoulder straps with gold buckles, in metres around a player's upper back
 * (Spine2): over each shoulder from behind and down the chest. Fitted to the Boxity
 * avatar (torso 0.79 wide, 0.46 deep, shoulder top 0.17 above Spine2).
 */
function vacStraps(metal, matte) {
  const leather = '#6b3a1e'
  for (const x of [-0.26, 0.26]) {
    matte.add(new RoundedBoxGeometry(0.09, 0.04, 0.5, 2, 0.015), leather, { p: [x, 0.19, 0.004] })
    matte.add(new RoundedBoxGeometry(0.09, 0.34, 0.04, 2, 0.015), leather, { p: [x, 0.02, 0.252] })
    matte.add(new RoundedBoxGeometry(0.09, 0.22, 0.04, 2, 0.015), leather, { p: [x, 0.08, -0.245] })
    metal.add(new RoundedBoxGeometry(0.11, 0.055, 0.025, 2, 0.008), '#e2b04a', { p: [x, -0.06, 0.272] })
  }
}

/**
 * The Whirl-Vac's nozzle wand, held while the tank rides on your back: a grip at the top
 * (hose cuff above it), a steel tube and a wide flat nozzle with a glowing mouth. The
 * head is tilted back so the mouth faces the floor when the wand is held out in front.
 */
function vacWand(metal, matte) {
  metal.add(new CylinderGeometry(0.045, 0.052, 0.08, 18), '#c9ccd6', { p: [0, 1.06, 0] })
  matte.add(new CylinderGeometry(0.052, 0.052, 0.24, 20), '#2e2b38', { p: [0, 0.9, 0] })
  for (const y of [0.78, 1.02]) {
    metal.add(new TorusGeometry(0.053, 0.013, 8, 24), '#e2b04a', { p: [0, y, 0], r: [Math.PI / 2, 0, 0] })
  }
  metal.add(new CylinderGeometry(0.03, 0.03, 0.6, 16), '#c9ccd6', { p: [0, 0.48, 0] })
  matte.group({ p: [0, 0.18, 0], r: [1.0, 0, 0] }, (g) => {
    g.add(new CylinderGeometry(0.035, 0.085, 0.14, 18), '#3f9fb8', { p: [0, -0.02, 0] })
    g.add(new RoundedBoxGeometry(0.46, 0.09, 0.2, 3, 0.03), '#2e2b38', { p: [0, -0.12, 0] })
  })
  metal.group({ p: [0, 0.18, 0], r: [1.0, 0, 0] }, (g) => {
    g.add(new RoundedBoxGeometry(0.47, 0.025, 0.21, 2, 0.01), '#e2b04a', { p: [0, -0.075, 0] })
    g.add(new RoundedBoxGeometry(0.4, 0.02, 0.14, 2, 0.008), '#7fe9ff', { p: [0, -0.168, 0] })
  })
}

function lodestone(metal, matte) {
  const rock = new IcosahedronGeometry(0.32, 2)
  const pos = rock.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const n = 1 + 0.12 * Math.sin(x * 9.1 + y * 4.3) * Math.cos(z * 7.7 - y * 3.1)
    pos.setXYZ(i, x * n, y * n * 1.15, z * n)
  }
  rock.computeVertexNormals()
  matte.add(rock, '#3b3550', { p: [0, 0.5, 0] })
  for (const [x, y, z, s, r] of [
    [0.12, 0.72, 0.18, 0.11, 0.3],
    [-0.16, 0.6, 0.2, 0.08, -0.4],
    [0.05, 0.86, -0.05, 0.09, 0.1],
    [-0.08, 0.42, 0.27, 0.07, 0.6],
  ]) {
    metal.add(new OctahedronGeometry(s, 0), '#b9a3ff', { p: [x, y, z], r: [r, r * 2, 0], s: [1, 1.8, 1] })
  }
  metal.add(new TorusGeometry(0.25, 0.03, 12, 48), '#ffd25a', { p: [0, 0.2, 0], r: [Math.PI / 2, 0, 0] })
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2
    metal.add(new CapsuleGeometry(0.02, 0.2, 4, 8), '#ffd25a', {
      p: [Math.cos(a) * 0.24, 0.3, Math.sin(a) * 0.24],
      r: [0, -a, -0.35],
    })
  }
}

/** One straight hose segment, 1 m long along +Y and centred: stretched between two points. */
function hose(metal, matte) {
  matte.add(new CylinderGeometry(0.042, 0.042, 1, 12, 1), '#2f7f93', {})
  metal.add(new TorusGeometry(0.035, 0.009, 6, 16), '#e2b04a', { r: [Math.PI / 2, 0, 0] })
}

const BUILDERS = { hands: glove, scoop, rake, vac, lodestone, vacPack, vacStraps, vacWand, hose }

/** { metal, matte } geometries for one tool. */
export function buildTool(id) {
  const metal = new Kit(40)
  const matte = new Kit(41)
  BUILDERS[id](metal, matte)
  return { metal: metal.build(), matte: matte.build() }
}
