import { Room, matchMaker } from '@colyseus/core'

import {
  LOBBY_CAPACITY,
  MAX_PARTY,
  PARTY_FULL_S,
  PARTY_SLOTS,
  PARTY_WAIT_S,
  PLAYABLE_MODES,
  PLAZA_LIMIT,
  UNLOCKED_DIFFICULTIES,
  looksFor,
  sanitizeColor,
  sanitizeLook,
  sanitizeName,
} from '../../../shared/lobby.js'
import { verifyPlayer } from '../bloxity.js'
import { identityOf, sanitizeGid, teamKey } from '../progress.js'
import { LobbyPlayer, LobbyState, Slot } from './schema.js'

const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback)

/**
 * The lobby plaza: up to 30 players walking around and forming parties on the six
 * slots. `joinOrCreate('lobby')` fills a lobby to 30 and then opens a new one; when
 * a party leaves for a stage their places free up for new players.
 */
export class LobbyRoom extends Room {
  maxClients = LOBBY_CAPACITY

  onCreate() {
    this.setState(new LobbyState())
    for (let i = 0; i < PARTY_SLOTS; i += 1) this.state.slots.push(new Slot())
    this.setPatchRate(50)
    /** Guest ids by session (server only), so a party's team can be told apart. */
    this.gids = new Map()
    /** Slots whose party is being sent to a stage right now. */
    this.launching = new Set()
    /** Epoch ms each slot's party leaves (server only; clients see whole seconds left). */
    this.startsAt = new Array(PARTY_SLOTS).fill(0)

    this.onMessage('move', (client, m) => {
      const p = this.state.players.get(client.sessionId)
      if (!p || !m) return
      let x = num(m.x, p.x)
      let z = num(m.z, p.z)
      const r = Math.hypot(x, z)
      if (r > PLAZA_LIMIT) {
        x *= PLAZA_LIMIT / r
        z *= PLAZA_LIMIT / r
      }
      p.x = x
      p.z = z
      p.y = Math.min(4, Math.max(0, num(m.y, p.y)))
      p.ry = num(m.ry, p.ry)
      p.speed = Math.min(20, Math.max(0, num(m.speed, 0)))
    })

    this.onMessage('slot', (client, m) => {
      const slot = Number.isInteger(m?.slot) && m.slot >= 0 && m.slot < PARTY_SLOTS ? m.slot : -1
      this.setSlot(client.sessionId, slot)
    })

    this.onMessage('party:create', (client, m) => this.createParty(client.sessionId, m || {}))

    this.onMessage('party:start', (client) => {
      const index = this.state.slots.findIndex((s) => s.host === client.sessionId)
      if (index >= 0) this.startsAt[index] = Date.now()
    })

    this.onMessage('party:leave', (client) => this.leaveParty(client.sessionId))

    // A team that just cleared a map arrives dancing; everyone in the lobby sees it.
    this.onMessage('dance', (client) => {
      const p = this.state.players.get(client.sessionId)
      if (!p) return
      p.dance = true
      this.clock.setTimeout(() => {
        const q = this.state.players.get(client.sessionId)
        if (q) q.dance = false
      }, 8000)
    })

    // Name and look can arrive after joining (Boxity loads the guest identity late).
    this.onMessage('profile', (client, m) => {
      const p = this.state.players.get(client.sessionId)
      if (!p || !m) return
      if (typeof m.name === 'string') p.name = sanitizeName(m.name)
      if (m.look !== undefined) p.look = sanitizeLook(m.look)
    })

    this.setSimulationInterval(() => this.tick(), 250)
  }

  /**
   * Identity: Boxity verifies the token; only the returned account id is trusted.
   * No token or a refused one = guest (never an id the client sent).
   */
  async onAuth(_client, options) {
    return verifyPlayer(options?.token)
  }

  onJoin(client, options, auth) {
    const p = new LobbyPlayer()
    p.name = sanitizeName(options?.name || auth?.username)
    p.uid = auth?.accountId || ''
    this.gids.set(client.sessionId, sanitizeGid(options?.gid))
    p.look = sanitizeLook(options?.look)
    const looks = looksFor(p.name)
    p.shirt = sanitizeColor(options?.shirt, looks.shirt)
    p.pants = sanitizeColor(options?.pants, looks.pants)
    p.skin = sanitizeColor(options?.skin, looks.skin)
    p.x = (Math.random() - 0.5) * 6
    p.z = 13 + Math.random() * 3
    this.state.players.set(client.sessionId, p)
  }

  onLeave(client) {
    this.leaveParty(client.sessionId)
    this.gids.delete(client.sessionId)
    this.state.players.delete(client.sessionId)
  }

  setSlot(id, slot) {
    const p = this.state.players.get(id)
    if (!p || p.slot === slot) return
    if (p.slot >= 0) this.leaveParty(id)
    p.slot = slot
    if (slot < 0) return
    // Stepping onto a hosted slot joins that party if there is room.
    const s = this.state.slots[slot]
    if (s.host && !s.members.includes(id) && s.members.length < s.size) {
      s.members.push(id)
      this.shortenWhenFull(slot)
    }
  }

  createParty(id, m) {
    const p = this.state.players.get(id)
    if (!p || p.slot < 0) return
    const s = this.state.slots[p.slot]
    if (s.host || this.launching.has(p.slot)) return
    const modeId = PLAYABLE_MODES.includes(m.modeId) ? m.modeId : PLAYABLE_MODES[0]
    const difficulty = UNLOCKED_DIFFICULTIES.includes(m.difficulty) ? m.difficulty : UNLOCKED_DIFFICULTIES[0]
    const size = Math.min(MAX_PARTY, Math.max(1, Math.round(num(m.size, MAX_PARTY))))
    s.host = id
    s.modeId = modeId
    s.difficulty = difficulty
    s.size = size
    s.members.clear()
    s.members.push(id)
    // Everyone already standing on the slot comes along, up to the party size.
    this.state.players.forEach((other, otherId) => {
      if (otherId !== id && other.slot === p.slot && s.members.length < size) s.members.push(otherId)
    })
    this.startsAt[p.slot] = Date.now() + PARTY_WAIT_S * 1000
    this.shortenWhenFull(p.slot)
    this.updateLeft(p.slot)
  }

  shortenWhenFull(index) {
    const s = this.state.slots[index]
    if (s.members.length >= s.size) this.startsAt[index] = Math.min(this.startsAt[index], Date.now() + PARTY_FULL_S * 1000)
  }

  updateLeft(index) {
    const s = this.state.slots[index]
    const left = s.host ? Math.max(0, Math.ceil((this.startsAt[index] - Date.now()) / 1000)) : 0
    if (s.left !== left) s.left = left
  }

  leaveParty(id) {
    this.state.slots.forEach((s, index) => {
      const at = s.members.indexOf(id)
      if (at < 0 || this.launching.has(index)) return
      s.members.splice(at, 1)
      if (s.host !== id) return
      if (s.members.length) s.host = s.members[0]
      else this.resetSlot(index)
    })
  }

  resetSlot(index) {
    const s = this.state.slots[index]
    s.host = ''
    s.modeId = ''
    s.left = 0
    s.members.clear()
    this.startsAt[index] = 0
  }

  tick() {
    const now = Date.now()
    this.state.slots.forEach((s, index) => {
      if (!s.host || this.launching.has(index)) return
      this.updateLeft(index)
      if (now >= this.startsAt[index]) this.launch(index)
    })
  }

  /** Creates a private stage room for the party and hands each member a reserved seat. */
  async launch(index) {
    const s = this.state.slots[index]
    const members = [...s.members]
    const { modeId, difficulty } = s
    this.launching.add(index)
    try {
      // Who is in the team decides which save they continue (solo = a team of one).
      const team = teamKey(
        members.map((id) => identityOf(this.clients.getById(id)?.auth?.accountId, this.gids.get(id), id)),
      )
      const room = await matchMaker.createRoom('stage', { modeId, difficulty, size: members.length, team })
      for (const id of members) {
        const client = this.clients.getById(id)
        const p = this.state.players.get(id)
        if (!client || !p) continue
        // The verified identity travels with the seat as auth data (server to server).
        const reservation = await matchMaker.reserveSeatFor(
          room,
          { name: p.name, look: p.look, shirt: p.shirt, pants: p.pants, skin: p.skin, gid: this.gids.get(id) },
          client.auth || { accountId: null, username: null },
        )
        client.send('party:go', { reservation, modeId, difficulty })
      }
    } catch (err) {
      console.error('[lobby] could not start party', err)
      for (const id of members) this.clients.getById(id)?.send('party:error', { message: 'Could not start the stage. Try again.' })
    } finally {
      this.resetSlot(index)
      this.launching.delete(index)
    }
  }
}
