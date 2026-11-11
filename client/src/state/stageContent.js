/**
 * Treasure map content. The rules live in /shared so the Colyseus server enforces
 * exactly the same economy in multiplayer; this file only re-exports them.
 */
export {
  RUN_UPGRADES,
  TOOLS,
  UPGRADE_GROUPS,
  bagCapacity,
  bankRate,
  grabInterval,
  grabRateBoost,
  grabSize,
  sanitizeProgress,
  speedBoost,
  upgradeCost,
} from '@shared/economy.js'
export { MAPS, isUnlocked, mapById } from '@shared/maps.js'
export { GRAB_REACH, POOL_COINS } from '@shared/pool.js'
