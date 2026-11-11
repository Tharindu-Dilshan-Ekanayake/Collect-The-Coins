/**
 * A map's coin pool, shared by client and server so both agree on every coin. Pure
 * functions, no dependencies beyond the map definitions.
 *
 * The pool holds map.coins real coins (1 coin = 1 coin). They lie in stacks on a
 * jittered grid: a stack's height is how many coins are left on that spot. Only the
 * top coin of each stack is drawn, so taking coins lowers the pile there until the
 * floor shows. Coins never come back. Cells on a walkway never hold coins.
 */

import { MAPS } from './maps.js'

/** Height of the basin rim around the pool. */
export const BED_TOP = 0.35
/** Top of the stone walkways through some pools. */
export const WALK_TOP = 0.42
/** Pool floor, under the coins. */
export const POOL_FLOOR = 0.03
/** Height of one coin in a stack. */
export const LAYER = 0.032
/** Coins in the first map (for defaults before a map is chosen). */
export const POOL_COINS = MAPS[0].coins

export const CHEST_REACH = 3.6
/** Furthest point from the player a grab can reach, in metres. */
export const GRAB_REACH = 9

export function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic layout: same map, same coins on every client and on the server.
 * Returns { map, field, count, cols, rows, cw, cd, x, z, seeds (4 per cell), stacks }.
 */
export function generatePool(map) {
  const { field, cells, maxStack, coins, walkway } = map
  const rand = mulberry32(map.seed)
  const w = field.maxX - field.minX
  const d = field.maxZ - field.minZ
  const cols = Math.round(Math.sqrt((cells * w) / d))
  const rows = Math.ceil(cells / cols)
  const cw = w / cols
  const cd = d / rows
  const x = new Float32Array(cells)
  const z = new Float32Array(cells)
  const seeds = new Float32Array(cells * 4)
  const stacks = new Uint8Array(cells)
  const open = []

  let total = 0
  const mean = coins / cells
  for (let i = 0; i < cells; i += 1) {
    const c = i % cols
    const r = Math.floor(i / cols)
    x[i] = field.minX + (c + 0.15 + rand() * 0.7) * cw
    z[i] = field.minZ + (r + 0.15 + rand() * 0.7) * cd
    for (let k = 0; k < 4; k += 1) seeds[i * 4 + k] = rand()
    // Cells on (or touching) a walkway stay empty.
    const cx = field.minX + (c + 0.5) * cw
    const cz = field.minZ + (r + 0.5) * cd
    if (walkway && (walkway(cx, cz) || walkway(x[i], z[i]))) continue
    open.push(i)
    // Gentle hills and dips of gold.
    const h = mean * (1 + 0.26 * Math.sin(x[i] * 0.31 + 1.3) * Math.cos(z[i] * 0.47) + 0.14 * Math.sin((x[i] + z[i]) * 0.21))
    stacks[i] = Math.max(2, Math.min(maxStack - 1, Math.round(h)))
    total += stacks[i]
  }
  // Nudge random stacks until the pool holds exactly map.coins.
  while (total !== coins) {
    const i = open[Math.floor(rand() * open.length)]
    if (total < coins && stacks[i] < maxStack) {
      stacks[i] += 1
      total += 1
    } else if (total > coins && stacks[i] > 1) {
      stacks[i] -= 1
      total -= 1
    }
  }
  return { map, field, count: cells, cols, rows, cw, cd, x, z, seeds, stacks }
}

/** Surface height of a stack. */
export const stackTopY = (stack) => POOL_FLOOR + stack * LAYER

/** Which cell holds the point (x, z), or -1 outside the pool. */
export function cellAt(pool, x, z) {
  const c = Math.floor((x - pool.field.minX) / pool.cw)
  const r = Math.floor((z - pool.field.minZ) / pool.cd)
  if (c < 0 || r < 0 || c >= pool.cols || r >= pool.rows) return -1
  const i = r * pool.cols + c
  return i < pool.count ? i : -1
}

/**
 * Plans a grab: up to `max` coins from stacks within `radius` of (px, pz), tallest
 * stacks first, one coin per stack per round. Does not change the pool.
 * Returns parallel arrays { cells, counts }.
 */
export function planTake(pool, px, pz, radius, max) {
  const cells = []
  const counts = []
  if (max <= 0) return { cells, counts }
  const { field } = pool
  const c0 = Math.max(0, Math.floor((px - radius - field.minX) / pool.cw))
  const c1 = Math.min(pool.cols - 1, Math.floor((px + radius - field.minX) / pool.cw))
  const r0 = Math.max(0, Math.floor((pz - radius - field.minZ) / pool.cd))
  const r1 = Math.min(pool.rows - 1, Math.floor((pz + radius - field.minZ) / pool.cd))
  const r2 = radius * radius
  const near = []
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const i = r * pool.cols + c
      if (i >= pool.count || pool.stacks[i] === 0) continue
      const dx = pool.x[i] - px
      const dz = pool.z[i] - pz
      if (dx * dx + dz * dz <= r2) near.push(i)
    }
  }
  near.sort((a, b) => pool.stacks[b] - pool.stacks[a])
  const left = near.map((i) => pool.stacks[i])
  const take = new Array(near.length).fill(0)
  let taken = 0
  let progress = true
  while (taken < max && progress) {
    progress = false
    for (let k = 0; k < near.length && taken < max; k += 1) {
      if (left[k] > 0) {
        left[k] -= 1
        take[k] += 1
        taken += 1
        progress = true
      }
    }
  }
  near.forEach((i, k) => {
    if (take[k]) {
      cells.push(i)
      counts.push(take[k])
    }
  })
  return { cells, counts }
}

/** Picks n coins from random non-empty stacks (dust sprites). Does not change the pool. */
export function planRandom(pool, n, rand = Math.random) {
  const cells = []
  const counts = []
  const plan = new Map()
  for (let tries = 0; tries < n * 8 && plan.size < n; tries += 1) {
    const i = Math.floor(rand() * pool.count)
    const already = plan.get(i) || 0
    if (pool.stacks[i] - already > 0) plan.set(i, already + 1)
  }
  for (const [i, k] of plan) {
    cells.push(i)
    counts.push(k)
  }
  return { cells, counts }
}

/** Applies a take; returns how many coins were actually removed. */
export function applyTake(pool, cells, counts) {
  let removed = 0
  for (let k = 0; k < cells.length; k += 1) {
    const i = cells[k]
    const n = Math.min(counts[k], pool.stacks[i])
    pool.stacks[i] -= n
    removed += n
  }
  return removed
}
