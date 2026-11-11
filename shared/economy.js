import { goblinCarry } from './goblins.js'

/**
 * Treasure map economy, shared by client and server (the server enforces it in
 * multiplayer). 1 coin = 1 coin everywhere, and coins are the only currency: every
 * coin you bank in a run goes into your wallet when the run ends.
 */

/**
 * Tools, cheapest first. radius = grab area (m), perGrab = coins per grab at the start,
 * step = extra coins per grab for each Bigger Grab level, rate = grabs per second while
 * holding. Passive tools grab around you by themselves.
 */
export const TOOLS = [
  { id: 'hands', key: '1', name: 'Bare Hands', desc: 'Pick coins up by the handful.', price: 0, radius: 0.55, perGrab: 1, step: 1, rate: 4, color: '#f0c39a' },
  { id: 'scoop', key: '2', name: 'Brass Scoop', desc: 'Scoops up a small heap per grab.', price: 120, radius: 0.9, perGrab: 4, step: 2, rate: 3, color: '#d9a441' },
  { id: 'rake', key: '3', name: 'Coin Rake', desc: 'Drags in a wide sweep of coins.', price: 500, radius: 1.5, perGrab: 9, step: 3, rate: 2.5, color: '#b5763a' },
  { id: 'vac', key: '4', name: 'Whirl-Vac', desc: 'Hold to whirl up everything around the nozzle.', price: 1500, radius: 2.1, perGrab: 16, step: 4, rate: 4, color: '#5fb3c9' },
  {
    id: 'lodestone',
    key: '5',
    name: 'Lodestone',
    desc: 'While held, nearby coins leap into your bag by themselves.',
    price: 4000,
    radius: 3.2,
    perGrab: 24,
    step: 5,
    rate: 2,
    passive: true,
    color: '#7f6bd9',
  },
]

export const bagCapacity = (lv) => 50 + lv * 60
export const bankRate = (lv) => 20 * (1 + 0.8 * lv)
export const speedBoost = (lv) => 1 + 0.08 * lv
export const grabRateBoost = (lv) => 1 + 0.25 * lv

export const UPGRADE_GROUPS = [
  { id: 'gear', label: 'Gear', blurb: 'Upgrades for you, whatever tool you hold.' },
  { id: 'tools', label: 'Tools', blurb: 'Make every grab count for more.' },
  { id: 'helpers', label: 'Goblins', blurb: 'Hire goblins: they scoop coins and carry them to your chest.' },
]

export const RUN_UPGRADES = [
  { id: 'pockets', group: 'gear', name: 'Deep Pockets', desc: 'Carry more coins before banking.', base: 15, max: 8, effect: (lv) => `${bagCapacity(lv)} coins` },
  { id: 'deposit', group: 'gear', name: 'Fast Deposit', desc: 'Empty your bag into a chest faster.', base: 25, max: 4, effect: (lv) => `${Math.round(bankRate(lv))}/s` },
  { id: 'boots', group: 'gear', name: 'Swift Boots', desc: 'Run faster.', base: 10, max: 5, effect: (lv) => `+${Math.round((speedBoost(lv) - 1) * 100)}%` },
  { id: 'steady', group: 'tools', name: 'Steady Hands', desc: 'Grab more often while holding.', base: 30, max: 4, effect: (lv) => `x${grabRateBoost(lv).toFixed(1)}` },
  {
    id: 'haul',
    group: 'tools',
    name: 'Bigger Grab',
    desc: 'Grab more coins every time. Bare Hands: one more coin per level.',
    base: 15,
    max: 8,
    effect: (lv) => `${1 + lv} coin${lv ? 's' : ''} a grab`,
  },
  {
    id: 'sprites',
    group: 'helpers',
    name: 'Hire a Goblin',
    desc: 'A goblin scoops coins from the pool and carries them to your chest.',
    base: 250,
    max: 5,
    effect: (lv) => `${lv} goblin${lv === 1 ? '' : 's'}`,
  },
  {
    id: 'spriteSpeed',
    group: 'helpers',
    name: 'Bigger Sacks',
    desc: 'Every goblin carries more coins and runs faster.',
    base: 500,
    max: 4,
    requires: 'sprites',
    effect: (lv) => `${goblinCarry(lv)} coins a trip`,
  },
]

/** Each level costs 1.6x the one before: cheap to start, still worth saving up for. */
export const upgradeCost = (upgrade, level) => Math.round(upgrade.base * 1.6 ** level)

/** Coins one grab may take with this tool and these levels. */
export const grabSize = (tool, levels) => Math.max(1, tool.perGrab + (levels.haul || 0) * (tool.step || 1))

/** Minimum milliseconds between grabs. */
export const grabInterval = (tool, levels) => 1000 / (tool.rate * grabRateBoost(levels.steady || 0))

/**
 * A player's saved progress on one map: what they own and have banked. Used by the
 * server (Mongo) and the client (localStorage); anything else in the input is dropped,
 * and values are clamped to the rules above so a tampered save can't break the game.
 */
export function sanitizeProgress(raw) {
  if (!raw || typeof raw !== 'object') return null
  const ids = TOOLS.map((t) => t.id)
  const tools = Array.isArray(raw.tools) ? [...new Set(raw.tools.filter((t) => ids.includes(t)))] : []
  if (!tools.includes('hands')) tools.unshift('hands')
  const levels = {}
  for (const u of RUN_UPGRADES) {
    const lv = Math.round(Number(raw.levels?.[u.id]) || 0)
    levels[u.id] = Math.min(u.max, Math.max(0, lv))
  }
  for (const u of RUN_UPGRADES) if (u.requires && !levels[u.requires]) levels[u.id] = 0
  const bank = Math.min(1e7, Math.max(0, Math.round(Number(raw.bank) || 0)))
  const tool = tools.includes(raw.tool) ? raw.tool : 'hands'
  return { bank, tools, tool, levels }
}
