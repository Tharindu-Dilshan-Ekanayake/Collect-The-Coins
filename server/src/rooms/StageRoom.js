import { Room, matchMaker } from '@colyseus/core'

import {
  RUN_UPGRADES,
  TOOLS,
  bagCapacity,
  bankRate,
  grabInterval,
  grabSize,
  sanitizeProgress,
  upgradeCost,
} from '../../../shared/economy.js'
import { looksFor, sanitizeColor, sanitizeLook, sanitizeName } from '../../../shared/lobby.js'
import { mapById } from '../../../shared/maps.js'
import { GOBLIN_MAX, createGoblin, stepGoblin } from '../../../shared/goblins.js'
import { CHEST_REACH, GRAB_REACH, applyTake, generatePool } from '../../../shared/pool.js'
import { reportScore } from '../bloxity.js'
import { loadProgress, saveProgress } from '../progress.js'
import { GoblinState, StagePlayer, StageState } from './schema.js'

const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback)
/** Slack for latency and float error when checking grabs. */
const REACH_SLACK = 1.5
const RADIUS_SLACK = 0.05
const RATE_SLACK = 0.75
/** Full pool snapshot to everyone, correcting any drift from simultaneous grabs. */
const SNAPSHOT_MS = 10000
/** Signed-in players' progress is written this often while they play. */
const SAVE_MS = 10000
/** How long the results stay up before the team is sent back to the lobby together. */
const RESULT_HOLD_MS = 7000

/**
 * One party's run of a treasure map (1-4 players). The server owns the coin pool and
 * the economy: it checks every grab against the shared rules, banks coins for whoever
 * stands at the chest, runs everyone's goblins and ends the run when the pool is banked.
 */
export class StageRoom extends Room {
  maxClients = 4

  onCreate(options) {
    this.maxClients = Math.min(4, Math.max(1, Math.round(num(options?.size, 4))))
    this.setPrivate(true) // only reserved seats from the lobby get in
    this.map = mapById(options?.modeId)
    this.pool = generatePool(this.map)
    this.lastGrab = new Map()
    this.carry = new Map()
    /** Each player's goblins: sessionId -> [{ g (shared rules), st (synced state) }]. */
    this.goblins = new Map()
    /** Last progress written per account, so unchanged progress isn't rewritten. */
    this.saved = new Map()
    /** Guests who already restored their browser's save (once, before they play). */
    this.restored = new Set()

    const s = new StageState()
    s.modeId = this.map.id
    s.difficulty = options?.difficulty || 'easy'
    // TEST_STAGE_GOAL lets automated tests clear a map without banking every coin.
    s.goal = Number(process.env.TEST_STAGE_GOAL) || this.map.coins
    s.poolLeft = this.map.coins
    s.startedAt = Date.now()
    s.endsAt = 0
    this.setState(s)

    this.onMessage('move', (client, m) => {
      const p = this.state.players.get(client.sessionId)
      if (!p || !m) return
      const { hall } = this.map
      p.x = Math.min(hall.maxX, Math.max(hall.minX, num(m.x, p.x)))
      p.z = Math.min(hall.maxZ, Math.max(hall.minZ, num(m.z, p.z)))
      p.y = Math.min(5, Math.max(0, num(m.y, p.y)))
      p.ry = num(m.ry, p.ry)
      p.speed = Math.min(20, Math.max(0, num(m.speed, 0)))
    })
    this.onMessage('grab', (client, m) => this.grab(client, m || {}))
    // Sent once the client's handlers are ready; also answers any later resync request.
    this.onMessage('sync', (client) => client.send('pool', { stacks: this.pool.stacks }))
    this.onMessage('equip', (client, m) => {
      const p = this.state.players.get(client.sessionId)
      if (p && p.tools.includes(m?.id)) p.tool = m.id
    })
    this.onMessage('profile', (client, m) => {
      const p = this.state.players.get(client.sessionId)
      if (!p || !m) return
      if (typeof m.name === 'string') p.name = sanitizeName(m.name)
      if (m.look !== undefined) p.look = sanitizeLook(m.look)
    })
    this.onMessage('buyTool', (client, m) => this.buyTool(client.sessionId, m?.id))
    this.onMessage('buyUpgrade', (client, m) => this.buyUpgrade(client.sessionId, m?.id))

    this.setSimulationInterval((dt) => this.tick(dt / 1000), 100)
    this.clock.setInterval(() => this.broadcast('pool', { stacks: this.pool.stacks }), SNAPSHOT_MS)
    this.clock.setInterval(() => this.persistAll(), SAVE_MS)

    // Guests keep progress in their own browser and hand it back once after joining.
    // Signed-in players are loaded from the database in onJoin, which always wins.
    this.onMessage('restore', (client, m) => {
      const p = this.state.players.get(client.sessionId)
      if (!p || p.uid || this.restored.has(client.sessionId)) return
      this.restored.add(client.sessionId)
      if (p.bank > 0 || p.earned > 0 || p.tools.length > 1) return // already playing
      this.applyProgress(p, sanitizeProgress(m))
      this.syncGoblins(client.sessionId)
    })
  }

  snapshot(p) {
    return { bank: p.bank, tools: Array.from(p.tools), tool: p.tool, levels: this.levelsOf(p) }
  }

  applyProgress(p, saved) {
    if (!saved) return
    p.bank = saved.bank
    p.tools.clear()
    saved.tools.forEach((t) => p.tools.push(t))
    p.tool = saved.tool
    for (const [id, lv] of Object.entries(saved.levels)) p.levels.set(id, lv)
  }

  /** Matches a player's goblins to their "Hire a Goblin" level (adds or removes). */
  syncGoblins(id) {
    const p = this.state.players.get(id)
    const list = this.goblins.get(id) || []
    const want = p ? Math.min(GOBLIN_MAX, p.levels.get('sprites') || 0) : 0
    while (list.length < want) {
      const g = createGoblin(this.map.chest)
      const st = new GoblinState()
      st.owner = id
      this.copyGoblin(g, st)
      this.state.goblins.push(st)
      list.push({ g, st })
    }
    while (list.length > want) {
      const { st } = list.pop()
      const at = this.state.goblins.indexOf(st)
      if (at >= 0) this.state.goblins.splice(at, 1)
    }
    if (list.length) this.goblins.set(id, list)
    else this.goblins.delete(id)
  }

  copyGoblin(g, st) {
    st.x = g.x
    st.z = g.z
    st.ry = g.ry
    st.phase = g.phase
    st.carry = g.carry
  }

  /** Writes every signed-in player's progress whose numbers changed. */
  persistAll() {
    if (this.state.finished) return
    this.state.players.forEach((p) => this.persist(p))
  }

  persist(p) {
    if (!p.uid) return
    const data = this.snapshot(p)
    const json = JSON.stringify(data)
    if (this.saved.get(p.uid) === json) return
    this.saved.set(p.uid, json)
    saveProgress(p.uid, this.map.id, data)
  }

  /** Seats are reserved by the lobby, which passes the identity it verified as auth data. */
  async onJoin(client, options, auth) {
    const p = new StagePlayer()
    p.name = sanitizeName(options?.name)
    p.uid = auth?.accountId || ''
    p.look = sanitizeLook(options?.look)
    const looks = looksFor(p.name)
    p.shirt = sanitizeColor(options?.shirt, looks.shirt)
    p.pants = sanitizeColor(options?.pants, looks.pants)
    p.skin = sanitizeColor(options?.skin, looks.skin)
    p.x = this.map.spawn[0]
    p.z = this.map.spawn[2] + (this.state.players.size - 1.5) * 1.2
    for (const u of RUN_UPGRADES) p.levels.set(u.id, 0)
    // Signed in: pick up where they left off on this map.
    if (p.uid) {
      this.applyProgress(p, await loadProgress(p.uid, this.map.id))
      this.saved.set(p.uid, JSON.stringify(this.snapshot(p)))
    }
    this.state.players.set(client.sessionId, p)
    this.syncGoblins(client.sessionId)
  }

  onLeave(client) {
    // Leaving early keeps the coins banked so far (the client adds them to its wallet).
    const p = this.state.players.get(client.sessionId)
    if (p && !this.state.finished) {
      // Whatever is still in the bag goes into the bank, so nothing is lost by leaving.
      if (p.bag > 0) {
        p.bank += p.bag
        p.earned += p.bag
        this.state.cleared += p.bag
        p.bag = 0
      }
      if (p.earned > 0) reportScore('coins', p.uid, p.earned)
      this.persist(p)
    }
    this.state.players.delete(client.sessionId)
    this.syncGoblins(client.sessionId) // their goblins go home with them
    this.restored.delete(client.sessionId)
    this.lastGrab.delete(client.sessionId)
    this.carry.delete(client.sessionId)
  }

  levelsOf(p) {
    const levels = {}
    p.levels.forEach((v, k) => {
      levels[k] = v
    })
    return levels
  }

  grab(client, m) {
    const id = client.sessionId
    const p = this.state.players.get(id)
    const cells = Array.isArray(m.cells) ? m.cells.slice(0, 256) : []
    const counts = Array.isArray(m.counts) ? m.counts.slice(0, 256) : []
    const seq = Number.isInteger(m.seq) ? m.seq : 0
    const reject = () => {
      if (p && seq > p.ack) p.ack = seq
      client.send('rejected', { seq, cells, counts })
    }
    if (!p || this.state.finished || cells.length !== counts.length || !cells.length) return reject()

    const tool = TOOLS.find((t) => t.id === p.tool) || TOOLS[0]
    const levels = this.levelsOf(p)
    const now = Date.now()
    if (now - (this.lastGrab.get(id) || 0) < grabInterval(tool, levels) * RATE_SLACK) return reject()
    const x = num(m.x, NaN)
    const z = num(m.z, NaN)
    if (!Number.isFinite(x) || !Number.isFinite(z)) return reject()
    const reach = tool.passive ? REACH_SLACK : GRAB_REACH + REACH_SLACK
    if (Math.hypot(x - p.x, z - p.z) > reach) return reject()

    let budget = Math.min(bagCapacity(levels.pockets || 0) - p.bag, grabSize(tool, levels))
    const r2 = (tool.radius + RADIUS_SLACK) ** 2
    const okCells = []
    const okCounts = []
    const badCells = []
    const badCounts = []
    for (let k = 0; k < cells.length; k += 1) {
      const i = cells[k]
      const want = Math.round(num(counts[k], 0))
      let give = 0
      if (Number.isInteger(i) && i >= 0 && i < this.pool.count && want > 0 && budget > 0) {
        const dx = this.pool.x[i] - x
        const dz = this.pool.z[i] - z
        if (dx * dx + dz * dz <= r2) give = Math.min(want, this.pool.stacks[i], budget)
      }
      if (give > 0) {
        okCells.push(i)
        okCounts.push(give)
        budget -= give
      }
      if (want - give > 0) {
        badCells.push(i)
        badCounts.push(want - give)
      }
    }
    const taken = applyTake(this.pool, okCells, okCounts)
    if (seq > p.ack) p.ack = seq
    if (taken) {
      p.bag += taken
      this.state.poolLeft -= taken
      this.lastGrab.set(id, now)
      this.broadcast('taken', { by: id, seq, cells: okCells, counts: okCounts })
    }
    if (badCells.length) client.send('rejected', { seq, cells: badCells, counts: badCounts })
  }

  buyTool(id, toolId) {
    const p = this.state.players.get(id)
    const tool = TOOLS.find((t) => t.id === toolId)
    if (!p || !tool || p.tools.includes(toolId) || p.bank < tool.price) return
    p.bank -= tool.price
    p.tools.push(toolId)
    p.tool = toolId
  }

  buyUpgrade(id, upgradeId) {
    const p = this.state.players.get(id)
    const upgrade = RUN_UPGRADES.find((u) => u.id === upgradeId)
    if (!p || !upgrade) return
    const level = p.levels.get(upgradeId) || 0
    if (level >= upgrade.max) return
    if (upgrade.requires && !p.levels.get(upgrade.requires)) return
    const cost = upgradeCost(upgrade, level)
    if (p.bank < cost) return
    p.bank -= cost
    p.levels.set(upgradeId, level + 1)
    if (upgradeId === 'sprites') this.syncGoblins(id)
  }

  tick(dt) {
    const s = this.state
    if (s.finished) return
    s.players.forEach((p, id) => {
      const carry = this.carry.get(id) || { bank: 0 }
      this.carry.set(id, carry)

      // Banking: whoever stands at the chest empties their bag into their bank.
      const { chest } = this.map
      const atChest = Math.hypot(p.x - chest.x, p.z - chest.z) < CHEST_REACH
      p.banking = atChest
      if (atChest && p.bag > 0) {
        carry.bank += bankRate(p.levels.get('deposit') || 0) * dt
        const amount = Math.min(p.bag, Math.floor(carry.bank))
        carry.bank -= amount
        p.bag -= amount
        p.bank += amount
        s.cleared += amount
        p.earned += amount
      } else {
        carry.bank = 0
      }

    })

    // Goblins: walk, scoop (coins leave the pool for everyone), carry, bank for their owner.
    this.goblins.forEach((list, id) => {
      const p = s.players.get(id)
      if (!p) return
      const ctx = {
        pool: this.pool,
        chest: this.map.chest,
        level: p.levels.get('spriteSpeed') || 0,
        take: (cells, counts) => {
          const n = applyTake(this.pool, cells, counts)
          if (n) {
            s.poolLeft -= n
            this.broadcast('taken', { by: 'goblin', cells, counts })
          }
          return n
        },
        bank: (n) => {
          p.bank += n
          p.earned += n
          s.cleared += n
        },
      }
      for (const { g, st } of list) {
        stepGoblin(g, dt, ctx)
        this.copyGoblin(g, st)
      }
    })

    if (s.cleared >= s.goal) this.finish()
  }

  /** The pool is banked: everyone keeps the coins they banked, and the map is cleared. */
  finish() {
    const s = this.state
    s.finished = true
    const ms = Date.now() - s.startedAt
    // Leaderboards, from state the server owns. Guests (no account id) are skipped.
    s.players.forEach((p) => {
      if (p.earned > 0) reportScore('coins', p.uid, p.earned)
      reportScore('runs', p.uid, 1)
      reportScore(`clear_${s.modeId}`, p.uid, ms)
      // The map is cleared: next time they start it fresh.
      if (p.uid) saveProgress(p.uid, this.map.id, null)
    })
    for (const client of this.clients) {
      client.send('result', {
        mapId: s.modeId,
        cleared: s.cleared,
        goal: s.goal,
        seconds: Math.round(ms / 1000),
        coins: this.state.players.get(client.sessionId)?.earned || 0,
        won: true,
      })
    }
    this.lock()
    this.clock.setTimeout(() => this.sendToLobby(), RESULT_HOLD_MS)
  }

  /** The whole team goes back to ONE lobby together, so they arrive side by side. */
  async sendToLobby() {
    const clients = [...this.clients]
    if (!clients.length) return
    try {
      const open = (await matchMaker.query({ name: 'lobby', private: false, locked: false }))
        .filter((r) => r.clients + clients.length <= r.maxClients)
        .sort((a, b) => b.clients - a.clients)
      const room = open[0] || (await matchMaker.createRoom('lobby', {}))
      for (const client of clients) {
        const p = this.state.players.get(client.sessionId)
        const reservation = await matchMaker.reserveSeatFor(
          room,
          { name: p?.name, look: p?.look, shirt: p?.shirt, pants: p?.pants, skin: p?.skin },
          { accountId: p?.uid || null, username: null },
        )
        client.send('lobby:go', { reservation })
      }
    } catch (err) {
      console.error('[stage] could not send the team to the lobby', err)
    }
  }
}
