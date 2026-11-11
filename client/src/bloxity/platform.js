import { getSDK, safeCall } from './sdk'

/**
 * Plain (non-React) access to the Boxity session for network and game code.
 * Values are read live from the SDK every call, never cached.
 */

/** JWT for the game server, or null for a guest / before the SDK loads. */
export function getAuthToken() {
  const auth = getSDK()?.auth
  return (auth?.getToken && safeCall(auth.getToken.bind(auth))) || null
}

/** The signed-in Boxity user, or null. */
export function getUser() {
  const auth = getSDK()?.auth
  return (auth?.getUser && safeCall(auth.getUser.bind(auth))) || null
}
