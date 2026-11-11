import {
  CylinderGeometry,
  OctahedronGeometry,
  PlaneGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { TOOLS } from '../../../state/stageContent'
import { Kit } from '../../lib/kit'
import { PALETTE as P } from '../../sceneStyle'
import { POOL_FLOOR } from '@shared/pool.js'

import { TORCH_FLAME_Y, buildGlacier, buildJungle, jungleTorches } from './environments'
import { BED_TOP, CHESTS, FIELD, HALL, MAP, OPENINGS, PILLARS, PROPS, RACK, RAILS, SCONCES, THEME, WALK_TOP } from './layout'

const IRON = '#2e2b38'
/** Chest, coin and treasure gold stays gold on every map. */
const GOLD = '#ffc83a'

/** Plane facing +Z with UVs in metres / tile, then placed. */
function worldPlane(width, height, tileU, tileV, place) {
  const g = new PlaneGeometry(width, height)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, (uv.getX(i) * width) / tileU, (uv.getY(i) * height) / tileV)
  }
  place(g)
  return g
}

/** The four inner walls in one geometry (brick texture, 4 m x 2 m per tile). */
export function buildWalls() {
  const w = HALL.maxX - HALL.minX
  const d = HALL.maxZ - HALL.minZ
  const h = HALL.height
  const parts = [
    worldPlane(w, h, 4, 2, (g) => g.translate(0, h / 2, HALL.minZ)),
    worldPlane(w, h, 4, 2, (g) => {
      g.rotateY(Math.PI)
      g.translate(0, h / 2, HALL.maxZ)
    }),
    worldPlane(d, h, 4, 2, (g) => {
      g.rotateY(Math.PI / 2)
      g.translate(HALL.minX, h / 2, 0)
    }),
    worldPlane(d, h, 4, 2, (g) => {
      g.rotateY(-Math.PI / 2)
      g.translate(HALL.maxX, h / 2, 0)
    }),
  ]
  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  return merged
}

/** Floor slabs (flagstone texture) for the whole hall. */
export function buildFloor() {
  const w = HALL.maxX - HALL.minX
  const d = HALL.maxZ - HALL.minZ
  return worldPlane(w, d, 3.2, 3.2, (g) => g.rotateX(-Math.PI / 2))
}

/** Floor of the coin pool (shows wherever coins have been taken), 2.5 m per tile. */
export function buildBedTop() {
  const w = FIELD.maxX - FIELD.minX
  const d = FIELD.maxZ - FIELD.minZ
  return worldPlane(w, d, 2.5, 2.5, (g) => {
    g.rotateX(-Math.PI / 2)
    g.translate((FIELD.minX + FIELD.maxX) / 2, POOL_FLOOR - 0.005, (FIELD.minZ + FIELD.maxZ) / 2)
  })
}

function railing(k, x0, z0, x1, z1, T) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const ry = Math.atan2(x1 - x0, z1 - z0)
  k.group({ p: [(x0 + x1) / 2, 0, (z0 + z1) / 2], r: [0, ry, 0] }, (g) => {
    g.box(0.12, 0.12, len, T.beamLight, { p: [0, 1.05, 0] })
    g.box(0.07, 0.07, len, IRON, { p: [0, 0.6, 0] })
    const posts = Math.max(2, Math.round(len / 1.6) + 1)
    for (let i = 0; i < posts; i += 1) {
      g.box(0.14, 1.1, 0.14, IRON, { p: [0, 0.55, -len / 2 + (len / (posts - 1)) * i] })
    }
  })
}

/**
 * Everything static and vertex-coloured: ceiling and beams, pillars, the bed's stone
 * kerb and gold sides, railings, wall trim, banners, sconce brackets and props.
 */
/**
 * Everything static and vertex-coloured in one mesh: the pool's kerb, walkways and
 * railings, props, and the map's surroundings (castle hall, glacier or jungle ruins).
 * `lite` (LOW) thins out far decoration.
 */
export function buildHall(lite = false) {
  const T = THEME
  const MARBLE = T.marble
  const OAK = T.beam
  const OAK_LIGHT = T.beamLight
  const TRIM = T.trim
  const k = new Kit(88)
  const w = HALL.maxX - HALL.minX
  const d = HALL.maxZ - HALL.minZ
  const h = HALL.height

  if (T.env === 'hall') {
  // Ceiling and timber beams.
  k.box(w, 0.3, d, T.ceiling, { p: [0, h + 0.15, 0] })
  for (let x = HALL.minX + 2; x < HALL.maxX; x += 4) {
    k.box(0.5, 0.6, d, OAK, { p: [x, h - 0.3, 0] }, 0.08)
  }
  for (const z of [-MAP.pillarZ, 0, MAP.pillarZ]) k.box(w, 0.55, 0.5, OAK_LIGHT, { p: [0, h - 0.85, z] }, 0.06)

  // Skirting along the walls.
  // Dark skirting with gold trim lines along every wall.
  for (const [y, hgt, c] of [[0.3, 0.6, T.skirting], [0.66, 0.12, TRIM], [3.0, 0.16, TRIM]]) {
    k.box(w, hgt, 0.3, c, { p: [0, y, HALL.minZ + 0.15] })
    k.box(w, hgt, 0.3, c, { p: [0, y, HALL.maxZ - 0.15] })
    k.box(0.3, hgt, d, c, { p: [HALL.minX + 0.15, y, 0] })
    k.box(0.3, hgt, d, c, { p: [HALL.maxX - 0.15, y, 0] })
  }

  // Cream marble pillars: plinth, round shaft, gold bands and a capital.
  const shaft = h - 2.3
  for (const p of PILLARS) {
    k.box(2.0, 0.5, 2.0, MARBLE[3], { p: [p.x, 0.25, p.z] }, 0.04)
    k.box(1.75, 0.3, 1.75, MARBLE[0], { p: [p.x, 0.65, p.z] })
    k.cyl(0.66, 0.72, shaft, 16, MARBLE[Math.abs(Math.round(p.x)) % 4], { p: [p.x, 0.8 + shaft / 2, p.z] }, 0.03)
    for (const y of [1.4, h - 2.2]) k.cyl(0.74, 0.74, 0.14, 16, TRIM, { p: [p.x, y, p.z] })
    k.cyl(0.95, 0.7, 0.6, 16, MARBLE[2], { p: [p.x, h - 1.2, p.z] })
    k.box(2.1, 0.35, 2.1, MARBLE[1], { p: [p.x, h - 0.72, p.z] })
  }
  } else if (T.env === 'glacier') {
    buildGlacier(k, lite)
  } else {
    buildJungle(k, lite)
  }

  // Coin bed: gold sides and a stone kerb round the top edge.
  const fw = FIELD.maxX - FIELD.minX
  const fd = FIELD.maxZ - FIELD.minZ
  const cx = (FIELD.minX + FIELD.maxX) / 2
  const cz = (FIELD.minZ + FIELD.maxZ) / 2
  k.box(fw, BED_TOP, 0.05, '#b8780e', { p: [cx, BED_TOP / 2, FIELD.minZ] })
  k.box(fw, BED_TOP, 0.05, '#b8780e', { p: [cx, BED_TOP / 2, FIELD.maxZ] })
  k.box(0.05, BED_TOP, fd, '#b8780e', { p: [FIELD.minX, BED_TOP / 2, cz] })
  k.box(0.05, BED_TOP, fd, '#b8780e', { p: [FIELD.maxX, BED_TOP / 2, cz] })
  k.box(fw + 0.8, 0.14, 0.4, T.kerb, { p: [cx, 0.07, FIELD.minZ - 0.2] })
  k.box(fw + 0.8, 0.14, 0.4, T.kerb, { p: [cx, 0.07, FIELD.maxZ + 0.2] })
  k.box(0.4, 0.14, fd, T.kerb, { p: [FIELD.minX - 0.2, 0.07, cz] })
  k.box(0.4, 0.14, fd, T.kerb, { p: [FIELD.maxX + 0.2, 0.07, cz] })

  // Stone walkways through the pool, with a trim line along their edges.
  for (const wk of MAP.walkways) {
    if (wk.box) {
      const [x0, x1, z0, z1] = wk.box
      const ww = x1 - x0
      const wd = z1 - z0
      k.box(ww, WALK_TOP, wd, T.walk, { p: [(x0 + x1) / 2, WALK_TOP / 2, (z0 + z1) / 2] }, 0.04)
      k.box(ww, 0.05, 0.12, TRIM, { p: [(x0 + x1) / 2, WALK_TOP + 0.01, z0 + 0.06] })
      k.box(ww, 0.05, 0.12, TRIM, { p: [(x0 + x1) / 2, WALK_TOP + 0.01, z1 - 0.06] })
    } else {
      const [x, z, r] = wk.disc
      k.cyl(r, r + 0.15, WALK_TOP, 40, T.walk, { p: [x, WALK_TOP / 2, z] }, 0.04)
      k.cyl(r + 0.05, r + 0.05, 0.05, 40, TRIM, { p: [x, WALK_TOP + 0.01, z] })
    }
  }

  // Railings (gaps are the way in) and little gold-step markers at each gap.
  for (const r of RAILS) {
    if (r.x0 !== undefined) railing(k, r.x0, r.z, r.x1, r.z, T)
    else railing(k, r.x, r.z0, r.x, r.z1, T)
  }
  const markers = [
    ...OPENINGS.north.map(([c]) => [c, FIELD.minZ - 0.45, 0]),
    ...OPENINGS.south.map(([c]) => [c, FIELD.maxZ + 0.45, 0]),
    ...OPENINGS.west.map(([c]) => [FIELD.minX - 0.45, c, Math.PI / 2]),
    ...OPENINGS.east.map(([c]) => [FIELD.maxX + 0.45, c, Math.PI / 2]),
  ]
  for (const [x, z, ry] of markers) k.box(3.0, 0.06, 0.5, TRIM, { p: [x, 0.03, z], r: [0, ry, 0] })

  // Banners between the pillars on the long walls (castle only).
  const bays = []
  if (T.env === 'hall')
  for (let i = 0; i < MAP.pillarX.length - 1; i += 1) bays.push((MAP.pillarX[i] + MAP.pillarX[i + 1]) / 2)
  for (const zSide of [-1, 1]) {
    for (const x of bays) {
      if (zSide < 0 && Math.abs(x - RACK.x) < RACK.width / 2 + 1) continue
      const z = zSide < 0 ? HALL.minZ + 0.08 : HALL.maxZ - 0.08
      const ry = zSide < 0 ? 0 : Math.PI
      k.group({ p: [x, 0, z], r: [0, ry, 0] }, (g) => {
        g.box(2.6, 0.14, 0.14, OAK, { p: [0, 8.9, 0.1] })
        g.box(2.2, 4.4, 0.05, T.banner, { p: [0, 6.65, 0.12] })
        g.box(2.2, 0.3, 0.06, TRIM, { p: [0, 4.55, 0.13] })
        g.add(new OctahedronGeometry(0.55), TRIM, { p: [0, 7.1, 0.16], s: [1, 1.25, 0.25] })
      })
    }
  }

  // Sconce brackets (the flames are in the glow mesh).
  for (const s of SCONCES) {
    k.group({ p: [s.x, s.y, s.z], r: [0, s.ry, 0] }, (g) => {
      g.box(0.16, 0.5, 0.12, IRON, { p: [0, -0.2, 0.06] })
      g.box(0.36, 0.06, 0.36, IRON, { p: [0, -0.4, 0.22] })
    })
  }

  // Props.
  for (const [x, z, ry, kind] of PROPS) {
    k.group({ p: [x, 0, z], r: [0, ry, 0] }, (g) => {
      if (kind === 'bars') {
        g.box(1.8, 0.16, 1.2, OAK, { p: [0, 0.08, 0] })
        for (let layer = 0; layer < 3; layer += 1) {
          for (let i = 0; i < 3 - layer; i += 1) {
            for (let j = 0; j < 2; j += 1) {
              g.box(0.48, 0.2, 0.26, j % 2 ? '#e8a92a' : GOLD, {
                p: [-0.5 + i * 0.52 + layer * 0.26, 0.26 + layer * 0.2, -0.2 + j * 0.4],
              })
            }
          }
        }
      } else if (kind === 'barrels') {
        for (const [bx, bz] of [[-0.45, 0], [0.45, 0.15], [0, -0.6]]) {
          g.cyl(0.42, 0.38, 0.95, 8, P.wood, { p: [bx, 0.475, bz] }, 0.08)
          for (const y of [0.2, 0.75]) g.cyl(0.44, 0.44, 0.07, 8, IRON, { p: [bx, y, bz] })
        }
      } else {
        for (const [bx, by, bz, s] of [[-0.5, 0, 0, 0.9], [0.45, 0, 0.1, 0.8], [0, 0.85, 0.05, 0.75]]) {
          g.box(s, s, s, P.woodLight, { p: [bx, by + s / 2, bz] }, 0.08)
          g.box(s + 0.04, 0.1, s + 0.04, P.woodDark, { p: [bx, by + s, bz] })
        }
      }
    })
  }

  return k.build()
}

/** Sconce flames (and the chests' glowing coin slots) as one unlit mesh + halo spots. */
export function buildHallGlow() {
  const T = THEME
  const k = new Kit(89)
  const halos = []
  for (const s of SCONCES) {
    k.group({ p: [s.x, s.y, s.z], r: [0, s.ry, 0] }, (g) => {
      g.cone(0.13, 0.4, 5, T.flame, { p: [0, -0.15, 0.22] })
      g.cone(0.07, 0.24, 5, T.flameCore, { p: [0, -0.2, 0.24] })
    })
    const fx = s.x + Math.sin(s.ry) * 0.22
    const fz = s.z + Math.cos(s.ry) * 0.22
    halos.push([fx, s.y - 0.15, fz, 2.6])
  }
  if (T.env === 'jungle') {
    for (const t of jungleTorches()) {
      k.cone(0.16, 0.5, 5, T.flame, { p: [t.x, TORCH_FLAME_Y + 0.2, t.z] })
      k.cone(0.09, 0.3, 5, T.flameCore, { p: [t.x, TORCH_FLAME_Y + 0.15, t.z] })
      halos.push([t.x, TORCH_FLAME_Y + 0.25, t.z, 3.0])
    }
  }
  if (T.accents === 'ice') {
    // Glowing crystal clusters in the corners and by the pillars.
    const spots = [
      [HALL.minX + 2.5, HALL.minZ + 4],
      [HALL.minX + 2.5, HALL.maxZ - 4],
      [HALL.maxX - 2.5, HALL.minZ + 4],
      [HALL.maxX - 2.5, HALL.maxZ - 4],
    ]
    for (const p of PILLARS) spots.push([p.x + 1.4, p.z + (p.z < 0 ? -1.2 : 1.2)])
    for (const [x, z] of spots) {
      for (let i = 0; i < 4; i += 1) {
        const sz = 0.35 + k.rand() * 0.5
        k.add(new OctahedronGeometry(sz), i % 2 ? '#8fdcff' : '#c9f0ff', {
          p: [x + (k.rand() - 0.5) * 1.2, sz * 1.2, z + (k.rand() - 0.5) * 1.2],
          r: [(k.rand() - 0.5) * 0.6, k.rand() * 3, (k.rand() - 0.5) * 0.6],
          s: [0.6, 2.2, 0.6],
        })
      }
      halos.push([x, 1.0, z, 3.4])
    }
  } else if (T.accents === 'jungle') {
    // Glowing mushrooms at the pillar feet and round the island.
    const spots = PILLARS.map((p) => [p.x - 1.3, p.z + (p.z < 0 ? 1.1 : -1.1)])
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + 0.3
      spots.push([MAP.chest.x + Math.cos(a) * 4.6, MAP.chest.z + Math.sin(a) * 4.6])
    }
    for (const [x, z] of spots) {
      for (let i = 0; i < 3; i += 1) {
        const sz = 0.18 + k.rand() * 0.16
        const mx = x + (k.rand() - 0.5) * 0.8
        const mz = z + (k.rand() - 0.5) * 0.8
        const base = MAP.walkway && MAP.walkway(mx, mz) ? WALK_TOP : 0
        k.cyl(0.05, 0.07, sz * 1.6, 5, '#d8f7c8', { p: [mx, base + sz * 0.8, mz] })
        k.cone(sz * 1.4, sz, 7, '#6dffb0', { p: [mx, base + sz * 2, mz] })
      }
      halos.push([x, 0.9, z, 2.2])
    }
  }
  return { geometry: k.build(), halos }
}

/** Chest lid with its hinge (back top edge) at the origin; rotate X negative to open. */
export function buildChestLid() {
  const k = new Kit(92)
  const wood = '#7a4527'
  const band = '#3a2a22'
  k.group({ p: [0, 0, 0.8] }, (g) => {
    g.add(new CylinderGeometry(0.8, 0.8, 2.72, 20, 1, false, 0, Math.PI), wood, { r: [0, 0, Math.PI / 2] })
    for (const x of [-1.0, 1.0]) {
      g.add(new CylinderGeometry(0.83, 0.83, 0.16, 20, 1, false, 0, Math.PI), band, { p: [x, 0, 0], r: [0, 0, Math.PI / 2] })
    }
    g.box(2.78, 0.1, 1.68, GOLD, { p: [0, 0.02, 0] })
    g.box(0.5, 0.36, 0.08, '#c98a12', { p: [0, 0.1, 0.84] })
  })
  return k.build()
}

/** Gold heap inside the chest, visible when the lid opens. */
export function buildChestHoard() {
  const k = new Kit(93)
  k.ico(0.9, GOLD, { p: [0, 1.45, 0], s: [1.35, 0.32, 0.8] }, 0.12, 1)
  for (let i = 0; i < 8; i += 1) {
    k.cyl(0.16, 0.16, 0.04, 10, GOLD, { p: [(k.rand() - 0.5) * 2.0, 1.62, (k.rand() - 0.5) * 1.0], r: [k.rand(), 0, k.rand()] })
  }
  return k.build()
}

/** Bank chest body (the lid is separate so it can open), front facing +Z. */
export function buildChest() {
  const k = new Kit(90)
  const wood = '#7a4527'
  const band = '#3a2a22'
  k.box(3.0, 0.25, 1.9, '#4a3020', { p: [0, 0.125, 0] })
  k.box(2.7, 1.25, 1.6, wood, { p: [0, 0.875, 0] }, 0.05)
  for (const x of [-1.0, 1.0]) k.box(0.16, 1.28, 1.64, band, { p: [x, 0.875, 0] })
  k.box(2.76, 0.12, 1.66, GOLD, { p: [0, 1.46, 0] })
  // Lock plate and a coin slot that glows (see buildChestGlow).
  k.box(0.6, 0.7, 0.08, '#c98a12', { p: [0, 1.25, 0.82] })
  k.box(0.18, 0.26, 0.04, '#2b1d14', { p: [0, 1.18, 0.87] })
  // Spilled coins in front.
  for (let i = 0; i < 10; i += 1) {
    const a = k.rand() * Math.PI
    const r = 1.2 + k.rand() * 0.5
    k.cyl(0.16, 0.16, 0.04, 8, GOLD, { p: [Math.cos(a) * r, 0.03, Math.sin(a) * r * 0.6 + 0.5] })
  }
  return k.build()
}

export function chestGlowSpots() {
  return CHESTS.map((c) => [c.x + Math.sin(c.ry) * 0.9, 2.4, c.z + Math.cos(c.ry) * 0.9, 3.2])
}

/** Tool shelf: a timber frame in a stone alcove with a stand for each tool. */
export const RACK_SLOT_X = TOOLS.map((_, i) => -RACK.width / 2 + (RACK.width / TOOLS.length) * (i + 0.5))
/** Price plaques sit on the counter front, under each tool. */
export const PLAQUE = { y: 0.42, z: 0.87, width: 1.3, height: 0.65 }

export function buildRack() {
  const T = THEME
  const MARBLE = T.marble
  const OAK = T.beam
  const OAK_LIGHT = T.beamLight
  const k = new Kit(91)
  const w = RACK.width
  k.group({ p: [RACK.x, 0, RACK.z], r: [0, RACK.ry, 0] }, (g) => {
    g.box(w + 1.2, 4.6, 0.6, '#5d5f6e', { p: [0, 2.3, -0.35] }, 0.05)
    g.box(w, 3.6, 0.2, '#3a2618', { p: [0, 2.6, -0.05] })
    g.box(w + 0.4, 0.3, 1.2, OAK, { p: [0, 0.75, 0.35] }, 0.06)
    g.box(w + 0.2, 0.75, 1.0, OAK_LIGHT, { p: [0, 0.375, 0.35] }, 0.06)
    g.box(w + 0.6, 0.35, 0.8, OAK, { p: [0, 4.55, 0.15] })
    for (const sx of [-1, 1]) g.box(0.35, 4.4, 0.35, OAK, { p: [(sx * (w + 0.2)) / 2, 2.2, 0.35] })
    // Marble display stands; the tools themselves are separate smooth meshes.
    TOOLS.forEach((_, i) => {
      g.group({ p: [RACK_SLOT_X[i], 0.9, 0.3] }, (s) => {
        s.cyl(0.4, 0.46, 0.16, 24, MARBLE[0], { p: [0, 0.08, 0] })
        s.cyl(0.42, 0.42, 0.05, 24, GOLD, { p: [0, 0.18, 0] })
      })
    })
  })
  return k.build()
}

/** One quad per tool plaque, UVs pointing at that tool's row in the plaque atlas. */
export function buildPlaques() {
  const n = TOOLS.length
  const parts = TOOLS.map((_, i) => {
    const g = new PlaneGeometry(PLAQUE.width, PLAQUE.height)
    const uv = g.attributes.uv
    // Canvas row i (from the top) is v in [1 - (i+1)/n, 1 - i/n].
    for (let j = 0; j < uv.count; j += 1) uv.setY(j, (n - 1 - i + uv.getY(j)) / n)
    g.translate(RACK.x + RACK_SLOT_X[i], PLAQUE.y, RACK.z + PLAQUE.z)
    return g
  })
  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  return merged
}

/**
 * A loose coin that reads perfectly round at any quality: its two faces are squares
 * whose coin texture is cut out to a circle (alphaTest), and the thin rim cylinder
 * sits just inside that circle so its few segments never show. 4 + 2 x rimSegments
 * triangles: 16 on LOW, 28 on MEDIUM/HIGH.
 */
export function buildFieldCoin(rimSegments = 12) {
  const r = 0.36
  const t = 0.08
  const top = new PlaneGeometry(r * 2, r * 2)
  top.rotateX(-Math.PI / 2)
  top.translate(0, t / 2, 0)
  const bottom = new PlaneGeometry(r * 2, r * 2)
  bottom.rotateX(Math.PI / 2)
  bottom.translate(0, -t / 2, 0)
  const rim = new CylinderGeometry(r * 0.93, r * 0.93, t, rimSegments, 1, true)
  // Every rim vertex samples the dark outer ring of the coin texture.
  const uv = rim.attributes.uv
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, 0.5, 0.035)
  const parts = [top, bottom, rim].map((g) => g.toNonIndexed())
  ;[top, bottom, rim].forEach((g) => g.dispose())
  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  return merged
}
