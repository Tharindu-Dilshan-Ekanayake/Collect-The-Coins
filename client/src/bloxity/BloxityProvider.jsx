import { useCallback, useEffect, useMemo, useRef } from 'react'

import { BOARDS } from '@shared/leaderboards.js'

import { registerDebug } from '../game/lib/debug'
import { BloxityContext } from './BloxityContext'
import { startEmotes } from './emotes'
import { getAuthToken } from './platform'
import { getSDK, safeCall, toUnsubscribe, waitForSDK } from './sdk'
import { DEFAULT_PROPORTIONS, useBloxityStore } from './store'

/**
 * `Legion.SDK.init()` must happen exactly once per page, but React 19 StrictMode
 * mounts effects twice in dev. A module-level latch (rather than a ref) is what
 * actually survives that double mount.
 */
let initPromise = null

/** Slots the SDK's equipped payload carries beyond the skin. */
const PART_ID_KEYS = [
  'hatId',
  'backId',
  'headId',
  'armLId',
  'armRId',
  'legLId',
  'legRId',
  'torsoId',
]

/**
 * True for the blanked-out `{ skinId: '-1' }` payload the SDK emits while it resets
 * state during a login/logout, as opposed to a genuinely bare avatar.
 */
function isResetSentinel(equipped) {
  if (!equipped) return false
  if (String(equipped.skinId) !== '-1') return false
  return PART_ID_KEYS.every((key) => equipped[key] === undefined)
}

/**
 * Endpoints are NOT passed to init(): the platform tells the SDK which environment it
 * is in (window.BLOXITY_ENV on pages Boxity serves, the portal handshake when
 * embedded, the dev-server injection locally; see vite.config.js and environment.js).
 * One build runs unchanged on prod, stage and local.
 */
/**
 * Shared by every mount and never aborted: React StrictMode mounts effects twice in
 * dev, and aborting the first mount's wait used to reject this promise for both, so
 * the guest identity (name, picture) never reached the game.
 */
function initOnce(gameSlug) {
  if (!initPromise) {
    initPromise = waitForSDK().then((sdk) => {
      sdk.init({ gameSlug })
      // Declare the leaderboards once, right after init (this is what shows Boxity's
      // trophy button). The server submits every score.
      safeCall(sdk.leaderboard?.define?.bind(sdk.leaderboard), BOARDS)
      // Boot-time feature registration (Boxity shows the emote button only for games
      // that registered), before any assets load.
      startEmotes(sdk)
      return sdk
    })
    // A failed init shouldn't poison every later attempt (e.g. HMR reload).
    initPromise.catch(() => {
      initPromise = null
    })
  }
  return initPromise
}

/**
 * Owns the whole Bloxity session lifecycle: waits for the SDK script, initialises it
 * once, and subscribes to the auth/avatar change streams. Those subscriptions are the
 * single source of truth — nothing here polls `getUser()`.
 *
 * @param {{ gameSlug?: string, children: React.ReactNode }} props
 */
/**
 * Only if Boxity gives no guest identity (SDK blocked or slow): a random name kept in
 * this browser, so a guest is never just "Guest".
 */
const GUEST_ADJ = ['Swift', 'Lucky', 'Brave', 'Sunny', 'Misty', 'Jolly', 'Bold', 'Clever']
const GUEST_NOUN = ['Otter', 'Fox', 'Panda', 'Owl', 'Hawk', 'Wolf', 'Tiger', 'Yeti']
function makeLocalGuest() {
  let name = ''
  try {
    name = localStorage.getItem('ctc.guestName') || ''
  } catch {
    // ignore
  }
  if (!name) {
    const pick = (list) => list[Math.floor(Math.random() * list.length)]
    name = `${pick(GUEST_ADJ)}${pick(GUEST_NOUN)}${10 + Math.floor(Math.random() * 90)}`
    try {
      localStorage.setItem('ctc.guestName', name)
    } catch {
      // ignore
    }
  }
  return { displayName: name, username: name }
}
const localGuest = makeLocalGuest()

export function BloxityProvider({ gameSlug, children }) {
  // The game's Boxity id. VITE_GAME_SLUG or the `gameSlug` prop override it.
  const slug = gameSlug || import.meta.env.VITE_GAME_SLUG || 'collect-the-coins'

  const status = useBloxityStore((s) => s.status)
  const error = useBloxityStore((s) => s.error)
  const user = useBloxityStore((s) => s.user)
  const guest = useBloxityStore((s) => s.guest)
  const equipped = useBloxityStore((s) => s.equipped)
  const proportions = useBloxityStore((s) => s.proportions)

  const sdkRef = useRef(null)

  useEffect(() => {
    const store = useBloxityStore.getState()
    registerDebug('bloxity', useBloxityStore) // ?debug / dev builds only
    const unsubscribers = []
    let cancelled = false

    store.setStatus('loading')

    initOnce(slug)
      .then((sdk) => {
        if (cancelled) return
        sdkRef.current = sdk

        const readEquipped = () =>
          safeCall(sdk.avatar.getEquipped?.bind(sdk.avatar)) || null

        // Auth. Fires immediately with the current user (or null), then on every
        // login/logout.
        unsubscribers.push(
          toUnsubscribe(
            sdk.auth.onUserChanged((nextUser) => {
              useBloxityStore.getState().setUser(nextUser || null)
              // The guest identity is what the HUD falls back to when signed out.
              useBloxityStore
                .getState()
                .setGuest(safeCall(sdk.auth.getGuest?.bind(sdk.auth)) || null)

              // Re-read the equipped set on every login/logout. `getEquipped()`
              // derives from the user object, so this is the authoritative value
              // for whoever just signed in — see the note on the reset sentinel
              // below for why we cannot wait for onAvatarChanged here.
              useBloxityStore.getState().setEquipped(readEquipped())
              useBloxityStore
                .getState()
                .setProportions(safeCall(sdk.avatar.getProportions?.bind(sdk.avatar)))
            }),
          ),
        )

        // Avatar cosmetics + body proportions. These drive a live rebuild of the
        // player model, so a change made in the Bloxity portal shows up without a
        // page reload.
        unsubscribers.push(
          toUnsubscribe(
            sdk.avatar.onAvatarChanged((nextEquipped) => {
              // The SDK notifies this callback with its *customizer* state, and its
              // own internal onUserChanged handler blanks that to {skinId:'-1'} on
              // every login/logout before re-fetching the real data (which it then
              // does NOT re-notify). Taking that sentinel at face value would reset
              // the character to the default body the instant you sign in, so fall
              // back to the user-derived getEquipped() when we see it.
              const store = useBloxityStore.getState()
              const next =
                isResetSentinel(nextEquipped) && store.user
                  ? readEquipped()
                  : nextEquipped || null
              store.setEquipped(next)
            }),
          ),
        )
        unsubscribers.push(
          toUnsubscribe(
            sdk.avatar.onProportionsChanged((nextProportions) => {
              useBloxityStore.getState().setProportions(nextProportions)
            }),
          ),
        )

        // Seed anything the subscriptions didn't fire synchronously.
        const s = useBloxityStore.getState()
        if (!s.guest) s.setGuest(safeCall(sdk.auth.getGuest?.bind(sdk.auth)) || null)
        if (!s.equipped) {
          s.setEquipped(safeCall(sdk.avatar.getEquipped?.bind(sdk.avatar)) || null)
        }

        useBloxityStore.getState().setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[bloxity] init failed:', err)
        useBloxityStore.getState().setStatus('error', err)
      })

    return () => {
      cancelled = true
      unsubscribers.forEach((fn) => safeCall(fn))
    }
  }, [slug])

  const login = useCallback(() => {
    const sdk = sdkRef.current || getSDK()
    if (!sdk) {
      console.warn('[bloxity] login() called before the SDK was ready')
      return
    }
    // Login state arrives via onUserChanged — deliberately nothing to await here.
    safeCall(sdk.auth.showAuthPopup?.bind(sdk.auth))
  }, [])

  // Inside Boxity the toolbar handles accounts: these exist only for a game page that
  // also runs outside Boxity, and are never called automatically.
  const logout = useCallback(() => {
    const sdk = sdkRef.current || getSDK()
    if (!sdk) return
    safeCall(sdk.auth.logout?.bind(sdk.auth))
  }, [])

  // Loading-screen + room helpers, exposed so gameplay code doesn't reach for
  // `window.Legion` directly.
  const game = useMemo(
    () => ({
      loadingStep: (label) =>
        safeCall((sdkRef.current || getSDK())?.game?.loadingStep, label),
      loadingEnd: () => safeCall((sdkRef.current || getSDK())?.game?.loadingEnd),
      updateRoom: (room) => safeCall((sdkRef.current || getSDK())?.game?.updateRoom, room),
      /** JWT for the game server, read live (never cached). */
      getToken: getAuthToken,
    }),
    [],
  )

  const value = useMemo(
    () => ({
      status,
      error,
      isReady: status === 'ready',
      user,
      guest,
      isLoggedIn: Boolean(user),
      /** Always something displayable, per the getUser() || getGuest() pattern. */
      identity: user || guest || localGuest,
      login,
      logout,
      /** JWT for the game server, read live from the SDK (never cached). */
      getToken: getAuthToken,
      avatar: equipped,
      proportions: proportions || DEFAULT_PROPORTIONS,
      game,
      gameSlug: slug,
    }),
    [status, error, user, guest, equipped, proportions, login, logout, game, slug],
  )

  return <BloxityContext.Provider value={value}>{children}</BloxityContext.Provider>
}

export default BloxityProvider
