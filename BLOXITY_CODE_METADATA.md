---
canDie: false
hasScore: true
boards:
  - { id: coins, label: Most Gold, order: desc, mode: sum, format: compact, reset: weekly }
  - { id: runs, label: Most Runs, order: desc, mode: sum, format: number, reset: none }
  - { id: clear_keep, label: "Fastest Clear: Gilded Keep", order: asc, mode: best, format: time, reset: none }
  - { id: clear_frost, label: "Fastest Clear: Frostfang Vault", order: asc, mode: best, format: time, reset: none }
  - { id: clear_grotto, label: "Fastest Clear: Emerald Grotto", order: asc, mode: best, format: time, reset: none }
clientDir: client
buildCommand: npm ci && npm run build
distDir: client/dist
notApplicable:
  deathScreen: The player cannot die (canDie is false).
  rewardedAds: Nothing in the game is earned by watching an ad.
  gemsPurchases: The game sells nothing; coins are earned only by playing.
---

# Coinhaven: Boxity code metadata

Players collect coins from a shared treasure pool (1–4 per stage, up to 30 per lobby),
bank them at the chest and spend them on tools and upgrades. The Colyseus game server
lives in `server/`, the client in `client/`, shared rules in `shared/`.

## canDie: false

Derived from the code: the player has no health and nothing in the game hurts them.
Falling out of the world just puts them back at the spawn point. Change this to `true`
if you add a way to die; the game then needs Boxity's death screen.

## hasScore: true

Derived from the code: the lobby already shows coin and fastest-clear leaderboards.
The boards above come from `shared/leaderboards.js`. The client declares them with
`Legion.SDK.leaderboard.define()` and the server submits every score (from state it
owns, batched) with `BLOXITY_REPORT_TOKEN`. Board ids are permanent once created.
Edit this list if you want different boards.
