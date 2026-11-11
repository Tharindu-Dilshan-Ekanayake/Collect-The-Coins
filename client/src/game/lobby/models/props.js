import {
  CircleGeometry,
  CylinderGeometry,
  LatheGeometry,
  OctahedronGeometry,
  TorusGeometry,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { PALETTE as P } from '../../sceneStyle'
import { D2R, Kit, polar } from '../../lib/kit'
import {
  BARREL_SPOTS,
  CASTLE_POSITION,
  CHEST,
  FOUNTAIN_RADIUS,
  LAMPS,
  PLANTERS,
  PAD_RADIUS,
  SLOTS,
  STALL_PLACES,
  toWorld,
} from '../layout'
import { addCastleGlow } from './buildings'

// --- Street lamp -------------------------------------------------------------------------

export const LAMP_GLOW_Y = 4.3

export function buildLamp() {
  const k = new Kit(21)
  k.box(0.55, 0.45, 0.55, P.stone, { p: [0, 0.225, 0] }, 0.08)
  k.cyl(0.08, 0.11, 3.5, 6, P.iron, { p: [0, 2.2, 0] })
  k.cyl(0.16, 0.16, 0.12, 6, P.iron, { p: [0, 3.92, 0] })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.box(0.05, 0.62, 0.05, P.iron, { p: [sx * 0.2, LAMP_GLOW_Y, sz * 0.2] })
  }
  k.box(0.5, 0.06, 0.5, P.iron, { p: [0, 3.98, 0] })
  k.box(0.52, 0.06, 0.52, P.iron, { p: [0, 4.62, 0] })
  k.cone(0.42, 0.36, 4, P.iron, { p: [0, 4.83, 0], r: [0, Math.PI / 4, 0] })
  k.ico(0.07, P.iron, { p: [0, 5.05, 0] })
  return k.build()
}

// --- Bench -------------------------------------------------------------------------------

export function buildBench() {
  const k = new Kit(22)
  for (const z of [-0.18, 0, 0.18]) k.box(1.9, 0.07, 0.15, P.wood, { p: [0, 0.48, z] }, 0.1)
  for (const y of [0.72, 0.92]) {
    k.box(1.9, 0.14, 0.06, P.wood, { p: [0, y, -0.3], r: [-0.15, 0, 0] }, 0.1)
  }
  for (const sx of [-1, 1]) {
    k.box(0.08, 0.48, 0.5, P.iron, { p: [sx * 0.8, 0.24, 0] })
    k.box(0.07, 0.62, 0.07, P.iron, { p: [sx * 0.8, 0.76, -0.33] })
  }
  return k.build()
}

// --- Fountain ----------------------------------------------------------------------------

export const FOUNTAIN_COIN_Y = 4.15

/** Octagonal basin, pedestal and bowl. The water and the gold coin are separate meshes. */
export function buildFountain() {
  const k = new Kit(23)
  const apothem = FOUNTAIN_RADIUS - 0.4
  const side = 2 * apothem * Math.tan(22.5 * D2R)
  k.cyl(FOUNTAIN_RADIUS + 0.5, FOUNTAIN_RADIUS + 0.7, 0.16, 8, P.stoneDark, { p: [0, 0.08, 0] }, 0.08)
  k.cyl(apothem, apothem, 0.3, 8, P.stoneDark, { p: [0, 0.15, 0], r: [0, 22.5 * D2R, 0] })
  for (let i = 0; i < 8; i += 1) {
    const deg = i * 45
    const [x, z] = polar(apothem, deg)
    k.box(side + 0.36, 0.75, 0.45, P.stone, { p: [x, 0.375, z], r: [0, -deg * D2R, 0] }, 0.08)
    const [cx, cz] = polar(apothem + 0.02, deg)
    k.box(side + 0.55, 0.16, 0.62, P.stoneLight, { p: [cx, 0.83, cz], r: [0, -deg * D2R, 0] }, 0.06)
  }
  k.cyl(0.55, 0.78, 1.6, 8, P.stone, { p: [0, 1.1, 0] }, 0.06)
  k.cyl(1.35, 0.45, 0.5, 8, P.stoneLight, { p: [0, 2.15, 0] }, 0.06)
  k.cyl(0.25, 0.32, 0.9, 8, P.stone, { p: [0, 2.85, 0] })
  k.cyl(0.36, 0.26, 0.16, 8, P.goldDark, { p: [0, 3.36, 0] })
  return k.build()
}

/** Basin and bowl water surfaces, one geometry. */
export function buildFountainWater() {
  const basin = new CircleGeometry(FOUNTAIN_RADIUS - 0.55, 32)
  basin.rotateX(-Math.PI / 2)
  basin.translate(0, 0.62, 0)
  const bowl = new CircleGeometry(1.22, 20)
  bowl.rotateX(-Math.PI / 2)
  bowl.translate(0, 2.36, 0)
  const merged = mergeGeometries([basin, bowl], false)
  basin.dispose()
  bowl.dispose()
  return merged
}

/** Thin falling-water curtain from the bowl lip into the basin. */
export function buildWaterCurtain() {
  const g = new CylinderGeometry(1.3, 1.6, 1.72, 24, 1, true)
  g.translate(0, 1.5, 0)
  return g
}

// --- Coins -------------------------------------------------------------------------------

/** Standing coin with a raised rim and a star-ish boss. Face points along +Z. */
export function buildCoin(radius = 0.42) {
  const k = new Kit(24)
  const t = radius * 0.22
  k.cyl(radius, radius, t, 16, '#ffd25a', { r: [Math.PI / 2, 0, 0] })
  k.cyl(radius * 0.72, radius * 0.72, t * 1.25, 16, '#f0b42c', { r: [Math.PI / 2, 0, 0] })
  k.add(new OctahedronGeometry(radius * 0.36), '#ffe58a', { s: [1, 1, 0.45] })
  return k.build()
}

// --- Party slot --------------------------------------------------------------------------

/** Two short lantern posts behind each pad (local +Z faces the plaza centre). */
export const SLOT_POSTS_LOCAL = [
  [-1.75, -2.55],
  [1.75, -2.55],
]
export const SLOT_POST_GLOW_Y = 1.78

/**
 * The stone rim round a party pad plus its two lantern posts. The glowing disc,
 * light column and label are separate meshes (shaders / canvas text).
 */
export function buildSlotBase() {
  const k = new Kit(25)
  const stones = [P.stone, P.stoneLight, P.stoneDark, '#9690a6']
  const blocks = 16
  const rimR = PAD_RADIUS + 0.28
  for (let i = 0; i < blocks; i += 1) {
    const a = (i / blocks) * Math.PI * 2
    const len = ((2 * Math.PI * rimR) / blocks) * 0.94
    k.box(len, 0.16, 0.42, stones[i % stones.length], {
      p: [Math.sin(a) * rimR, 0.08, Math.cos(a) * rimR],
      r: [0, a, 0],
    }, 0.08)
  }
  for (const [x, z] of SLOT_POSTS_LOCAL) {
    k.box(0.42, 0.3, 0.42, P.stone, { p: [x, 0.15, z] }, 0.08)
    k.cyl(0.07, 0.09, 1.3, 6, P.woodDark, { p: [x, 0.95, z] })
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.box(0.04, 0.34, 0.04, P.iron, { p: [x + sx * 0.13, SLOT_POST_GLOW_Y, z + sz * 0.13] })
    }
    k.box(0.36, 0.05, 0.36, P.iron, { p: [x, SLOT_POST_GLOW_Y - 0.19, z] })
    k.cone(0.3, 0.26, 4, P.iron, { p: [x, SLOT_POST_GLOW_Y + 0.3, z], r: [0, Math.PI / 4, 0] })
  }
  return k.build()
}

// --- Leaderboard -------------------------------------------------------------------------

export const BOARD_FACE = { width: 3.56, height: 4.06, y: 3.1, z: 0.125 }
export const TROPHY_Y = 5.93

export function buildBoardFrame() {
  const k = new Kit(26)
  k.box(4.6, 0.45, 1.15, P.stone, { p: [0, 0.225, 0] }, 0.08)
  for (const sx of [-1, 1]) k.box(0.34, 5.1, 0.34, P.woodDark, { p: [sx * 2.05, 0.45 + 2.55, 0] }, 0.08)
  k.box(3.9, 4.4, 0.22, '#4a2e1d', { p: [0, BOARD_FACE.y, 0] })
  k.box(4.1, 0.2, 0.12, P.wood, { p: [0, BOARD_FACE.y + 2.2, 0.14] })
  k.box(4.1, 0.2, 0.12, P.wood, { p: [0, BOARD_FACE.y - 2.2, 0.14] })
  for (const sx of [-1, 1]) k.box(0.2, 4.6, 0.12, P.wood, { p: [sx * 1.97, BOARD_FACE.y, 0.14] })
  k.box(4.8, 0.32, 1.3, P.woodDark, { p: [0, 5.62, 0] }, 0.06)
  k.box(4.55, 0.14, 1.1, P.wood, { p: [0, 5.86, 0] })
  for (const sx of [-1, 1]) {
    k.box(0.5, 0.5, 0.06, P.gold, { p: [sx * 1.6, 5.62, 0.66], r: [0, 0, Math.PI / 4] })
  }
  return k.build()
}

/** Cup on a plinth, white so instanceColor makes it gold, silver or bronze. */
export function buildTrophy() {
  const k = new Kit(27)
  k.box(0.52, 0.16, 0.52, '#8a8a8a', { p: [0, 0.08, 0] })
  k.box(0.4, 0.1, 0.4, '#ffffff', { p: [0, 0.21, 0] })
  k.cyl(0.07, 0.11, 0.32, 6, '#ffffff', { p: [0, 0.42, 0] })
  k.add(
    new LatheGeometry(
      [
        new Vector2(0.001, 0),
        new Vector2(0.12, 0.02),
        new Vector2(0.3, 0.13),
        new Vector2(0.37, 0.34),
        new Vector2(0.39, 0.55),
      ],
      10,
    ),
    '#ffffff',
    { p: [0, 0.58, 0] },
  )
  k.cyl(0.37, 0.37, 0.03, 10, '#bdbdbd', { p: [0, 1.11, 0] })
  for (const sx of [-1, 1]) {
    k.add(new TorusGeometry(0.15, 0.035, 5, 8, Math.PI), '#ffffff', {
      p: [sx * 0.36, 0.92, 0],
      r: [0, 0, -sx * (Math.PI / 2)],
    })
  }
  k.add(new OctahedronGeometry(0.1), '#ffffff', { p: [0, 1.25, 0], s: [1, 1.4, 1] })
  return k.build()
}

// --- Market stalls -----------------------------------------------------------------------

export const STALL_SIGN = { width: 3.8, height: 0.95, y: 4.85, z: -1.29 }
export const STALL_LANTERNS_LOCAL = [
  [-2.78, 2.42, 1.62],
  [2.78, 2.42, 1.62],
]

function shopkeeper(k, kind) {
  const smith = kind === 'upgrades'
  const torso = smith ? '#4f6a8a' : '#5b3a8a'
  k.box(0.9, 1.0, 0.55, torso, { p: [0, 1.55, -0.35] })
  k.box(0.66, 0.66, 0.62, P.skin, { p: [0, 2.42, -0.35] })
  for (const sx of [-1, 1]) {
    k.box(0.09, 0.13, 0.02, '#2b1d14', { p: [sx * 0.15, 2.48, -0.03] })
    k.box(0.27, 0.75, 0.3, torso, { p: [sx * 0.58, 1.72, -0.2], r: [-0.55, 0, 0] })
    k.box(0.2, 0.2, 0.2, P.skin, { p: [sx * 0.58, 1.48, 0.15] })
  }
  if (smith) {
    k.box(0.8, 0.85, 0.05, '#7a4a2a', { p: [0, 1.5, -0.06] })
    k.box(0.52, 0.36, 0.14, '#d0823a', { p: [0, 2.2, -0.02] })
    k.box(0.74, 0.2, 0.7, '#5a5a66', { p: [0, 2.82, -0.35] })
    k.box(0.5, 0.12, 0.5, '#6d6d7a', { p: [0, 2.97, -0.35] })
  } else {
    k.box(0.42, 0.5, 0.12, '#eeeeee', { p: [0, 2.13, -0.02] })
    k.cyl(0.62, 0.62, 0.06, 8, '#3f2766', { p: [0, 2.78, -0.35] })
    k.cone(0.46, 1.0, 6, '#3f2766', { p: [0, 3.3, -0.35], r: [0.12, 0, 0] })
    k.add(new OctahedronGeometry(0.1), P.gold, { p: [0, 3.25, -0.05] })
  }
}

function stallGoods(k, glow, kind) {
  const top = 1.39
  if (kind === 'upgrades') {
    // Anvil.
    k.box(0.36, 0.22, 0.3, '#4a4a55', { p: [-1.6, top + 0.11, 0.95] })
    k.box(0.75, 0.16, 0.34, '#5a5a66', { p: [-1.6, top + 0.3, 0.95] })
    k.cone(0.12, 0.3, 5, '#5a5a66', { p: [-2.1, top + 0.3, 0.95], r: [0, 0, Math.PI / 2] })
    // Boots.
    for (const x of [-0.45, -0.12]) {
      k.box(0.24, 0.3, 0.26, '#7a4a2a', { p: [x, top + 0.15, 0.85] })
      k.box(0.24, 0.12, 0.42, '#7a4a2a', { p: [x, top + 0.06, 0.95] })
      k.box(0.26, 0.04, 0.44, '#3a2416', { p: [x, top + 0.01, 0.95] })
    }
    // Magnet.
    for (const sx of [-1, 1]) {
      k.box(0.12, 0.36, 0.12, '#d0423a', { p: [0.75 + sx * 0.14, top + 0.3, 0.9] })
      k.box(0.13, 0.1, 0.13, '#d8dbe5', { p: [0.75 + sx * 0.14, top + 0.52, 0.9] })
    }
    k.box(0.4, 0.12, 0.12, '#d0423a', { p: [0.75, top + 0.1, 0.9] })
    // Coin sack.
    k.ico(0.32, '#c8a26a', { p: [1.65, top + 0.25, 0.85], s: [1, 0.85, 1] }, 0.1)
    k.cyl(0.13, 0.13, 0.04, 8, P.gold, { p: [1.65, top + 0.55, 0.85] })
  } else {
    // Crystal ball on a stand (the ball itself glows).
    k.cyl(0.18, 0.26, 0.16, 6, P.woodDark, { p: [0, top + 0.08, 0.9] })
    glow.ico(0.3, '#9fd8ff', { p: [0, top + 0.44, 0.9] }, 0, 1)
    // Potions.
    ;['#e0484f', '#4fc06a', '#9b5de5'].forEach((color, i) => {
      const x = -1.75 + i * 0.36
      k.cyl(0.12, 0.14, 0.3, 6, color, { p: [x, top + 0.15, 0.95] })
      k.cyl(0.05, 0.06, 0.12, 5, color, { p: [x, top + 0.36, 0.95] })
      k.box(0.08, 0.06, 0.08, '#a57a4a', { p: [x, top + 0.45, 0.95] })
    })
    // Gems.
    ;['#ff4d6d', '#3fa7ff', '#3fd17a', '#ffd34d'].forEach((color, i) => {
      k.add(new OctahedronGeometry(0.13), color, {
        p: [0.95 + (i % 2) * 0.32, top + 0.13, 0.75 + Math.floor(i / 2) * 0.3],
        s: [1, 1.3, 1],
      })
    })
    // Candle.
    k.cyl(0.06, 0.06, 0.26, 6, '#f4ecd8', { p: [1.85, top + 0.13, 0.9] })
    glow.cone(0.05, 0.14, 4, P.flame, { p: [1.85, top + 0.33, 0.9] })
  }

  // Jars and boxes on the back shelves.
  const shelfColors = ['#c98a52', '#7fa36b', '#d06a4a', '#6a8fc4', '#e2c46a']
  for (const y of [1.6, 2.35]) {
    for (let i = 0; i < 7; i += 1) {
      const x = -2.0 + i * 0.66
      const color = shelfColors[(i + Math.round(y)) % shelfColors.length]
      if (i % 2) k.cyl(0.13, 0.13, 0.3, 6, color, { p: [x, y + 0.19, -1.0] })
      else k.box(0.3, 0.26, 0.26, color, { p: [x, y + 0.17, -1.0] })
    }
  }
}

/** A complete market stall, front facing +Z. Unique per stall (different goods). */
export function buildStall(stall, glow) {
  const k = new Kit(stall.id.length * 7)
  const cream = '#f6ead2'
  const color = stall.color

  k.box(5.4, 0.22, 3.2, P.woodDark, { p: [0, 0.11, 0] }, 0.06)
  k.box(5.0, 2.9, 0.18, '#7d4f2c', { p: [0, 0.22 + 1.45, -1.25] }, 0.05)
  for (const y of [1.6, 2.35]) k.box(4.6, 0.08, 0.38, P.woodLight, { p: [0, y, -1.0] })
  for (const sx of [-1, 1]) k.box(0.14, 1.2, 2.5, '#8a5a32', { p: [sx * 2.45, 0.82, -0.05] })

  k.box(4.9, 1.05, 0.95, P.wood, { p: [0, 0.745, 0.95] })
  for (let i = 0; i < 7; i += 1) {
    k.box(0.64, 0.95, 0.05, i % 2 ? P.wood : '#b57a45', { p: [-2.1 + i * 0.7, 0.72, 1.44] }, 0.05)
  }
  k.box(5.1, 0.12, 1.15, P.woodLight, { p: [0, 1.33, 0.95] })

  for (const sx of [-1, 1]) {
    k.box(0.2, 3.3, 0.2, P.woodDark, { p: [sx * 2.5, 0.22 + 1.65, 1.55] })
    k.box(0.2, 5.0, 0.2, P.woodDark, { p: [sx * 2.5, 0.22 + 2.5, -1.35] })
    // Lantern bracket on each front post.
    k.box(0.36, 0.06, 0.06, P.iron, { p: [sx * 2.66, 2.7, 1.6] })
    k.cone(0.2, 0.18, 4, P.iron, { p: [sx * 2.78, 2.64, 1.62], r: [0, Math.PI / 4, 0] })
  }

  // Striped awning sloping down to the front, with a scalloped edge. High enough
  // that the shopkeeper's face shows under the scallops from a third-person camera.
  const yBack = 4.2
  const yFront = 3.5
  const zBack = -1.6
  const zFront = 1.95
  const len = Math.hypot(zFront - zBack, yBack - yFront)
  const phi = Math.atan2(yBack - yFront, zFront - zBack)
  const stripes = 8
  const sw = 5.8 / stripes
  for (let i = 0; i < stripes; i += 1) {
    const x = -2.9 + sw * (i + 0.5)
    const c = i % 2 ? color : cream
    k.box(sw, 0.1, len, c, { p: [x, (yBack + yFront) / 2 + 0.05, (zBack + zFront) / 2], r: [phi, 0, 0] })
    k.box(sw, 0.22, 0.05, c, { p: [x, yFront - 0.08, zFront + 0.02] })
    k.add(new CylinderGeometry(sw / 2, sw / 2, 0.05, 8, 1, false, -Math.PI / 2, Math.PI), c, {
      p: [x, yFront - 0.19, zFront + 0.02],
      r: [Math.PI / 2, 0, 0],
    })
  }

  k.box(STALL_SIGN.width + 0.25, STALL_SIGN.height + 0.2, 0.14, '#4a2a16', {
    p: [0, STALL_SIGN.y, STALL_SIGN.z - 0.08],
  })

  shopkeeper(k, stall.id)
  stallGoods(k, glow, stall.id)
  return k.build()
}

// --- Plaza clutter -----------------------------------------------------------------------

function barrel(k, p) {
  k.cyl(0.42, 0.38, 0.95, 8, P.wood, { p: [p[0], 0.475, p[1]] }, 0.08)
  for (const y of [0.2, 0.75]) k.cyl(0.44, 0.44, 0.07, 8, P.iron, { p: [p[0], y, p[1]] })
  k.cyl(0.38, 0.38, 0.04, 8, P.woodDark, { p: [p[0], 0.96, p[1]] })
}

function crate(k, p, ry, size = 0.8) {
  k.group({ p: [p[0], 0, p[1]], r: [0, ry, 0] }, (g) => {
    g.box(size, size, size, P.woodLight, { p: [0, size / 2, 0] }, 0.08)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.box(0.1, size + 0.02, 0.1, P.woodDark, { p: [(sx * size) / 2, size / 2, (sz * size) / 2] })
      }
    }
    g.box(size + 0.04, 0.1, size + 0.04, P.woodDark, { p: [0, size, 0] })
  })
}

/** Planters, barrels, crates and the overflowing treasure chest by spawn. One mesh. */
export function buildProps() {
  const k = new Kit(55)

  for (const pl of PLANTERS) {
    k.group({ p: [pl.x, 0, pl.z], r: [0, pl.ry, 0] }, (g) => {
      g.box(3.0, 0.55, 1.1, P.wood, { p: [0, 0.275, 0] }, 0.08)
      g.box(3.12, 0.1, 1.22, P.woodDark, { p: [0, 0.58, 0] })
      g.box(2.8, 0.1, 0.9, P.soil, { p: [0, 0.6, 0] })
      for (let i = 0; i < 6; i += 1) {
        g.ico(0.26 + g.rand() * 0.1, P.leaf, {
          p: [-1.2 + i * 0.48, 0.72, (g.rand() - 0.5) * 0.3],
          s: [1, 0.7, 1],
        }, 0.15)
      }
    })
  }

  for (const spot of BARREL_SPOTS) {
    k.group({ p: [spot.x, 0, spot.z], r: [0, spot.ry, 0] }, (g) => {
      barrel(g, [-0.5, 0])
      barrel(g, [0.45, 0.2])
      crate(g, [0.1, -0.85], 0.3)
      g.ico(0.34, '#c8a26a', { p: [-1.1, 0.3, 0.5], s: [1, 0.8, 1] }, 0.1)
    })
  }

  // Treasure chest spilling gold.
  k.group({ p: [CHEST.x, 0, CHEST.z], r: [0, CHEST.ry, 0] }, (g) => {
    g.box(1.4, 0.7, 0.9, '#7a4527', { p: [0, 0.35, 0] }, 0.05)
    for (const sx of [-1, 1]) g.box(0.1, 0.72, 0.94, P.goldDark, { p: [sx * 0.5, 0.36, 0] })
    g.box(0.22, 0.26, 0.06, P.gold, { p: [0, 0.55, 0.46] })
    g.box(1.42, 0.12, 0.92, '#7a4527', { p: [0, 1.11, -0.66], r: [-1.92, 0, 0] })
    g.ico(0.55, P.gold, { p: [0, 0.72, 0], s: [1.15, 0.45, 0.75] }, 0.12)
    g.ico(0.5, P.gold, { p: [0.7, 0.1, 0.75], s: [1.3, 0.28, 1] }, 0.12)
    g.add(new OctahedronGeometry(0.12), '#ff4d6d', { p: [-0.25, 0.95, 0.1], s: [1, 1.3, 1] })
    g.add(new OctahedronGeometry(0.11), '#3fa7ff', { p: [0.3, 0.92, -0.05], s: [1, 1.3, 1] })
    for (let i = 0; i < 12; i += 1) {
      const a = g.rand() * Math.PI * 2
      const r = 0.9 + g.rand() * 0.9
      g.cyl(0.15, 0.15, 0.04, 8, P.gold, {
        p: [Math.cos(a) * r, 0.03, Math.sin(a) * r + 0.3],
        r: [g.rand() * 0.3, 0, g.rand() * 0.3],
      })
    }
  })

  return k.build()
}

// --- Everything that glows ---------------------------------------------------------------

/**
 * Lantern cores, slot lanterns, stall lanterns and the castle windows merged into one
 * unlit mesh, plus the world positions for the soft halo sprites around them.
 */
export function buildStaticGlow(stallGlowParts) {
  const k = new Kit(60)
  const halos = []

  for (const lamp of LAMPS) {
    k.box(0.34, 0.5, 0.34, P.glow, { p: [lamp.x, LAMP_GLOW_Y, lamp.z] })
    halos.push([lamp.x, LAMP_GLOW_Y, lamp.z, 3.2])
  }

  for (const slot of SLOTS) {
    for (const [lx, lz] of SLOT_POSTS_LOCAL) {
      const [x, z] = toWorld(slot, lx, lz)
      k.box(0.24, 0.3, 0.24, P.glow, { p: [x, SLOT_POST_GLOW_Y, z] })
      halos.push([x, SLOT_POST_GLOW_Y, z, 2.0])
    }
  }

  for (const place of STALL_PLACES) {
    k.group({ p: [place.x, 0, place.z], r: [0, place.ry, 0] }, (g) => {
      for (const [x, y, z] of STALL_LANTERNS_LOCAL) g.box(0.22, 0.3, 0.22, P.glow, { p: [x, y, z] })
    })
    for (const [x, y, z] of STALL_LANTERNS_LOCAL) {
      const c = Math.cos(place.ry)
      const s = Math.sin(place.ry)
      halos.push([place.x + x * c + z * s, y, place.z - x * s + z * c, 2.2])
    }
  }

  addCastleGlow(k, CASTLE_POSITION)

  const geometry = mergeGeometries([k.build(), ...stallGlowParts], false)
  return { geometry, halos }
}
