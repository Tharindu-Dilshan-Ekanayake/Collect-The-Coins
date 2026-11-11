/**
 * Opt-in debug handles on `window.__ctc` (dev builds, or any build with `?debug` in the
 * URL). Used to read `gl.info` draw calls / triangles from automated perf checks.
 */
export const debugEnabled =
  import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug'))

export function registerDebug(key, value) {
  if (!debugEnabled) return
  window.__ctc = window.__ctc || {}
  window.__ctc[key] = value
}
