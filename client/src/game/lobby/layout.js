import { LEADERBOARDS, PARTY_SLOTS, STALLS } from '../../state/content'
import { D2R, faceCenter, mulberry32, polar } from '../lib/kit'

/**
 * Where everything in the lobby stands.
 *
 * The plaza is a cobbled circle centred on the origin, ringed by a low stone wall.
 * Facing north from spawn: a row of party slots ahead, leaderboards to the left (west), market
 * stalls to the right (east), a fountain in the middle. Houses, trees, hills and a
 * castle sit outside the wall as scenery.
 *
 * Angles are degrees, 0 = north (-Z), 90 = east (+X). Everything faces the centre.
 */

export const PLAZA_RADIUS = 26
export const WALL_RADIUS = 27.6
export const SPAWN = [0, 1.2, 14]

/** Offset a local [x, z] by a placement's position and Y rotation. */
export function toWorld(place, lx, lz) {
  const c = Math.cos(place.ry)
  const s = Math.sin(place.ry)
  return [place.x + lx * c + lz * s, place.z - lx * s + lz * c]
}

function place(radius, deg) {
  const [x, z] = polar(radius, deg)
  return { x, z, deg, ry: faceCenter(deg) }
}

/** Party slots: glowing pads in an arc on the north side of the plaza. */
export const SLOT_RADIUS = 17
export const PAD_RADIUS = 2.2
/** Angular span of the slot arc, and of the flagstone band they stand on. */
export const SLOT_ARC_DEG = 50
export const SLOT_BAND = { inner: 14.4, outer: 19.6, halfDeg: 62 }

export const SLOTS = Array.from({ length: PARTY_SLOTS }, (_, i) => {
  const deg = -SLOT_ARC_DEG + (i * 2 * SLOT_ARC_DEG) / (PARTY_SLOTS - 1)
  return { id: i, ...place(SLOT_RADIUS, deg) }
})

export const BOARDS = LEADERBOARDS.map((board, i) => ({
  ...place(19, [-112, -90, -68][i]),
  board,
}))

export const STALL_PLACES = STALLS.map((stall, i) => {
  const p = place(18.5, [76, 104][i])
  const [zoneX, zoneZ] = toWorld(p, 0, 3.0)
  return { ...p, stall, zoneX, zoneZ }
})
export const STALL_ZONE_RADIUS = 2.6

export const LAMPS = Array.from({ length: 12 }, (_, i) => place(24.6, 15 + i * 30))

export const BENCHES = [45, 135, 225, 315].map((deg) => place(7.4, deg))

export const FOUNTAIN_RADIUS = 3.6

/** South-side props, the cosy clutter around spawn. */
export const PLANTERS = [150, 180, 210].map((deg) => place(24.6, deg))
export const CHEST = place(21.5, 162)
export const BARREL_SPOTS = [
  place(21.8, 196),
  place(22.6, 64),
  place(22.6, 116),
  place(22.4, -60),
  place(22.4, -124),
]

// --- Scenery outside the wall --------------------------------------------------------

const rand = mulberry32(2024)

/** Houses on a ring, leaving the north open so the castle stays in view. */
export const HOUSES = [38, 60, 84, 108, 132, 156, 180, 204, 228, 252, 276, 300, 322].map(
  (deg, i) => {
    const radius = 37.5 + rand() * 4
    const [x, z] = polar(radius, deg + (rand() - 0.5) * 6)
    return {
      x,
      z,
      ry: faceCenter(deg) + (rand() - 0.5) * 0.25,
      scale: 0.95 + rand() * 0.2,
      variant: i % 2,
      roof: i,
    }
  },
)

function scatter(count, minR, maxR, avoid = () => false) {
  const out = []
  let guard = 0
  while (out.length < count && guard < count * 20) {
    guard += 1
    const deg = rand() * 360
    const r = minR + rand() * (maxR - minR)
    if (avoid(deg, r)) continue
    const [x, z] = polar(r, deg)
    out.push({ x, z, deg, r, ry: rand() * Math.PI * 2, scale: 0.75 + rand() * 0.7, k: rand() })
  }
  return out
}

const nearHouse = (deg, r) =>
  HOUSES.some((h) => Math.hypot(h.x - Math.sin(deg * D2R) * r, h.z + Math.cos(deg * D2R) * r) < 6.5)
/** Keep the view from the portals to the castle clear. */
const castleCorridor = (deg) => Math.abs(((deg + 540) % 360) - 180) < 14

export const PINES = scatter(
  80,
  46,
  105,
  (deg, r) => nearHouse(deg, r) || (castleCorridor(deg) && r < 90),
)
export const ROUND_TREES = scatter(22, 31, 46, (deg, r) => nearHouse(deg, r) || castleCorridor(deg))
export const BUSHES = scatter(46, 28.8, 31.5, () => false)

export const CASTLE_POSITION = [0, 0, -168]
