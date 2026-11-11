import { create } from 'zustand'

/**
 * Quality presets. Every visual feature reads `settings` and must degrade or switch
 * off on LOW. Priority order is performance > gameplay > visuals.
 *
 *  - dpr            canvas pixel ratio range
 *  - shadows        realtime shadow map (never on LOW)
 *  - particles      stars, fireflies, lantern halos, falling water
 *  - details        flowers, clouds and other small decoration
 *  - texSize        max edge of any generated canvas texture
 *  - viewDistance   camera far plane; fog closes in before it
 */
export const PRESETS = {
  low: {
    name: 'low',
    dpr: [1, 1],
    shadows: false,
    shadowMapSize: 0,
    particles: false,
    details: false,
    texSize: 512,
    viewDistance: 340,
    fogNear: 45,
    fogFar: 300,
  },
  medium: {
    name: 'medium',
    dpr: [1, 1.5],
    shadows: true,
    shadowMapSize: 1024,
    particles: true,
    details: true,
    texSize: 1024,
    viewDistance: 600,
    fogNear: 70,
    fogFar: 400,
  },
  high: {
    name: 'high',
    dpr: [1, 2],
    shadows: true,
    shadowMapSize: 2048,
    particles: true,
    details: true,
    texSize: 1024,
    viewDistance: 700,
    fogNear: 80,
    fogFar: 440,
  },
}

export const PRESET_ORDER = ['low', 'medium', 'high']

const STORAGE_KEY = 'ctc.quality'

function isMobile() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  // iPadOS reports itself as a Mac; touch points give it away.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || iPadOS
}

/** Mobile or <= 4 cores -> LOW. Otherwise MEDIUM up to 8 cores, HIGH above. */
export function detectPreset() {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
  if (isMobile() || cores <= 4) return 'low'
  if (cores <= 8) return 'medium'
  return 'high'
}

function readSaved() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeSaved(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Private mode / blocked storage: the choice just won't survive a reload.
  }
}

/** `?q=low|medium|high` pins a preset and disables auto-degrade (testing, screenshots). */
function readUrlPreset() {
  try {
    const q = new URLSearchParams(window.location.search).get('q')
    return PRESETS[q] ? q : null
  } catch {
    return null
  }
}

const urlPreset = readUrlPreset()
const savedMode = readSaved()
const initialMode = urlPreset || (PRESETS[savedMode] ? savedMode : 'auto')
const initialPreset = initialMode === 'auto' ? detectPreset() : initialMode

export const useQuality = create((set, get) => ({
  /** 'auto' or a pinned preset name chosen in settings. */
  mode: initialMode,
  /** The preset actually in use. Can sit below `mode` after an auto-degrade. */
  preset: initialPreset,
  settings: PRESETS[initialPreset],
  /** True when pinned via the URL: the performance monitor leaves it alone. */
  locked: Boolean(urlPreset),

  setMode: (mode) => {
    writeSaved(mode)
    const preset = mode === 'auto' ? detectPreset() : mode
    set({ mode, preset, settings: PRESETS[preset] })
  },

  /** One step down. Called (outside the frame loop) when FPS stays under 45. */
  degrade: () => {
    if (get().locked) return
    const index = PRESET_ORDER.indexOf(get().preset)
    if (index <= 0) return
    const preset = PRESET_ORDER[index - 1]
    set({ preset, settings: PRESETS[preset] })
  },
}))

/** Non-reactive read, safe anywhere (including useFrame). */
export const getQuality = () => useQuality.getState().settings
