import { create } from 'zustand'

import { isUnlocked } from '@shared/maps.js'

import {
  DEFAULT_MODE,
  MODES,
  PARTY_START_S,
} from './content'

/**
 * Lobby + meta-game state.
 *
 * Writers are UI events and the zone watcher (a 10 Hz interval), never `useFrame`.
 * Frame-loop code reads with `useGame.getState()`.
 */

const SAVE_KEY = 'ctc.save.v1'

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}
  } catch {
    return {}
  }
}

const save = loadSave()

export const useGame = create((set, get) => ({
  /** 'lobby' | 'stage' */
  scene: 'lobby',
  stageId: null,
  /** The lazily loaded stage chunk has mounted. */
  stageReady: false,

  /** First lobby frame rendered with the avatar in place. Hides the loader. */
  lobbyReady: false,
  /** Lobby shaders compiled; the canvas render loop waits for this on first load. */
  shadersReady: false,
  /** 0..100, drei useProgress mirrored for the loading screen. */
  loadProgress: 0,
  contextLost: false,
  /** After clearing a map the team dances in the lobby until this time (ms). */
  celebrateUntil: 0,
  /** What the celebration banner says: { unlocked: 'Next map name' | null }. */
  celebrate: null,
  /** A Boxity ad break is playing: the render loop pauses. */
  adBreak: false,

  /** Party slot (0..PARTY_SLOTS-1) the player is standing on, or null. */
  activeSlot: null,
  /** Slot whose panel was closed by hand; it won't reopen until the player steps off. */
  dismissedSlot: null,
  /**
   * The party this player created: { slot, modeId, difficulty, size, startsAt } or
   * null. Stepping off its slot cancels it; when startsAt passes, the stage loads.
   */
  hosted: null,
  /** Mode being played on the stage. */
  modeId: null,

  /** 'party' | 'settings' | null */
  panel: null,

  /** The wallet: every coin banked in a run is kept. Coins are the only currency. */
  coins: Number.isFinite(save.coins) ? save.coins : 0,
  /** The first-run guide (grab coins, bank them, upgrade) has been finished or skipped. */
  tutorialDone: Boolean(save.tutorialDone),
  finishTutorial: () => set({ tutorialDone: true }),
  /** Maps cleared (every coin banked); each one unlocks the next. */
  clearedMaps: Array.isArray(save.clearedMaps) ? save.clearedMaps : [],

  /** Settings in the create-party panel. */
  party: { modeId: DEFAULT_MODE, difficulty: 'easy', size: 4, friendsOnly: false },

  isMapUnlocked: (id) => isUnlocked(id, get().clearedMaps),
  markCleared: (id) => {
    const s = get()
    if (id && !s.clearedMaps.includes(id)) set({ clearedMaps: [...s.clearedMaps, id] })
  },

  setLobbyReady: () => set({ lobbyReady: true }),
  setShadersReady: (shadersReady) => set({ shadersReady }),
  setContextLost: (contextLost) => set({ contextLost }),
  setStageReady: (stageReady) => set({ stageReady }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),

  setActiveSlot: (slot) => {
    const s = get()
    if (s.activeSlot === slot) return
    // Leaving the slot you host cancels the party.
    const hosted = s.hosted && s.hosted.slot === slot ? s.hosted : null
    if (slot !== null) {
      set({
        activeSlot: slot,
        hosted,
        panel: slot === s.dismissedSlot || hosted ? s.panel : 'party',
      })
    } else {
      set({
        activeSlot: null,
        dismissedSlot: null,
        hosted: null,
        panel: s.panel === 'party' ? null : s.panel,
      })
    }
  },

  /** CREATE in the party panel: host on the current slot, start after a countdown. */
  createParty: () => {
    const s = get()
    const mode = MODES.find((m) => m.id === s.party.modeId)
    if (s.activeSlot === null || !mode || !isUnlocked(mode.id, s.clearedMaps)) return false
    set({
      hosted: { ...s.party, slot: s.activeSlot, startsAt: Date.now() + PARTY_START_S * 1000 },
      panel: null,
    })
    return true
  },
  leaveParty: () => {
    const s = get()
    set({ hosted: null, dismissedSlot: s.activeSlot })
  },

  addCoins: (amount) => set({ coins: get().coins + Math.max(0, Math.round(amount)) }),

  openPanel: (panel) => set({ panel }),
  closePanel: () => {
    const s = get()
    set({ panel: null, dismissedSlot: s.panel === 'party' ? s.activeSlot : s.dismissedSlot })
  },

  setParty: (patch) => set({ party: { ...get().party, ...patch } }),

  /** Each map is its own stage. */
  enterStage: (modeId) =>
    set({
      scene: 'stage',
      stageId: modeId,
      modeId,
      stageReady: false,
      panel: null,
      hosted: null,
      activeSlot: null,
    }),
  /** Back to the lobby. Pass { unlocked } after a clear to arrive dancing. */
  returnToLobby: (celebrate = null) =>
    set({
      scene: 'lobby',
      stageId: null,
      modeId: null,
      dismissedSlot: null,
      celebrateUntil: celebrate ? Date.now() + 8000 : 0,
      celebrate: celebrate || null,
    }),
}))

// Persist the meta-game only when it actually changes.
useGame.subscribe((state, prev) => {
  if (
    state.coins === prev.coins &&
    state.clearedMaps === prev.clearedMaps &&
    state.tutorialDone === prev.tutorialDone
  ) {
    return
  }
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        coins: state.coins,
        clearedMaps: state.clearedMaps,
        tutorialDone: state.tutorialDone,
      }),
    )
  } catch {
    // Storage unavailable: progress lasts for this session only.
  }
})
