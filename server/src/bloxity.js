import { BOARDS } from '../../shared/leaderboards.js'

/**
 * Boxity platform access for the game server: the told environment, player identity
 * verification and server-side leaderboard reports.
 *
 * Boxity hosting injects the environment on every deploy. The fallbacks below are
 * used only when a variable is missing (e.g. local dev) and are the only place these
 * hosts appear in the server.
 */
export const ENV = Object.freeze({
  env: process.env.BLOXITY_ENV || 'prod',
  apiUrl: (process.env.BLOXITY_API_URL || 'https://api.bloxity.io').replace(/\/+$/, ''),
  matchmakerUrl: (process.env.BLOXITY_MATCHMAKER_URL || 'https://play.bloxity.io').replace(/\/+$/, ''),
  portalUrl: (process.env.BLOXITY_PORTAL_URL || 'https://bloxity.io').replace(/\/+$/, ''),
  staticUrl: (process.env.BLOXITY_STATIC_URL || 'https://static.bloxity.io').replace(/\/+$/, ''),
})

// Hosting injects BLOXITY_GAME_ID; the slug is the same id unless set separately.
const GAME_SLUG = process.env.BLOXITY_GAME_SLUG || process.env.GAME_SLUG || process.env.BLOXITY_GAME_ID || 'collect-the-coins'
const GAME_ID = process.env.BLOXITY_GAME_ID || ''
const REPORT_TOKEN = process.env.BLOXITY_REPORT_TOKEN || ''
const VERIFY_TIMEOUT_MS = 3000
const REPORT_EVERY_MS = 15000
const REPORT_BATCH = 200

const GUEST = Object.freeze({ accountId: null, username: null })

/**
 * Verifies a player's Legion.SDK.auth.getToken() with Boxity. Only the verified
 * user._id is ever an account id; anything else (no token, refused, network error,
 * timeout) is a guest. The token is never decoded here.
 *
 * @param {unknown} token
 * @returns {Promise<{ accountId: string|null, username: string|null }>}
 */
export async function verifyPlayer(token) {
  if (typeof token !== 'string' || !token || token.length > 8192) return GUEST
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)
  try {
    const res = await fetch(`${ENV.apiUrl}/v1/auth/game-token/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameSlug: GAME_SLUG }),
      signal: controller.signal,
    })
    if (!res.ok) return GUEST
    const data = await res.json().catch(() => null)
    const user = data?.user
    if (data?.valid === false || !user?._id) return GUEST
    return { accountId: String(user._id), username: user.displayName || user.username || null }
  } catch {
    return GUEST
  } finally {
    clearTimeout(timer)
  }
}

// --- Leaderboards -------------------------------------------------------------------

/** Pending { board, userId, score } rows, sent in batches. */
let queue = []
let warned = false
let timer = null
let inFlight = Promise.resolve()

const boardIds = new Set(BOARDS.map((b) => b.id))

/**
 * Queues a score from state the server owns. For 'sum' boards pass the amount just
 * gained; for 'best'/'latest' boards the score itself. Guests (no verified account)
 * are skipped. Nothing is sent without BLOXITY_REPORT_TOKEN and BLOXITY_GAME_ID.
 */
export function reportScore(boardId, accountId, score) {
  if (!accountId || !boardIds.has(boardId) || !Number.isFinite(score)) return
  if (!REPORT_TOKEN || !GAME_ID) {
    if (!warned) {
      warned = true
      console.info('[bloxity] leaderboard reports disabled (BLOXITY_REPORT_TOKEN / BLOXITY_GAME_ID not set)')
    }
    return
  }
  // Report only legion_ identities, without any "#m..." mode suffix.
  const id = String(accountId).replace(/^legion_/, '').split('#')[0]
  queue.push({ board: boardId, userId: `legion_${id}`, score })
  timer ||= setInterval(() => {
    flushScores()
  }, REPORT_EVERY_MS)
  timer.unref?.()
}

async function send(scores) {
  try {
    const res = await fetch(`${ENV.apiUrl}/v1/leaderboards/hosted/${encodeURIComponent(GAME_ID)}/report`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REPORT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ boards: BOARDS, scores }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      console.warn(`[bloxity] leaderboard report failed (${res.status})`, data?.error || '')
      return
    }
    const dropped = data?.dropped
    const any = typeof dropped === 'number' ? dropped > 0 : dropped && Object.values(dropped).some(Boolean)
    if (any) console.warn('[bloxity] leaderboard report dropped scores:', dropped)
  } catch (err) {
    console.warn('[bloxity] leaderboard report error:', err?.message || err)
  }
}

/** Sends everything queued now (e.g. at the end of a run). Resolves when done. */
export function flushScores() {
  if (!queue.length) return inFlight
  const scores = queue
  queue = []
  inFlight = inFlight.then(async () => {
    for (let i = 0; i < scores.length; i += REPORT_BATCH) await send(scores.slice(i, i + REPORT_BATCH))
  })
  return inFlight
}
