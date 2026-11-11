import { getSDK, safeCall, toUnsubscribe } from './sdk'

/**
 * The Boxity environment this page runs in: prod, stage or local. The PLATFORM tells
 * us (window.BLOXITY_ENV injected into pages it serves, or the portal handshake when
 * embedded); the game never works it out from its own hostname, the referrer or a
 * build flag. Every Boxity URL is built from these values.
 */

/** What the SDK itself returns when nothing was told. The only place these hosts appear. */
export const PROD_ENVIRONMENT = Object.freeze({
  env: 'prod',
  apiUrl: 'https://api.bloxity.io',
  playUrl: 'https://play.bloxity.io',
  portalUrl: 'https://bloxity.io',
  staticUrl: 'https://static.bloxity.io',
})

const PROD = PROD_ENVIRONMENT
const clean = (value) => (value ? { ...PROD, ...value } : null)

/**
 * The told environment. Before the SDK script has loaded it reads window.BLOXITY_ENV;
 * after, Legion.SDK.environment() (which also knows the handshake). Prod when nothing
 * was told.
 */
export function getEnvironment() {
  const sdk = getSDK()
  const told = sdk?.environment ? safeCall(sdk.environment.bind(sdk)) : null
  return clean(told) || clean(typeof window !== 'undefined' ? window.BLOXITY_ENV : null) || PROD
}

/** Fires if the portal handshake tells the environment after init. */
export function onEnvironmentChanged(cb) {
  const sdk = getSDK()
  if (!sdk?.onEnvironmentChanged) return () => {}
  return toUnsubscribe(safeCall(sdk.onEnvironmentChanged.bind(sdk), (env) => cb(clean(env) || PROD)))
}

/** Avatar CDN root for the told environment. */
export const avatarCdn = () => `${getEnvironment().staticUrl}/avatars`
