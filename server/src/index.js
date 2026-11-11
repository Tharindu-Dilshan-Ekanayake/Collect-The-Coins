import http from 'node:http'

import { Server, matchMaker } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import cors from 'cors'
import express from 'express'

import { ENV, flushScores, verifyPlayer } from './bloxity.js'
import { LobbyRoom } from './rooms/LobbyRoom.js'
import { StageRoom } from './rooms/StageRoom.js'

/**
 * Game server: Colyseus rooms (lobby + stage) and the small HTTP API on one port.
 *
 *   lobby  up to 30 players; matchmaking opens another lobby when one is full
 *   stage  one private room per party (1-4 players), joined with reserved seats
 */

// Boxity hosting always sets PORT (2567). Locally 2568, so it never clashes with another
// Colyseus game on this machine using the usual 2567.
const PORT = Number(process.env.PORT) || 2568
// CLIENT_ORIGIN is injected by Legion (your game site); ALLOWED_ORIGINS adds more.
const ALLOWED_ORIGINS = [
  process.env.CLIENT_ORIGIN,
  ...(process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173').split(','),
]
  .map((o) => (o || '').trim())
  .filter(Boolean)

const app = express()
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))
app.use(express.json())

// Boxity polls this; it must answer fast and never touch game state.
app.get('/health', (_req, res) => {
  res.json({ ok: true })
})
app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

/**
 * Identity check for the Bloxity SDK (`authenticateWithServer('/api/legion-auth')`
 * posts { token, user }). Only the token is used: Boxity verifies it and the verified
 * user._id is the account id. req.body.user is client-supplied and ignored.
 */
app.post('/api/legion-auth', async (req, res) => {
  const { accountId, username } = await verifyPlayer(req.body?.token)
  if (!accountId) {
    res.status(401).json({ error: 'invalid or missing token' })
    return
  }
  res.json({ user: { legionId: accountId, username } })
})

/**
 * Webhook for future Bux purchases. Responds 200 immediately (the platform retries on
 * anything else). TODO: verify x-legion-webhook-secret, dedupe by transactionId.
 */
app.post('/api/legion-webhook', (req, res) => {
  console.log('[legion-webhook] payload:', JSON.stringify(req.body, null, 2))
  res.sendStatus(200)
})

const server = http.createServer(app)
// gracefullyShutdown is off: SIGTERM is handled below by draining instead.
const gameServer = new Server({ transport: new WebSocketTransport({ server }), gracefullyShutdown: false })

gameServer.define('lobby', LobbyRoom)
gameServer.define('stage', StageRoom)

gameServer.listen(PORT).then(() => {
  console.log(`Game server listening on port ${PORT} (Boxity env: ${ENV.env})`)
})

// Colyseus shuts down gracefully on SIGTERM/SIGINT; send any queued leaderboard
// scores before the pod goes away.
gameServer.onShutdown(() => flushScores())

/**
 * Zero-downtime deploys: on SIGTERM Legion waits up to 10 minutes. Stop taking new
 * players, send everyone in a lobby to a fresh pod (they reconnect on their own), let
 * stages in progress finish, then exit. Nobody is dropped mid-match.
 */
const DRAIN_MAX_MS = 9 * 60 * 1000
let draining = false

async function drain() {
  if (draining) return
  draining = true
  console.log('[drain] SIGTERM: no new players; letting stages finish')
  const started = Date.now()
  const rooms = async (name) => matchMaker.query({ name }).catch(() => [])
  // Lock lobbies (matchmaking skips locked rooms), then move their players on.
  for (const info of await rooms('lobby')) {
    const room = matchMaker.getLocalRoomById(info.roomId)
    room?.lock()
    room?.disconnect()
  }
  for (const info of await rooms('stage')) matchMaker.getLocalRoomById(info.roomId)?.lock()
  while (Date.now() - started < DRAIN_MAX_MS) {
    const busy = (await rooms('stage')).some((r) => r.clients > 0)
    if (!busy) break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  console.log('[drain] done, exiting')
  await gameServer.gracefullyShutdown(true).catch(() => {})
  process.exit(0)
}

process.on('SIGTERM', drain)
process.on('SIGINT', drain)
