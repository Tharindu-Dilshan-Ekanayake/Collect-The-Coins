import { safeCall, toUnsubscribe, waitForSDK } from '../bloxity/sdk'
import { setAdBreak, setMusicVolume, setVolume } from '../state/audio'
import { useGame } from '../state/game'
import { input } from '../state/input'
import { useQuality } from '../state/quality'
import { useRun } from '../state/run'
import { installChat } from './chat'
import { getLobby, myPartySlot, useNet } from './net'

/**
 * Game-side Boxity hooks: ad breaks, screen ads, settings and room presence
 * (the leaderboards are declared in BloxityProvider). Every call goes through safeCall, so outside Boxity (or
 * if the SDK never loads) the game simply runs without them.
 *
 * Writers here are SDK callbacks and store subscriptions, never useFrame.
 */

/** Our own HUD (name tab, sound, settings) lives in the top-right corner. */
const SCREEN_OPTIONS = { skip: ['top-right'] }
const QUALITY = { low: 'low', medium: 'medium', high: 'high', ultra: 'high' }

let installed = false

/** Which declared screen is showing, from the game state. */
function currentScreen() {
  const game = useGame.getState()
  if (game.scene === 'stage') {
    const run = useRun.getState()
    if (run.result && !run.result.left) return 'results'
    if (run.panel) return 'panel'
    return 'gameplay'
  }
  if (game.panel === 'party' || game.panel === 'settings') return 'panel'
  const net = useNet.getState()
  if (game.hosted || myPartySlot(net.slots, net.myId) !== null) return 'lobby'
  return 'menu'
}

export function installPlatform() {
  if (installed) return
  installed = true
  waitForSDK({ timeoutMs: 20000 })
    .then((sdk) => setup(sdk))
    .catch(() => {
      // No SDK (offline, blocked): the game runs without platform features.
    })
}

function setup(sdk) {
  const ads = sdk.ads
  const game = sdk.game

  installChat(sdk)

  // Ad breaks can start at any time: pause the render loop and silence audio.
  safeCall(ads?.onBreakStart?.bind(ads), () => {
    useGame.setState({ adBreak: true })
    setAdBreak(true)
  })
  safeCall(ads?.onBreakEnd?.bind(ads), () => {
    useGame.setState({ adBreak: false })
    setAdBreak(false)
  })

  // Every screen the game has. Gameplay banners stay off (Boxity's default).
  safeCall(ads?.declareScreens?.bind(ads), { menu: {}, lobby: {}, panel: {}, results: {}, gameplay: {} })
  let shown = null
  const report = () => {
    const type = currentScreen()
    if (type === shown) return
    shown = type
    safeCall(ads?.screen?.bind(ads), type, SCREEN_OPTIONS)
  }
  report()
  useGame.subscribe(report)
  useRun.subscribe(report)
  useNet.subscribe(report)

  // Settings this game supports (registering a key shows it in the Boxity menu).
  const settings = sdk.settings
  const listen = (key, cb) => toUnsubscribe(safeCall(settings?.listen?.bind(settings), key, cb))
  listen('master_volume', (v) => setVolume(v))
  listen('music_volume', (v) => setMusicVolume(v))
  listen('camera_sensitivity', (v) => {
    const n = Number(v)
    if (Number.isFinite(n)) input.lookScale = Math.min(5, Math.max(0.1, n))
  })
  // The stored default is "High": keep our auto-detected preset (LOW on phones) until
  // the player actually picks a quality in the Boxity menu. A ?q= pin always wins.
  let lastQuality = ''
  listen('graphics_quality', (v) => {
    const value = String(v || '')
    const previous = lastQuality
    lastQuality = value
    const mode = QUALITY[value.toLowerCase()]
    if (!mode || useQuality.getState().locked) return
    if (!previous && value === 'High') return
    if (previous === value) return
    useQuality.getState().setMode(mode)
  })
  safeCall(settings?.triggerAll?.bind(settings))

  // Gameplay lifecycle and joinable room.
  const presence = () => {
    const s = useGame.getState()
    const lobby = getLobby()
    if (s.scene === 'stage' && s.stageReady) {
      safeCall(game?.gameplayStart?.bind(game))
      safeCall(game?.updateRoom?.bind(game), '') // stage rooms are private
    } else if (s.scene === 'lobby') {
      safeCall(game?.gameplayEnd?.bind(game))
      safeCall(game?.updateRoom?.bind(game), lobby ? lobby.roomId : '')
    }
  }
  presence()
  useGame.subscribe((s, prev) => {
    if (s.scene !== prev.scene || s.stageReady !== prev.stageReady) presence()
  })
  useNet.subscribe((s, prev) => {
    if (s.roomVersion !== prev.roomVersion) presence()
  })
}

/** Shareable link into the current lobby (falls back to this page). */
export function inviteLink() {
  const sdk = window.Legion?.SDK
  const lobby = getLobby()
  const link = safeCall(sdk?.social?.getInviteFriendsLink?.bind(sdk.social), lobby ? { roomId: lobby.roomId } : undefined)
  return link || window.location.href
}
