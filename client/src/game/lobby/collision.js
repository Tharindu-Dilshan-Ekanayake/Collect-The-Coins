import {
  BARREL_SPOTS,
  BENCHES,
  BOARDS,
  CHEST,
  FOUNTAIN_RADIUS,
  LAMPS,
  PLANTERS,
  SLOTS,
  STALL_PLACES,
  WALL_RADIUS,
  toWorld,
} from './layout'
import { SLOT_POSTS_LOCAL } from './models/props'

/**
 * The lobby's whole "physics": a capsule on flat ground pushed out of circles and
 * rotated boxes, plus a ring wall. Every obstacle is taller than the 0.75 m jump, so
 * nothing can be climbed and heights only matter for the camera.
 *
 * This replaces a 2.2 MB WASM physics engine (Rapier) in the lobby: zero download,
 * zero init time, no per-frame allocations. Stages that need real physics can lazy-load
 * Rapier in their own chunk.
 */

const circle = (x, z, r, h, cameraOnly = false) => ({ box: false, x, z, r, h, cameraOnly })
const box = (place, hw, hd, h) => ({
  box: true,
  x: place.x,
  z: place.z,
  hw,
  hd,
  h,
  cos: Math.cos(place.ry),
  sin: Math.sin(place.ry),
  cameraOnly: false,
})

/** h = top of the obstacle in metres (used by the camera only). */
export const COLLIDERS = [
  circle(0, 0, FOUNTAIN_RADIUS - 0.1, 1.0),
  circle(0, 0, 1.45, 4.9, true), // pedestal, bowl and the big coin
  // Lantern posts behind each party slot; the pads themselves are walkable.
  ...SLOTS.flatMap((slot) => SLOT_POSTS_LOCAL.map(([lx, lz]) => {
    const [x, z] = toWorld(slot, lx, lz)
    return circle(x, z, 0.25, 2.1)
  })),
  ...BOARDS.map((b) => box(b, 2.3, 0.6, 6.4)),
  ...STALL_PLACES.map((s) => box(s, 2.75, 1.65, 5.4)),
  ...LAMPS.map((l) => circle(l.x, l.z, 0.3, 5.1)),
  ...BENCHES.map((b) => box(b, 1.0, 0.4, 1.0)),
  ...PLANTERS.map((p) => box(p, 1.55, 0.6, 0.9)),
  ...BARREL_SPOTS.map((b) => circle(b.x, b.z, 1.1, 1.2)),
  box(CHEST, 0.85, 0.55, 1.2),
]

const WALL_INNER = WALL_RADIUS - 0.45
const WALL_OUTER = WALL_RADIUS + 0.45
const WALL_TOP = 1.5

/** Pushes a circle of `radius` at pos.x/pos.z out of every obstacle. Mutates pos. */
export function resolveCircle(pos, radius) {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const c of COLLIDERS) {
      if (c.cameraOnly) continue
      const dx = pos.x - c.x
      const dz = pos.z - c.z
      if (!c.box) {
        const min = c.r + radius
        const d2 = dx * dx + dz * dz
        if (d2 >= min * min) continue
        const d = Math.sqrt(d2) || 1e-4
        const push = (min - d) / d
        pos.x += dx * push
        pos.z += dz * push
        continue
      }
      // Into the box's local frame (inverse of its Y rotation).
      let lx = dx * c.cos - dz * c.sin
      let lz = dx * c.sin + dz * c.cos
      const ox = lx - Math.max(-c.hw, Math.min(c.hw, lx))
      const oz = lz - Math.max(-c.hd, Math.min(c.hd, lz))
      const d2 = ox * ox + oz * oz
      if (d2 >= radius * radius) continue
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2)
        const push = (radius - d) / d
        lx += ox * push
        lz += oz * push
      } else if (c.hw - Math.abs(lx) < c.hd - Math.abs(lz)) {
        lx = Math.sign(lx || 1) * (c.hw + radius)
      } else {
        lz = Math.sign(lz || 1) * (c.hd + radius)
      }
      pos.x = c.x + lx * c.cos + lz * c.sin
      pos.z = c.z - lx * c.sin + lz * c.cos
    }
  }

  const limit = WALL_INNER - radius
  const d = Math.hypot(pos.x, pos.z)
  if (d > limit) {
    pos.x *= limit / d
    pos.z *= limit / d
  }
}

/** The lobby as a "world" for Player / FollowCamera: flat ground, these obstacles. */
export const LOBBY_WORLD = {
  resolve: (pos, radius) => resolveCircle(pos, radius),
  groundAt: () => 0,
  isBlocked: (x, y, z) => isBlocked(x, y, z),
}

/** True if a camera at (x, y, z) would be inside something solid. */
export function isBlocked(x, y, z, pad = 0.3) {
  if (y < WALL_TOP) {
    const d = Math.hypot(x, z)
    if (d > WALL_INNER - pad && d < WALL_OUTER + pad) return true
  }
  for (const c of COLLIDERS) {
    if (y > c.h) continue
    const dx = x - c.x
    const dz = z - c.z
    if (!c.box) {
      const r = c.r + pad
      if (dx * dx + dz * dz < r * r) return true
    } else {
      const lx = dx * c.cos - dz * c.sin
      const lz = dx * c.sin + dz * c.cos
      if (Math.abs(lx) < c.hw + pad && Math.abs(lz) < c.hd + pad) return true
    }
  }
  return false
}
