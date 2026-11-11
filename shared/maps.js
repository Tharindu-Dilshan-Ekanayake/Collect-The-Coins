/**
 * The three treasure maps, shared by client and server. Each is a hall with a pool of
 * real coins (1 coin = 1 coin) and one bank chest. Clearing a map (banking every coin)
 * unlocks the next one.
 *
 * World axes: +X east, -Z north. Players spawn at the west end facing east.
 *
 * `walkways` are stone paths through the pool (no coins there, you walk on top):
 * { box: [x0, x1, z0, z1] } or { disc: [x, z, radius] }. `walkway(x, z)` tests them.
 */

function withWalkways(map) {
  const shapes = map.walkways || []
  const walkway = shapes.length
    ? (x, z) =>
        shapes.some((w) =>
          w.box
            ? x >= w.box[0] && x <= w.box[1] && z >= w.box[2] && z <= w.box[3]
            : (x - w.disc[0]) ** 2 + (z - w.disc[1]) ** 2 <= w.disc[2] ** 2,
        )
    : null
  return { ...map, walkway }
}

const KEEP = {
  id: 'keep',
  order: 1,
  name: 'The Gilded Keep',
  tagline: 'A castle treasure hall, knee-deep in gold.',
  coins: 40000,
  seed: 2026,
  cells: 4000,
  maxStack: 15,
  hall: { minX: -32, maxX: 32, minZ: -20, maxZ: 20, height: 11 },
  field: { minX: -22, maxX: 22, minZ: -11, maxZ: 11 },
  chest: { x: -29.6, z: 0, ry: Math.PI / 2 },
  spawn: [-25.5, 1.2, 0],
  rack: { x: -6, z: -19.25, ry: 0 },
  pillarX: [-24, -12, 0, 12, 24],
  pillarZ: 15.6,
  openings: { north: [-11, 0, 11], south: [-11, 0, 11], west: [0], east: [0] },
  walkways: [],
  theme: 'keep',
}

const FROST = {
  id: 'frost',
  order: 2,
  name: 'Frostfang Vault',
  tagline: 'A frozen glacier under the aurora, split by an ice bridge. The chest waits at the far end.',
  coins: 60000,
  seed: 3031,
  cells: 4600,
  maxStack: 22,
  hall: { minX: -37, maxX: 37, minZ: -22, maxZ: 22, height: 12 },
  field: { minX: -26, maxX: 26, minZ: -13, maxZ: 13 },
  chest: { x: 34.6, z: 0, ry: -Math.PI / 2 },
  spawn: [-31, 1.2, 0],
  rack: { x: -8, z: -21.25, ry: 0 },
  pillarX: [-28, -14, 0, 14, 28],
  pillarZ: 17.6,
  openings: { north: [-13, 0, 13], south: [-13, 0, 13], west: [0], east: [0] },
  /** An ice bridge straight across the pool. */
  walkways: [{ box: [-26, 26, -1.7, 1.7] }],
  theme: 'frost',
}

const GROTTO = {
  id: 'grotto',
  order: 3,
  name: 'Emerald Grotto',
  tagline: 'Jungle temple ruins in the sun. The chest sits on an island in a sea of gold.',
  coins: 80000,
  seed: 4047,
  cells: 5400,
  maxStack: 26,
  hall: { minX: -38, maxX: 38, minZ: -26, maxZ: 26, height: 13 },
  field: { minX: -27, maxX: 27, minZ: -17, maxZ: 17 },
  chest: { x: 0, z: 0, ry: -Math.PI / 2 },
  spawn: [-33, 1.2, 0],
  rack: { x: -10, z: -25.25, ry: 0 },
  pillarX: [-30, -15, 0, 15, 30],
  pillarZ: 21.6,
  openings: { north: [-14, 14], south: [-14, 14], west: [0], east: [] },
  /** A round island in the middle and a causeway to it from the west. */
  walkways: [{ disc: [0, 0, 5.6] }, { box: [-27, 0, -1.5, 1.5] }],
  theme: 'grotto',
}

export const MAPS = [KEEP, FROST, GROTTO].map(withWalkways)
export const MAP_IDS = MAPS.map((m) => m.id)
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0]

/** A map is open when it's the first one or the one before it has been cleared. */
export function isUnlocked(id, cleared = []) {
  const i = MAPS.findIndex((m) => m.id === id)
  return i === 0 || (i > 0 && cleared.includes(MAPS[i - 1].id))
}
