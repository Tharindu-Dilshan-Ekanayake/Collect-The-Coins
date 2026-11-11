/**
 * Goblin helpers, shared by the server (multiplayer) and the client (solo play).
 *
 * Each goblin walks into the pool, scoops a sack of coins, carries it to its owner's
 * chest and drops it in, then goes back for more. Hired with the "sprites" upgrade
 * (ids kept so old saves still load); the "spriteSpeed" upgrade gives bigger sacks and
 * quicker feet.
 */
import { planTake } from './pool.js'

export const GOBLIN_MAX = 5
/** Coins in one full sack. */
export const goblinCarry = (lv) => 20 + lv * 15
/** Walking speed, metres per second. */
export const goblinSpeed = (lv) => 4 + lv * 0.8

const SCOOP_S = 1.1
const DROP_S = 0.6
const SCOOP_RADIUS = 1.2

export const GOBLIN_PHASE = Object.freeze({ toPool: 0, scoop: 1, toChest: 2, drop: 3 })
const P = GOBLIN_PHASE

/** Where goblins empty their sacks: just in front of the chest. */
export function chestDropPoint(chest) {
  return { x: chest.x + Math.sin(chest.ry) * 2.0, z: chest.z + Math.cos(chest.ry) * 2.0 }
}

export function createGoblin(chest, rand = Math.random) {
  const d = chestDropPoint(chest)
  return {
    x: d.x + (rand() - 0.5) * 1.6,
    z: d.z + (rand() - 0.5) * 1.6,
    ry: 0,
    phase: P.toPool,
    tx: 0,
    tz: 0,
    t: 0,
    carry: 0,
    hasTarget: false,
  }
}

/** A stack that still has coins, the nearest of a few random picks. */
function pickTarget(g, pool, rand) {
  let best = -1
  let bestD = Infinity
  for (let k = 0; k < 12; k += 1) {
    const i = Math.floor(rand() * pool.count)
    if (!pool.stacks[i]) continue
    const d = (pool.x[i] - g.x) ** 2 + (pool.z[i] - g.z) ** 2
    if (d < bestD) {
      best = i
      bestD = d
    }
  }
  if (best < 0) {
    for (let i = 0; i < pool.count; i += 1) {
      if (pool.stacks[i]) {
        best = i
        break
      }
    }
  }
  if (best < 0) return false
  g.tx = pool.x[best]
  g.tz = pool.z[best]
  return true
}

/** Moves toward (tx, tz); true once there. */
function walk(g, tx, tz, speed, dt) {
  const dx = tx - g.x
  const dz = tz - g.z
  const d = Math.hypot(dx, dz)
  if (d < 0.05) return true
  const step = Math.min(d, speed * dt)
  g.x += (dx / d) * step
  g.z += (dz / d) * step
  g.ry = Math.atan2(dx, dz)
  return step >= d
}

/**
 * Advances one goblin by dt seconds. `take(cells, counts)` removes coins from the pool
 * and returns how many; `bank(n)` credits the owner.
 */
export function stepGoblin(g, dt, { pool, chest, level, rand = Math.random, take, bank }) {
  if (g.phase === P.toPool) {
    if (!g.hasTarget) {
      g.hasTarget = pickTarget(g, pool, rand)
      if (!g.hasTarget) return // pool is empty
    }
    if (walk(g, g.tx, g.tz, goblinSpeed(level), dt)) {
      g.phase = P.scoop
      g.t = 0
    }
  } else if (g.phase === P.scoop) {
    g.t += dt
    if (g.t >= SCOOP_S) {
      const plan = planTake(pool, g.x, g.z, SCOOP_RADIUS, goblinCarry(level))
      g.carry = plan.cells.length ? take(plan.cells, plan.counts) : 0
      g.hasTarget = false
      g.phase = g.carry > 0 ? P.toChest : P.toPool
    }
  } else if (g.phase === P.toChest) {
    const d = chestDropPoint(chest)
    if (walk(g, d.x, d.z, goblinSpeed(level), dt)) {
      g.phase = P.drop
      g.t = 0
    }
  } else if (g.phase === P.drop) {
    g.t += dt
    if (g.t >= DROP_S) {
      if (g.carry) bank(g.carry)
      g.carry = 0
      g.phase = P.toPool
    }
  }
}
