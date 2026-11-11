import { create } from 'zustand'

import { useBloxityStore } from '../bloxity/store'
import { sfx } from './audio'
import { useGame } from './game'
import {
  POOL_COINS,
  RUN_UPGRADES,
  TOOLS,
  bagCapacity,
  bankRate,
  mapById,
  sanitizeProgress,
  upgradeCost,
} from './stageContent'

/**
 * Progress per map, saved in this browser: what you own and have banked. Leave a map
 * and come back and it is all still there; clearing the map starts it fresh. Signed-in
 * players are also saved on the server, which wins when they rejoin.
 */
const PROGRESS_KEY = 'ctc.progress.v1'

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}
  } catch {
    return {}
  }
}

const loadSnapshot = (mapId) => sanitizeProgress(readProgress()[mapId])

function storeSnapshot(mapId, data) {
  try {
    const all = readProgress()
    if (data) all[mapId] = data
    else delete all[mapId]
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all))
  } catch {
    // Storage unavailable: progress lasts for this session only.
  }
}

const snapshotOf = (s, bank = s.bank) => ({ bank, tools: s.tools, tool: s.equipped, levels: s.levels })

/** A fresh start: nothing banked, only hands, no upgrades. Never overwrites a real save. */
const isEmptySnapshot = (d) => d.bank === 0 && d.tools.length <= 1 && Object.values(d.levels).every((v) => !v)

const FRESH = {
  /** Map being played. */
  modeId: null,
  difficulty: 'easy',
  /** Coins in this map's pool: bank them all to clear it. */
  goal: POOL_COINS,
  startedAt: 0,
  bag: 0,
  bank: 0,
  /** Coins banked this run by the whole party: the objective counter. */
  cleared: 0,
  /** Coins this player banked this run: what goes into the wallet. */
  earned: 0,
  /** Coins still lying in the pool. Never goes back up. */
  poolLeft: POOL_COINS,
  tools: ['hands'],
  equipped: 'hands',
  levels: { pockets: 0, deposit: 0, boots: 0, steady: 0, haul: 0, sprites: 0, spriteSpeed: 0 },
  /** Standing at a chest, and the coins moved there this visit. */
  banking: false,
  bankedThisVisit: 0,
  bagAtVisit: 0,
  nearRack: false,
  /** 'shop' | 'upgrades' | null */
  panel: null,
  /** Timestamp of the last "bag full" / "too far" hint, for the toast. */
  hint: null,
  /** Last grab { amount, at }, for the "+N" popup. */
  lastGrab: null,
  result: null,
  /** Colyseus stage room in multiplayer, null when playing offline. */
  net: null,
  /** Multiplayer: grabs shown before the server confirmed them, { seq, n }. */
  pending: [],
  seq: 0,
  /** Last values seen from the server, so local choices aren't overwritten by stale patches. */
  srvTool: null,
  srvTools: '',
  srvLevels: '',
}

/**
 * State of one stage run. Writers are pointer handlers and intervals in the stage,
 * never useFrame. Reset on every start so runs never leak into each other.
 */
export const useRun = create((set, get) => ({
  ...FRESH,

  start: (modeId, difficulty, net = null) => {
    const now = Date.now()
    set({
      ...FRESH,
      levels: { ...FRESH.levels },
      tools: [...FRESH.tools],
      net,
      modeId,
      difficulty,
      goal: mapById(modeId).coins,
      poolLeft: mapById(modeId).coins,
      startedAt: now,
    })
    const me = net?.state?.players?.get(net.sessionId)
    if (me) get().syncServer(me, net.state)

    const saved = loadSnapshot(modeId)
    if (!saved) return
    if (!net) {
      set({ bank: saved.bank, tools: saved.tools, equipped: saved.tool, levels: { ...FRESH.levels, ...saved.levels } })
    } else if (!useBloxityStore.getState().user) {
      // A guest hands the server their browser's save once; signed-in players are
      // loaded from the server's database instead.
      net.send('restore', saved)
    }
  },

  capacity: () => bagCapacity(get().levels.pockets),
  room: () => {
    const s = get()
    return Math.max(0, bagCapacity(s.levels.pockets) - s.bag)
  },

  /** Coins taken from the pool into the bag (the caller already checked room). */
  addToBag: (n) => {
    const s = get()
    if (s.result) return 0
    if (n <= 0) {
      set({ hint: { kind: 'full', at: Date.now() } })
      return 0
    }
    set({ bag: s.bag + n, poolLeft: Math.max(0, s.poolLeft - n), lastGrab: { amount: n, at: Date.now() } })
    return n
  },

  showHint: (kind) => set({ hint: { kind, at: Date.now() } }),

  /** Multiplayer: show a grab at once. Returns the seq the server will acknowledge. */
  predict: (n) => {
    const s = get()
    const seq = s.seq + 1
    set({
      seq,
      pending: [...s.pending, { seq, n }],
      bag: s.bag + n,
      poolLeft: Math.max(0, s.poolLeft - n),
      lastGrab: { amount: n, at: Date.now() },
    })
    return seq
  },

  /**
   * Multiplayer: merge this player's server state (a StagePlayer) and the room's.
   * Unconfirmed grabs stay added on top until the server's ack passes them, so the
   * bag never flickers. Called from the room's state callback, never from useFrame.
   */
  syncServer: (me, room) => {
    const s = get()
    const pending = s.pending.length && s.pending[0].seq <= me.ack ? s.pending.filter((p) => p.seq > me.ack) : s.pending
    let extra = 0
    for (const p of pending) extra += p.n
    const patch = {}
    const put = (k, v) => {
      if (s[k] !== v) patch[k] = v
    }
    if (pending !== s.pending) patch.pending = pending
    put('bag', me.bag + extra)
    put('bank', me.bank)
    put('cleared', room.cleared)
    put('earned', me.earned)
    put('poolLeft', Math.max(0, room.poolLeft - extra))
    const tools = Array.from(me.tools).join(',')
    if (tools !== s.srvTools) Object.assign(patch, { srvTools: tools, tools: tools.split(',') })
    let levelsKey = ''
    me.levels.forEach((v, k) => {
      levelsKey += `${k}:${v},`
    })
    if (levelsKey !== s.srvLevels) {
      const levels = { ...FRESH.levels }
      me.levels.forEach((v, k) => {
        levels[k] = v
      })
      Object.assign(patch, { srvLevels: levelsKey, levels })
    }
    if (me.tool !== s.srvTool) Object.assign(patch, { srvTool: me.tool, equipped: me.tool })
    if (me.banking !== s.banking) Object.assign(patch, { banking: me.banking, bagAtVisit: me.bag, bankedThisVisit: 0 })
    else if (me.banking) put('bankedThisVisit', Math.max(0, s.bagAtVisit - me.bag))
    if (Object.keys(patch).length) set(patch)
  },

  setBanking: (banking) => {
    const s = get()
    if (s.banking === banking) return
    set({ banking, bankedThisVisit: 0, bagAtVisit: s.bag })
  },

  /** Moves coins from bag to bank at the Fast Deposit rate. dt in seconds. */
  bankTick: (dt) => {
    const s = get()
    if (!s.banking || s.bag <= 0 || s.result) return
    const amount = Math.min(s.bag, Math.max(1, Math.round(bankRate(s.levels.deposit) * dt)))
    set({
      bag: s.bag - amount,
      bank: s.bank + amount,
      cleared: s.cleared + amount,
      earned: s.earned + amount,
      bankedThisVisit: s.bankedThisVisit + amount,
    })
    get().checkGoal()
  },

  /** Dust sprites take from the pool and bank directly. */
  addBanked: (amount) => {
    const s = get()
    if (amount <= 0 || s.result) return
    set({
      bank: s.bank + amount,
      cleared: s.cleared + amount,
      earned: s.earned + amount,
      poolLeft: Math.max(0, s.poolLeft - amount),
    })
    get().checkGoal()
  },

  checkGoal: () => {
    const s = get()
    if (!s.net && !s.result && s.cleared >= s.goal) get().finish()
  },

  /** Multiplayer: the server ended the run; `coins` is what this player banked. */
  netResult: (result) => {
    if (get().result) return
    const game = useGame.getState()
    game.addCoins(result.coins)
    if (result.won) {
      game.markCleared(result.mapId || get().modeId)
      storeSnapshot(result.mapId || get().modeId, null) // cleared: next time starts fresh
    }
    set({ result, panel: null, banking: false })
  },

  /** Leaving before the end: whatever is in the bag is banked, nothing is lost, and the map is saved. */
  leaveRun: () => {
    const s = get()
    if (s.startedAt && !s.result) {
      useGame.getState().addCoins(s.earned + s.bag)
      const data = snapshotOf(s, s.bank + s.bag)
      if (!isEmptySnapshot(data)) storeSnapshot(s.modeId, data)
    }
    set({ result: s.result || { left: true } })
  },

  /** Solo: the pool is banked. Every banked coin goes into the wallet. */
  finish: () => {
    const s = get()
    if (s.result) return
    const seconds = Math.round((Date.now() - s.startedAt) / 1000)
    const won = s.cleared >= s.goal
    const game = useGame.getState()
    game.addCoins(s.earned)
    if (won) {
      game.markCleared(s.modeId)
      storeSnapshot(s.modeId, null)
    }
    set({
      result: { mapId: s.modeId, cleared: s.cleared, goal: s.goal, seconds, coins: s.earned, won },
      panel: null,
      banking: false,
    })
  },

  setNearRack: (nearRack) => {
    const s = get()
    if (s.nearRack === nearRack) return
    set({ nearRack, panel: !nearRack && s.panel === 'shop' ? null : s.panel })
  },
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),

  buyTool: (id) => {
    const s = get()
    const tool = TOOLS.find((t) => t.id === id)
    if (!tool || s.tools.includes(id) || s.bank < tool.price) return false
    if (s.net) {
      s.net.send('buyTool', { id })
      return true
    }
    set({ bank: s.bank - tool.price, tools: [...s.tools, id], equipped: id })
    return true
  },
  equip: (id) => {
    const s = get()
    if (!s.tools.includes(id) || s.equipped === id) return
    sfx('equip')
    set({ equipped: id })
    s.net?.send('equip', { id })
  },

  buyUpgrade: (id) => {
    const s = get()
    const upgrade = RUN_UPGRADES.find((u) => u.id === id)
    if (!upgrade) return false
    const level = s.levels[id] || 0
    if (level >= upgrade.max) return false
    if (upgrade.requires && !s.levels[upgrade.requires]) return false
    const cost = upgradeCost(upgrade, level)
    if (s.bank < cost) return false
    if (s.net) {
      s.net.send('buyUpgrade', { id })
      return true
    }
    set({ bank: s.bank - cost, levels: { ...s.levels, [id]: level + 1 } })
    return true
  },

  reset: () => set({ ...FRESH }),
}))

// Save progress shortly after it changes (never from useFrame, and never an empty start
// over a real save).
let saveTimer = 0
useRun.subscribe((s, prev) => {
  if (!s.startedAt || s.result) return
  if (s.bank === prev.bank && s.tools === prev.tools && s.levels === prev.levels && s.equipped === prev.equipped) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const r = useRun.getState()
    if (!r.startedAt || r.result || !r.modeId) return
    const data = snapshotOf(r)
    if (!isEmptySnapshot(data)) storeSnapshot(r.modeId, data)
  }, 1500)
})
