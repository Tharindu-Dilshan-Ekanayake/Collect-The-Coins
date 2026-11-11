/**
 * Layout of the current treasure map: hall, coin pool, walkways, pillars, chest, tool
 * shelf, props and collision. Built from the shared map definitions (../shared/maps.js),
 * which the server uses too.
 *
 * Only one stage is mounted at a time, so the layout lives in module-level bindings
 * that configureMap() rebuilds before the stage renders (ES module exports are live:
 * importers always read the current values). Never call it while a stage is mounted
 * with a different map.
 *
 * World axes: +X east, -Z north. The player spawns at the west end facing east.
 */

import { mapById } from '@shared/maps.js'
import { BED_TOP, CHEST_REACH, POOL_FLOOR, WALK_TOP, cellAt, stackTopY } from '@shared/pool.js'

import { THEMES } from './themes'

export { BED_TOP, CHEST_REACH, WALK_TOP }

/** Camera starts behind the player looking east along the hall. */
export const SPAWN_YAW = -Math.PI / 2
export const RACK_REACH = 3.4
const RACK_WIDTH = 9
const RAIL_T = 0.25

export let MAP = null
export let THEME = null
export let HALL = null
export let FIELD = null
export let CHEST = null
export let CHESTS = []
/** Where banked coins drop in: just above the open lid. */
export let CHEST_MOUTH = [0, 0, 0]
export let SPAWN = [0, 0, 0]
export let RACK = null
export let PILLARS = []
/** Gaps in the railing round the field: [centre, half-width] per side. */
export let OPENINGS = { north: [], south: [], west: [], east: [] }
/** Small props against the walls: [x, z, ry, kind]. */
export let PROPS = []
export let RAILS = []
/** Wall sconces flanking the banner bays and the end walls. */
export let SCONCES = []
let BOXES = []

/**
 * The live coin pool (set by CoinField). The floor height inside the pool follows the
 * stacks, so you sink into the gold as it drains.
 */
let livePool = null
export const setLivePool = (pool) => {
  livePool = pool
}

export const insideField = (x, z, margin = 0) =>
  x > FIELD.minX - margin && x < FIELD.maxX + margin && z > FIELD.minZ - margin && z < FIELD.maxZ + margin

export const onWalkway = (x, z) => Boolean(MAP.walkway && insideField(x, z) && MAP.walkway(x, z))

function railSegments() {
  const segs = []
  const run = (fixed, from, to, gaps, horizontal) => {
    const cuts = gaps.map(([c, hw]) => [c - hw, c + hw]).sort((a, b) => a[0] - b[0])
    let start = from
    for (const [a, b] of [...cuts, [to, to]]) {
      if (a > start) segs.push(horizontal ? { x0: start, x1: a, z: fixed } : { z0: start, z1: a, x: fixed })
      start = Math.max(start, b)
    }
  }
  run(FIELD.minZ, FIELD.minX, FIELD.maxX, OPENINGS.north, true)
  run(FIELD.maxZ, FIELD.minX, FIELD.maxX, OPENINGS.south, true)
  run(FIELD.minX, FIELD.minZ, FIELD.maxZ, OPENINGS.west, false)
  run(FIELD.maxX, FIELD.minZ, FIELD.maxZ, OPENINGS.east, false)
  return segs
}

/** Props along the walls, spread to fit the hall and kept clear of the chest and shelf. */
function placeProps() {
  const kinds = ['bars', 'barrels', 'crates']
  const list = []
  const inset = 1.5
  const corners = [
    [HALL.minX + inset, HALL.minZ + inset, 0.3],
    [HALL.minX + inset, HALL.maxZ - inset, -0.2],
    [HALL.maxX - inset, HALL.minZ + inset, 0.1],
    [HALL.maxX - inset, HALL.maxZ - inset, 0.6],
  ]
  corners.forEach(([x, z, ry], i) => list.push([x, z, ry, kinds[i % 3]]))
  const step = 12
  let k = 0
  for (let x = HALL.minX + 8; x < HALL.maxX - 6; x += step) {
    k += 1
    if (Math.abs(x - RACK.x) > RACK_WIDTH / 2 + 2) list.push([x, HALL.minZ + 0.9, 0, kinds[k % 3]])
    list.push([x + 6, HALL.maxZ - 0.9, Math.PI, kinds[(k + 1) % 3]])
  }
  return list.filter(([x, z]) => Math.hypot(x - CHEST.x, z - CHEST.z) > 4.5)
}

function buildSconces() {
  const list = []
  if (THEME.env !== 'hall') return list // outdoors: no walls to hang them on
  const y = 4.6
  for (const px of PILLARS.filter((p) => p.z < 0).map((p) => p.x)) {
    for (const dx of [-2.5, 2.5]) {
      const x = px + dx
      if (x <= HALL.minX + 1 || x >= HALL.maxX - 1) continue
      list.push({ x, y, z: HALL.minZ + 0.02, ry: 0 })
      list.push({ x, y, z: HALL.maxZ - 0.02, ry: Math.PI })
    }
  }
  const d = HALL.maxZ - HALL.minZ
  for (const f of [-0.3, -0.1, 0.1, 0.3]) {
    list.push({ x: HALL.minX + 0.02, y, z: f * d, ry: Math.PI / 2 })
    list.push({ x: HALL.maxX - 0.02, y, z: f * d, ry: -Math.PI / 2 })
  }
  return list
}

/** Rebuilds every binding above for this map. Returns the map definition. */
export function configureMap(mapId) {
  MAP = mapById(mapId)
  THEME = THEMES[MAP.theme] || THEMES.keep
  HALL = MAP.hall
  FIELD = MAP.field
  CHEST = MAP.chest
  CHESTS = [CHEST]
  CHEST_MOUTH = [CHEST.x + Math.sin(CHEST.ry) * 0.2, 2.1, CHEST.z + Math.cos(CHEST.ry) * 0.2]
  SPAWN = MAP.spawn
  RACK = { ...MAP.rack, width: RACK_WIDTH }
  PILLARS = []
  for (const z of [-MAP.pillarZ, MAP.pillarZ]) for (const x of MAP.pillarX) PILLARS.push({ x, z })
  OPENINGS = {
    north: MAP.openings.north.map((c) => [c, 1.6]),
    south: MAP.openings.south.map((c) => [c, 1.6]),
    west: MAP.openings.west.map((c) => [c, 2.0]),
    east: MAP.openings.east.map((c) => [c, 2.0]),
  }
  PROPS = placeProps()
  RAILS = railSegments()
  SCONCES = buildSconces()
  BOXES = [
    ...RAILS.map((r) =>
      r.x0 !== undefined
        ? { x: (r.x0 + r.x1) / 2, z: r.z, hw: (r.x1 - r.x0) / 2, hd: RAIL_T, h: 1.2 }
        : { x: r.x, z: (r.z0 + r.z1) / 2, hw: RAIL_T, hd: (r.z1 - r.z0) / 2, h: 1.2 },
    ),
    ...PILLARS.map((p) => ({ x: p.x, z: p.z, hw: 0.8, hd: 0.8, h: HALL.height })),
    { x: CHEST.x, z: CHEST.z, hw: Math.abs(Math.sin(CHEST.ry)) > 0.5 ? 1.0 : 1.6, hd: Math.abs(Math.sin(CHEST.ry)) > 0.5 ? 1.6 : 1.0, h: 2.4 },
    { x: RACK.x, z: RACK.z - 0.1, hw: RACK.width / 2, hd: 0.85, h: 4.6 },
    ...PROPS.map(([x, z]) => ({ x, z, hw: 1.0, hd: 1.0, h: 1.6 })),
  ]
  return MAP
}

configureMap('keep')

// --- Collision ---------------------------------------------------------------------------

function pushOutOfBox(pos, b, r) {
  const dx = pos.x - b.x
  const dz = pos.z - b.z
  const ox = dx - Math.max(-b.hw, Math.min(b.hw, dx))
  const oz = dz - Math.max(-b.hd, Math.min(b.hd, dz))
  const d2 = ox * ox + oz * oz
  if (d2 >= r * r) return
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    pos.x += (ox / d) * (r - d)
    pos.z += (oz / d) * (r - d)
  } else if (b.hw - Math.abs(dx) < b.hd - Math.abs(dz)) {
    pos.x = b.x + Math.sign(dx || 1) * (b.hw + r)
  } else {
    pos.z = b.z + Math.sign(dz || 1) * (b.hd + r)
  }
}

/** The hall as a "world" for Player / FollowCamera. Reads the current layout. */
export const KEEP_WORLD = {
  resolve(pos, r) {
    for (let pass = 0; pass < 2; pass += 1) {
      for (const b of BOXES) pushOutOfBox(pos, b, r)
    }
    pos.x = Math.min(HALL.maxX - r, Math.max(HALL.minX + r, pos.x))
    pos.z = Math.min(HALL.maxZ - r, Math.max(HALL.minZ + r, pos.z))
  },
  groundAt(x, z) {
    if (!insideField(x, z, -0.2)) return 0
    if (MAP.walkway && MAP.walkway(x, z)) return WALK_TOP
    if (!livePool) return BED_TOP
    const i = cellAt(livePool, x, z)
    return i < 0 ? BED_TOP : Math.max(POOL_FLOOR, stackTopY(livePool.stacks[i]) - 0.02)
  },
  isBlocked(x, y, z, pad = 0.35) {
    if (y > HALL.height - pad || y < 0.2) return true
    if (x < HALL.minX + pad || x > HALL.maxX - pad || z < HALL.minZ + pad || z > HALL.maxZ - pad) return true
    for (const b of BOXES) {
      if (y > b.h) continue
      if (Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad) return true
    }
    return false
  },
}
