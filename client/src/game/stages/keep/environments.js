import { IcosahedronGeometry, OctahedronGeometry } from 'three'

import { CHEST, HALL, PILLARS, RACK, SPAWN } from './layout'

/**
 * The outdoor environments of maps 2 and 3, merged into the hall mesh (one draw call
 * with everything else). The castle hall of map 1 stays in models.js.
 *
 * Both stand on the same footprint: HALL is the walkable area (the player is clamped
 * to it), so cliffs, ruins and trees go just outside its edge and hide the end of the
 * world. `lite` (LOW preset) spaces the far decoration out to stay inside the budget.
 */

/** Points every `step` metres round the hall, `out` metres outside its edge. */
function perimeter(step, out, fn) {
  const x0 = HALL.minX - out
  const x1 = HALL.maxX + out
  const z0 = HALL.minZ - out
  const z1 = HALL.maxZ + out
  for (let x = x0; x < x1; x += step) {
    fn(x, z0, 'north')
    fn(x + step / 2, z1, 'south')
  }
  for (let z = z0; z < z1; z += step) {
    fn(x0, z + step / 2, 'west')
    fn(x1, z, 'east')
  }
}

const near = (x, z, px, pz, r) => Math.hypot(x - px, z - pz) < r
const pick = (k, list) => list[Math.floor(k.rand() * list.length)]

// --- Frostfang Vault: a frozen glacier basin at night -----------------------------------

const ICE = ['#cfe6f5', '#a9cbe3', '#e8f5ff', '#8fb3cf', '#bcd9ee']
const ICE_DEEP = ['#5f7f9c', '#6f90ad', '#4d6d8c', '#7d9cb8']

export function buildGlacier(k, lite) {
  const H = HALL.height
  // Jagged ice cliffs ring the basin.
  perimeter(lite ? 4.2 : 3.2, 1.6, (x, z) => {
    const h = H * (0.55 + k.rand() * 0.7)
    k.add(new IcosahedronGeometry(1, 0), pick(k, ICE), {
      p: [x, h * 0.42, z],
      r: [(k.rand() - 0.5) * 0.3, k.rand() * Math.PI, (k.rand() - 0.5) * 0.3],
      s: [1.6 + k.rand() * 1.4, h * 0.55, 1.6 + k.rand() * 1.4],
    }, 0.05)
  })
  // A taller, darker row behind them.
  perimeter(lite ? 7 : 4.6, 5, (x, z) => {
    const h = H * (0.9 + k.rand() * 0.9)
    k.add(new IcosahedronGeometry(1, 0), pick(k, ICE_DEEP), {
      p: [x, h * 0.4, z],
      r: [0, k.rand() * Math.PI, 0],
      s: [2.6 + k.rand() * 2, h * 0.55, 2.6 + k.rand() * 2],
    }, 0.05)
  })
  // Snowy mountains far away, against the aurora.
  if (!lite) {
    perimeter(22, 26, (x, z) => {
      const h = 26 + k.rand() * 22
      k.cone(14 + k.rand() * 8, h, 6, k.rand() > 0.5 ? '#dce9f5' : '#b8cde0', { p: [x, h / 2 - 2, z], r: [0, k.rand() * 3, 0] }, 0.04)
    })
  }

  // Snow drifts along the edge of the basin (low enough to walk over).
  perimeter(lite ? 8 : 5, -1.4, (x, z) => {
    if (near(x, z, RACK.x, RACK.z, 7) || near(x, z, CHEST.x, CHEST.z, 5) || near(x, z, SPAWN[0], SPAWN[2], 4)) return
    k.add(new IcosahedronGeometry(1, 1), '#f4faff', {
      p: [x, 0.05, z],
      r: [0, k.rand() * 3, 0],
      s: [2.2 + k.rand() * 1.8, 0.35 + k.rand() * 0.35, 1.6 + k.rand() * 1.2],
    }, 0.03)
  })

  // Ice spires where the castle had pillars (same collision boxes).
  for (const p of PILLARS) {
    k.add(new IcosahedronGeometry(1.1, 0), '#8fb3cf', { p: [p.x, 0.3, p.z], s: [1.3, 0.7, 1.3] }, 0.05)
    k.add(new OctahedronGeometry(1), '#bfe6ff', { p: [p.x, 4.2, p.z], s: [0.85, 4.6, 0.85], r: [0, k.rand(), 0] }, 0.04)
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2 + k.rand()
      const hh = 1.2 + k.rand() * 1.6
      k.add(new OctahedronGeometry(1), '#d9f2ff', {
        p: [p.x + Math.cos(a) * 0.9, hh, p.z + Math.sin(a) * 0.9],
        s: [0.3, hh, 0.3],
        r: [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35],
      }, 0.04)
    }
  }

  // Frozen pines in the corners of the basin.
  const pines = [
    [HALL.minX + 3, HALL.minZ + 3],
    [HALL.minX + 3, HALL.maxZ - 3],
    [HALL.maxX - 3, HALL.minZ + 3],
    [HALL.maxX - 3, HALL.maxZ - 3],
    [HALL.minX + 6.5, HALL.maxZ - 2.5],
    [HALL.maxX - 6.5, HALL.minZ + 2.5],
  ]
  for (const [x, z] of pines) {
    if (near(x, z, CHEST.x, CHEST.z, 4)) continue
    k.cyl(0.16, 0.22, 1.2, 6, '#5a4a3a', { p: [x, 0.6, z] })
    ;[[1.5, 1.8, 1.6], [1.15, 1.6, 2.6], [0.75, 1.3, 3.5]].forEach(([r, h, y], i) => {
      k.cone(r, h, 8, i % 2 ? '#e9f4f0' : '#9fc4b8', { p: [x, y, z] }, 0.06)
    })
  }
}

// --- Emerald Grotto: jungle temple ruins in daylight ------------------------------------

const STONE = ['#8a8f78', '#7c826b', '#959a82', '#6f7461', '#a0a58c']
const MOSS = ['#4f8a3f', '#3f7a35', '#5f9a48']
const LEAVES = ['#3f8f3a', '#2f7a33', '#4fa046', '#5aa84a', '#367f36']

/** Torch posts along the ruins: { x, z } (flames go in the glow mesh). */
export function jungleTorches() {
  const list = []
  for (let i = 0; i < PILLARS.length; i += 1) {
    const p = PILLARS[i]
    if (p.x === 0) continue
    list.push({ x: p.x + (p.x < 0 ? 2.2 : -2.2), z: p.z + (p.z < 0 ? -1.6 : 1.6) })
  }
  return list
}

export const TORCH_FLAME_Y = 2.15

export function buildJungle(k, lite) {
  const H = HALL.height
  // Ruined temple walls just outside the edge, with gaps and mossy tops.
  perimeter(lite ? 4.5 : 3.5, 0.45, (x, z, side) => {
    if (k.rand() < 0.18) return
    const along = side === 'north' || side === 'south'
    const len = 2.6 + k.rand() * 2.2
    const h = 1.6 + k.rand() * 3.2
    const c = pick(k, STONE)
    k.box(along ? len : 1.0, h, along ? 1.0 : len, c, { p: [x, h / 2, z] }, 0.06)
    k.box(along ? len + 0.1 : 1.15, 0.22, along ? 1.15 : len + 0.1, pick(k, MOSS), { p: [x, h + 0.08, z] }, 0.1)
  })
  // Stepped temple towers in the corners.
  for (const [x, z] of [
    [HALL.minX - 1, HALL.minZ - 1],
    [HALL.minX - 1, HALL.maxZ + 1],
    [HALL.maxX + 1, HALL.minZ - 1],
    [HALL.maxX + 1, HALL.maxZ + 1],
  ]) {
    ;[[8, 2], [6.2, 2], [4.4, 2], [2.8, 1.6]].reduce((y, [s, h]) => {
      k.box(s, h, s, pick(k, STONE), { p: [x, y + h / 2, z] }, 0.05)
      k.box(s + 0.2, 0.2, s + 0.2, pick(k, MOSS), { p: [x, y + h, z] }, 0.1)
      return y + h
    }, 0)
  }

  // Jungle trees behind the ruins.
  perimeter(lite ? 9 : 5.5, 4 + (lite ? 0 : 1.5), (x, z) => {
    const tx = x + (k.rand() - 0.5) * 2.5
    const tz = z + (k.rand() - 0.5) * 2.5
    const h = 7 + k.rand() * 5
    k.cyl(0.32, 0.55, h, 7, '#5c4630', { p: [tx, h / 2, tz] }, 0.06)
    const blobs = lite ? 2 : 3
    for (let i = 0; i < blobs; i += 1) {
      const s = 2.2 + k.rand() * 1.4
      k.add(new IcosahedronGeometry(1, 1), pick(k, LEAVES), {
        p: [tx + (k.rand() - 0.5) * 2.4, h + (k.rand() - 0.2) * 1.6, tz + (k.rand() - 0.5) * 2.4],
        s: [s, s * 0.75, s],
      }, 0.08)
    }
  })
  // A second, taller canopy line far behind (MEDIUM/HIGH).
  if (!lite) {
    perimeter(9, 12, (x, z) => {
      const h = 12 + k.rand() * 6
      k.cyl(0.45, 0.7, h, 6, '#4e3b28', { p: [x, h / 2, z] })
      const s = 3.6 + k.rand() * 2
      k.add(new IcosahedronGeometry(1, 1), pick(k, LEAVES), { p: [x, h + 1, z], s: [s, s * 0.7, s] }, 0.08)
    })
  }

  // Broken temple columns where the castle had pillars (same collision boxes).
  for (const p of PILLARS) {
    const h = 2.4 + k.rand() * (H - 6)
    k.box(2.0, 0.5, 2.0, pick(k, STONE), { p: [p.x, 0.25, p.z] }, 0.05)
    k.cyl(0.66, 0.72, h, 12, pick(k, STONE), { p: [p.x, 0.5 + h / 2, p.z] }, 0.05)
    k.cyl(0.74, 0.7, 0.3, 12, pick(k, MOSS), { p: [p.x, 0.55 + h, p.z] }, 0.1)
    // Vines down the shaft.
    for (let i = 0; i < 3; i += 1) {
      const a = k.rand() * Math.PI * 2
      const len = h * (0.4 + k.rand() * 0.5)
      k.box(0.12, len, 0.06, pick(k, MOSS), { p: [p.x + Math.cos(a) * 0.7, 0.5 + h - len / 2, p.z + Math.sin(a) * 0.7], r: [0, -a, 0] }, 0.1)
    }
    // Ferns at the foot.
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + k.rand()
      k.cone(0.35, 0.9 + k.rand() * 0.5, 4, pick(k, LEAVES), {
        p: [p.x + Math.cos(a) * 1.2, 0.45, p.z + Math.sin(a) * 1.2],
        r: [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4],
      }, 0.15)
    }
  }

  // Torch posts (the flames are in the glow mesh).
  for (const t of jungleTorches()) {
    k.cyl(0.08, 0.11, 1.9, 6, '#4a3624', { p: [t.x, 0.95, t.z] })
    k.cyl(0.22, 0.12, 0.25, 8, '#6f7461', { p: [t.x, 1.95, t.z] })
  }
}
