import { getEnvironment } from './environment'
import { getSDK, safeCall, toUnsubscribe } from './sdk'
import { useBloxityStore } from './store'

/**
 * Boxity emotes. Boxity draws the emote picker itself; the game only registers the
 * feature, listens for 'play_emote' and plays the clip on the local character.
 *
 * The catalogue ({apiUrl}/v1/avatar/emotes) is fetched once. Clips are converted to
 * flat radian keyframe arrays here so playback (in the frame loop) allocates nothing.
 * Unknown ids, bones or malformed clips are ignored silently; ownership is never
 * checked (Boxity only sends ids the player is entitled to).
 */

const D2R = Math.PI / 180

/** id -> prepared clip */
let catalog = new Map()
let catalogPromise = null

/** { len, loop, tracks: { bone, keys: [t, x, y, z, …] } } -> prepared, or null. */
function prepareClip(clip) {
  if (!clip || typeof clip !== 'object' || !clip.tracks) return null
  const len = Number(clip.len)
  if (!Number.isFinite(len) || len <= 0) return null
  const tracks = []
  for (const [bone, frames] of Object.entries(clip.tracks)) {
    if (!Array.isArray(frames) || frames.length === 0) continue
    const sorted = frames
      .filter((f) => Array.isArray(f) && f.length >= 4 && f.every((v) => Number.isFinite(Number(v))))
      .map((f) => [Number(f[0]), Number(f[1]), Number(f[2]), Number(f[3])])
      .sort((a, b) => a[0] - b[0])
    if (!sorted.length) continue
    const keys = new Float32Array(sorted.length * 4)
    sorted.forEach(([t, x, y, z], i) => keys.set([t, x * D2R, y * D2R, z * D2R], i * 4))
    tracks.push({ bone, keys })
  }
  return tracks.length ? { len, loop: Boolean(clip.loop), tracks } : null
}

/** Fetches the catalogue once; resolves to the id -> clip map (empty on failure). */
export function loadEmoteCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(`${getEnvironment().apiUrl}/v1/avatar/emotes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.emotes || data?.items || []
        const next = new Map()
        for (const emote of list) {
          const clip = prepareClip(emote?.clip)
          if (emote?.id && clip) next.set(String(emote.id), clip)
        }
        catalog = next
        return catalog
      })
      .catch(() => catalog)
  }
  return catalogPromise
}

/** Prepared clip for an emote id, or null (unknown, or catalogue not loaded yet). */
export const getEmoteClip = (id) => (id ? catalog.get(String(id)) || null : null)

/**
 * Registers the emote feature (so Boxity shows its emote button) and starts listening.
 * Call once on boot, right after init. Returns an unsubscribe function.
 */
export function startEmotes(sdk = getSDK()) {
  if (!sdk) return () => {}
  safeCall(sdk.game?.registerFeature?.bind(sdk.game), 'emotes')
  loadEmoteCatalog()
  if (!sdk.player?.onEvent) return () => {}
  return toUnsubscribe(
    safeCall(sdk.player.onEvent.bind(sdk.player), (event, data) => {
      if (event !== 'play_emote' || typeof data !== 'string' || !data) return
      // Played as soon as the catalogue has it; a not-yet-loaded clip starts on arrival.
      loadEmoteCatalog().then(() => {
        if (getEmoteClip(data)) useBloxityStore.getState().setEmote({ id: data, at: performance.now() })
      })
    }),
  )
}
