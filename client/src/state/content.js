/**
 * Static game content: maps, stalls, shop items and leaderboard rows.
 * Everything the lobby shows is defined here so names and numbers live in one file.
 */

import { MAPS } from '@shared/maps.js'

/** Party slots on the plaza (shared with the server). Every slot can host any map. */
export { MAX_PARTY, PARTY_SLOTS } from '@shared/lobby.js'

/** Seconds between CREATE and the party starting. */
export const PARTY_START_S = 5

/**
 * The maps, picked in the create-party panel. Each is its own stage; clearing one
 * (banking every coin) unlocks the next. `image` is a real screenshot of the map.
 */
export const MODES = MAPS.map((map, i) => ({
  id: map.id,
  group: 'story',
  name: map.name,
  tagline: map.tagline,
  chapter: i + 1,
  coins: map.coins,
  image: `/maps/${map.id}.webp`,
  color: ['#ffc94d', '#7fd3ff', '#5fe0a0'][i],
  timeLimit: 'No limit',
  unlockHint: i > 0 ? `Clear ${MAPS[i - 1].name} to unlock` : '',
}))

export const MODE_GROUPS = [{ id: 'story', label: 'STORY MODE', color: '#3557c4' }]

export const DEFAULT_MODE = MAPS[0].id

/** The lobby has no stalls: it is only for going to stages. */
export const STALLS = []

export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', color: '#4caf50', locked: false },
  { id: 'normal', label: 'Normal', color: '#3b82c4', locked: true },
  { id: 'hard', label: 'Hard', color: '#c47a2c', locked: true },
  { id: 'extreme', label: 'Extreme', color: '#b8384a', locked: true },
]


/** Placeholder rows until a real leaderboard service exists. */
const NAMES = [
  'MossyMaple',
  'TinkerTom',
  'PixelPip',
  'LunaLoot',
  'CobbleQueen',
  'SirSweeps',
  'BrassBadger',
  'MintyMoth',
  'RustyRook',
  'HazelHoard',
]

export const LEADERBOARDS = [
  {
    id: 'time',
    title: 'Fastest Clear',
    unit: 'Time',
    rows: NAMES.map((name, i) => [name, `0${1 + Math.floor(i / 3)}:${String(12 + i * 7).padStart(2, '0')}.${(i * 3) % 10}`]),
  },
  {
    id: 'coins',
    title: 'Most Gold',
    unit: 'Coins',
    rows: [...NAMES].reverse().map((name, i) => [name, String(98420 - i * 7315).replace(/\B(?=(\d{3})+$)/g, ',')]),
  },
  {
    id: 'runs',
    title: 'Most Runs',
    unit: 'Runs',
    rows: [...NAMES.slice(4), ...NAMES.slice(0, 4)].map((name, i) => [name, String(612 - i * 47)]),
  },
]
