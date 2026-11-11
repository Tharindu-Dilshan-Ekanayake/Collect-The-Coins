import { create } from 'zustand'

import { getEnvironment, PROD_ENVIRONMENT } from '../bloxity/environment'
import { safeCall, waitForSDK } from '../bloxity/sdk'
import { useBloxityStore } from '../bloxity/store'
import { registerDebug } from '../game/lib/debug'
import { useGame } from '../state/game'
import { useRun } from '../state/run'
import { MAPS } from '../state/stageContent'

/**
 * Multiplayer link to the Colyseus server (server/).
 *
 *   lobby  up to 30 players per room. Joining fills the first lobby with space; when
 *          a party leaves for a stage they leave the lobby, so their places open up.
 *   stage  a private room per party (1-4 players) joined with a seat the lobby reserved.
 *
 * colyseus.js is loaded lazily after the lobby is on screen, so it never delays the
 * first frame. If the server can't be reached the game runs offline (solo) and keeps
 * retrying in the background.
 *
 * Writers here are network callbacks and intervals, never useFrame.
 */

/** Boxity hosting id of the game server (not a URL). Set when the server is hosted on Boxity. */
const HOSTING_ID = import.meta.env.VITE_BLOXITY_HOSTING_ID
/** Self-hosted server URL, only for servers NOT hosted on Boxity. */
const SELF_HOSTED = import.meta.env.VITE_GAME_SERVER
const RETRY_MIN_MS = 3000
const RETRY_MAX_MS = 15000
/** Stop retrying after this long without a connection (a cold start takes up to ~45 s). */
const GIVE_UP_MS = 60000
const CONSENTED = 4000
/** ?roomId= from Boxity's Join button or a friend invite: joined once, at launch. */
const LAUNCH_ROOM = new URLSearchParams(window.location.search).get('roomId')

export const useNet = create(() => ({
  /** 'idle' | 'connecting' | 'online' | 'offline' */
  status: 'idle',
  /** Session id in the current room. */
  myId: null,
  lobbyCount: 0,
  /** Per party slot: { host, hostName, modeId, difficulty, size, left, members, standing }. */
  slots: [],
  /** Bumps when the lobby/stage room changes, so scene components re-read it. */
  roomVersion: 0,
  notice: null,
}))

/** Client for the current endpoint. A stage seat is consumed on the same pod (same client). */
let client = null
let lobby = null
let stage = null
let joining = false
let retryTimer = 0
let retryDelay = RETRY_MIN_MS
let profile = { name: '' }
let slotsKey = ''
let colyseusModule = null
let failingSince = 0
let launchRoomTried = false
/** Session ids already announced to Boxity's friend-join toasts. */
let announced = new Set()

registerDebug('net', useNet)

export const getLobby = () => lobby
export const getStage = () => stage

const bump = (patch = {}) => useNet.setState((s) => ({ ...patch, roomVersion: s.roomVersion + 1 }))

const loadColyseus = () => (colyseusModule ||= import('colyseus.js'))

/**
 * Where to connect. Hosted on Boxity: ask the SDK on EVERY connect (it picks the pod,
 * reuses our seat on retries and carries the party ticket). A local Boxity stack tells
 * its game server in playUrl. Otherwise a self-hosted URL, the dev server, or nothing.
 */
async function resolveEndpoint() {
  const sdk = await waitForSDK({ timeoutMs: 8000 }).catch(() => null)
  if (HOSTING_ID && sdk?.net?.resolveEndpoint) {
    const { endpoint } = await sdk.net.resolveEndpoint(HOSTING_ID)
    return endpoint
  }
  if (SELF_HOSTED) return SELF_HOSTED
  const env = getEnvironment()
  // On a plain dev server the SDK also says 'local' but leaves playUrl on real Boxity,
  // which only serves hosted games ("Not Found"): that one is not our server.
  if (env.env === 'local' && env.playUrl !== PROD_ENVIRONMENT.playUrl) return env.playUrl.replace(/^http/, 'ws')
  // Dev server: the game server from server/ (npm run dev) on this machine.
  if (import.meta.env.DEV) return `ws://${window.location.hostname}:2568`
  return null
}

/** A NEW client from a fresh resolve: each endpoint is pinned to one pod. */
async function freshClient() {
  const [{ Client }, endpoint] = await Promise.all([loadColyseus(), resolveEndpoint()])
  if (!endpoint) throw new Error('no game server for this environment')
  client = new Client(endpoint)
  return client
}

/** Verified identity for the server: the Boxity token, read fresh on every join. */
function joinOptions() {
  const token = safeCall(window.Legion?.SDK?.auth?.getToken?.bind(window.Legion.SDK.auth)) || null
  return { ...profile, look: currentLook(), token }
}

/** Boxity's Join button / invites open the game with ?roomId=: try that room first. */
async function joinLaunchRoom(c) {
  if (launchRoomTried || !LAUNCH_ROOM) return null
  launchRoomTried = true
  try {
    if (HOSTING_ID) {
      // Hosted: find the pod that holds the room, then join it there.
      const res = await fetch(`${getEnvironment().playUrl}/v1/dir/${HOSTING_ID}/list`)
      const data = await res.json()
      const rooms = Array.isArray(data) ? data : data.rooms || []
      const found = rooms.find((r) => (r.roomId || r.id) === LAUNCH_ROOM)
      if (!found?.joinUrl) return null
      const { Client } = await loadColyseus()
      client = new Client(found.joinUrl)
      return await client.joinById(LAUNCH_ROOM, joinOptions())
    }
    return await c.joinById(LAUNCH_ROOM, joinOptions())
  } catch {
    return null // gone or full: normal matchmaking
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer)
  failingSince ||= Date.now()
  if (Date.now() - failingSince > GIVE_UP_MS) return // stay offline until the next lobby visit
  retryTimer = setTimeout(joinLobby, retryDelay)
  retryDelay = Math.min(RETRY_MAX_MS, retryDelay * 2)
}

/** Boxity friend-join toasts for players in our room. */
function announce(players, myId) {
  const game = window.Legion?.SDK?.game
  const first = announced.size === 0
  players.forEach((p, id) => {
    if (id === myId || announced.has(id)) return
    announced.add(id)
    if (!game) return
    if (first) safeCall(game.playerInRoom?.bind(game), p.name)
    else safeCall(game.playerJoined?.bind(game), p.name)
  })
}

/** What other players need to draw us: the equipped Boxity ids, as JSON. */
function currentLook() {
  return JSON.stringify(useBloxityStore.getState().equipped || {})
}

/** Sends our name and look to whatever room we're in (they can change after joining). */
function sendProfile() {
  const msg = { name: profile.name, look: currentLook() }
  lobby?.send('profile', msg)
  stage?.send('profile', msg)
}

/** Name shown to other players: applies now, and on the next room join. */
export function setProfile(next) {
  const changed = Object.keys(next).some((k) => profile[k] !== next[k])
  profile = { ...profile, ...next }
  if (changed) sendProfile()
}

// A new outfit (or a late login) updates everyone who can see us.
useBloxityStore.subscribe((s, prev) => {
  if (s.equipped !== prev.equipped) sendProfile()
})

export async function joinLobby() {
  if (lobby || joining || useGame.getState().scene !== 'lobby') return
  joining = true
  clearTimeout(retryTimer)
  if (useNet.getState().status !== 'online') useNet.setState({ status: 'connecting' })
  try {
    const c = await freshClient()
    const room = (await joinLaunchRoom(c)) || (await c.joinOrCreate('lobby', joinOptions()))
    if (useGame.getState().scene !== 'lobby') {
      room.leave()
      return
    }
    attachLobby(room)
    retryDelay = RETRY_MIN_MS
    failingSince = 0
  } catch (err) {
    console.info('[net] lobby unavailable, playing offline:', err?.message || err)
    useNet.setState({ status: 'offline', myId: null, slots: [], lobbyCount: 0 })
    scheduleRetry()
  } finally {
    joining = false
  }
}

function attachLobby(room) {
  lobby = room
  slotsKey = ''
  announced = new Set()
  bump({ status: 'online', myId: room.sessionId, notice: null })

  room.onStateChange((state) => syncLobby(room, state))
  room.onMessage('party:go', (m) => goToStage(m))
  room.onMessage('party:error', (m) => useNet.setState({ notice: m?.message || 'Could not start the stage.' }))
  room.onLeave((code) => {
    if (lobby !== room) return
    lobby = null
    bump({ status: 'offline', myId: null, slots: [], lobbyCount: 0 })
    if (code !== CONSENTED) scheduleRetry()
  })

  const slot = useGame.getState().activeSlot
  room.send('slot', { slot: slot ?? -1 })
  sendProfile() // the guest identity may have arrived while we were connecting
  sendDance()
}

/** Mirrors the six slots into the store, only when something visible changed. */
function syncLobby(room, state) {
  const standing = [0, 0, 0, 0, 0, 0]
  state.players.forEach((p) => {
    if (p.slot >= 0 && p.slot < standing.length) standing[p.slot] += 1
  })
  const slots = []
  state.slots.forEach((s, i) => {
    slots.push({
      host: s.host,
      hostName: s.host ? state.players.get(s.host)?.name || 'Someone' : '',
      modeId: s.modeId,
      difficulty: s.difficulty,
      size: s.size,
      left: s.left,
      members: Array.from(s.members),
      standing: standing[i] || 0,
    })
  })
  announce(state.players, room.sessionId)
  const key = `${state.players.size}|${JSON.stringify(slots)}`
  if (key === slotsKey) return
  slotsKey = key
  useNet.setState({ slots, lobbyCount: state.players.size })
  // Stepping onto a party someone else hosts joins it; the create panel isn't needed.
  const game = useGame.getState()
  if (game.panel === 'party' && game.activeSlot !== null) {
    const s = slots[game.activeSlot]
    if (s?.host && s.host !== room.sessionId) game.closePanel()
  }
}

/** The lobby reserved us a seat in the party's stage room. */
async function goToStage({ reservation, modeId, difficulty }) {
  let room
  try {
    // Same client (same pod) as the lobby that reserved the seat.
    room = await client.consumeSeatReservation(reservation)
  } catch (err) {
    console.warn('[net] could not join the stage', err)
    useNet.setState({ notice: 'Could not join the stage. Try again.' })
    return
  }
  attachStage(room)
  // Leaving the lobby frees this player's place for someone new.
  const old = lobby
  lobby = null
  slotsKey = ''
  old?.leave()
  useNet.setState({ slots: [], lobbyCount: 0 })
  const game = useGame.getState()
  game.setParty({ difficulty: difficulty || 'easy' })
  game.enterStage(modeId || 'story')
}

function attachStage(room) {
  stage = room
  announced = new Set()
  bump({ status: 'online', myId: room.sessionId })
  sendProfile()
  // The coin field registers its own handlers once the stage chunk has loaded; these
  // keep early messages from being reported as unhandled. It asks for a fresh pool then.
  for (const type of ['pool', 'taken', 'rejected']) room.onMessage(type, () => {})
  room.onMessage('result', (result) => useRun.getState().netResult(result))
  room.onMessage('lobby:go', (m) => goToLobby(m))
  room.onStateChange((state) => {
    announce(state.players, room.sessionId)
    const me = state.players.get(room.sessionId)
    if (me && useRun.getState().net === room) useRun.getState().syncServer(me, state)
  })
  room.onLeave(() => {
    if (stage !== room) return
    stage = null
    // Lost the server mid-run: carry on offline with what we have.
    if (useRun.getState().net === room) useRun.setState({ net: null })
    bump({ status: 'offline', myId: null })
  })
}

/** Tell the lobby we are dancing (only right after clearing a map). */
function sendDance() {
  if (Date.now() < useGame.getState().celebrateUntil) lobby?.send('dance')
}

/** The stage reserved the team a seat in one lobby: take it and arrive dancing. */
async function goToLobby({ reservation }) {
  if (lobby || joining || !client) return
  joining = true
  try {
    attachLobby(await client.consumeSeatReservation(reservation))
  } catch (err) {
    console.warn('[net] could not rejoin the lobby with the team', err)
  } finally {
    joining = false
  }
  const game = useGame.getState()
  if (game.scene === 'stage') {
    const index = MAPS.findIndex((m) => m.id === game.modeId)
    game.returnToLobby({ unlocked: MAPS[index + 1]?.name || null })
  }
  sendDance()
}

function leaveStage() {
  const old = stage
  stage = null
  old?.leave()
}

// React to the game moving between lobby and stage, and to slot changes.
useGame.subscribe((s, prev) => {
  // Connect once the lobby is on screen, so the network never delays the first frame.
  if (s.lobbyReady && !prev.lobbyReady) joinLobby()
  if (s.activeSlot !== prev.activeSlot) lobby?.send('slot', { slot: s.activeSlot ?? -1 })
  if (s.scene === prev.scene) return
  if (s.scene === 'lobby') {
    leaveStage()
    failingSince = 0
    retryDelay = RETRY_MIN_MS
    if (s.lobbyReady) joinLobby()
  } else {
    clearTimeout(retryTimer)
  }
})

/** Online party actions; each returns false when offline so the caller can go solo. */
export const party = {
  create(settings) {
    if (!lobby) return false
    lobby.send('party:create', { modeId: settings.modeId, difficulty: settings.difficulty, size: settings.size })
    return true
  },
  start() {
    if (!lobby) return false
    lobby.send('party:start')
    return true
  },
  leave() {
    if (!lobby) return false
    lobby.send('party:leave')
    return true
  },
}

/** The party slot this player belongs to online, or null. */
export function myPartySlot(slots, myId) {
  if (!myId) return null
  const i = slots.findIndex((s) => s.members.includes(myId))
  return i >= 0 ? i : null
}

// Close our rooms when the page goes away or hot-reloads. Without this an old
// connection can linger and show up as a ghost player standing in the plaza.
function leaveAll() {
  clearTimeout(retryTimer)
  lobby?.leave()
  stage?.leave()
}
window.addEventListener('pagehide', leaveAll)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('pagehide', leaveAll)
    leaveAll()
  })
}
