import { useGame } from './game'

/**
 * All game audio, synthesized with WebAudio: no audio files to download, so it costs
 * nothing at load. Two buses feed one master: sound effects, and per-place music and
 * ambience (a slow generative pad, bells, wind / water / fire / birds).
 *
 * Browsers block audio until a user gesture, so the AudioContext is created on the
 * first tap / click / key press and never before.
 */

let ctx = null
let master = null
let sfxBus = null
let musicBus = null
let noiseBuf = null
let muted = false
/** Boxity master_volume and music_volume, 0..1. */
let volume = 0.8
let musicVolume = 0.7
/** True while a Boxity ad break plays: everything is silent. */
let adBreak = false

try {
  muted = localStorage.getItem('ctc.muted') === '1'
} catch {
  // ignore
}

function applyLevels() {
  if (!ctx) return
  const t = ctx.currentTime
  master.gain.setTargetAtTime(muted || adBreak ? 0 : volume, t, 0.04)
  musicBus.gain.setTargetAtTime(musicVolume, t, 0.1)
}

function buildGraph() {
  ctx = new (window.AudioContext || window.webkitAudioContext)()
  const limiter = ctx.createDynamicsCompressor()
  master = ctx.createGain()
  sfxBus = ctx.createGain()
  musicBus = ctx.createGain()
  sfxBus.connect(limiter)
  musicBus.connect(limiter)
  limiter.connect(master)
  master.connect(ctx.destination)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  applyLevels()
}

export function installAudioUnlock() {
  const unlock = () => {
    try {
      if (!ctx) {
        if (!(window.AudioContext || window.webkitAudioContext)) return
        buildGraph()
        startAmbience(wanted)
      }
      if (ctx.state === 'suspended' && !adBreak) ctx.resume()
    } catch {
      return
    }
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  return () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
}

export const isMuted = () => muted

export function setMuted(value) {
  muted = value
  applyLevels()
  try {
    localStorage.setItem('ctc.muted', value ? '1' : '0')
  } catch {
    // ignore
  }
}

/** Boxity's master volume setting, 0..100. */
export function setVolume(percent) {
  const v = Number(percent)
  if (Number.isFinite(v)) volume = Math.min(1, Math.max(0, v / 100))
  applyLevels()
}

/** Boxity's music volume setting, 0..100 (music and ambience only). */
export function setMusicVolume(percent) {
  const v = Number(percent)
  if (Number.isFinite(v)) musicVolume = Math.min(1, Math.max(0, v / 100))
  applyLevels()
}

/** Silences all audio during an ad break and restores it after. */
export function setAdBreak(on) {
  adBreak = on
  applyLevels()
  try {
    if (ctx && on && ctx.state === 'running') ctx.suspend()
    else if (ctx && !on && ctx.state === 'suspended') ctx.resume()
  } catch {
    // ignore
  }
}

// --- building blocks -----------------------------------------------------------------

function tone(freq, start, duration, { type = 'sine', gain = 0.12, slideTo, attack = 0.012, bus = sfxBus } = {}) {
  const t0 = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration)
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(gain, t0 + attack)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(amp).connect(bus)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

/** A burst of filtered noise: footsteps, swishes, thumps. */
function noise(start, duration, { type = 'bandpass', freq = 1000, q = 1, gain = 0.1, slideTo, bus = sfxBus } = {}) {
  const t0 = ctx.currentTime + start
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(freq, t0)
  if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration)
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.006)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  src.connect(filter).connect(amp).connect(bus)
  src.start(t0, Math.random() * 1.5)
  src.stop(t0 + duration + 0.05)
}

const rand = (a, b) => a + Math.random() * (b - a)

// --- sound effects -------------------------------------------------------------------

const SOUNDS = {
  click: () => tone(660, 0, 0.08, { type: 'triangle', gain: 0.08 }),
  pad: () => {
    tone(523, 0, 0.25, { gain: 0.1 })
    tone(784, 0.08, 0.35, { gain: 0.08 })
    tone(1047, 0.16, 0.4, { gain: 0.05 })
  },
  // Cha-ching: a bright rising pair, a shimmer and a coin tick.
  buy: () => {
    tone(988, 0, 0.14, { type: 'triangle', gain: 0.08 })
    tone(1319, 0.07, 0.22, { type: 'triangle', gain: 0.08 })
    tone(1976, 0.14, 0.4, { gain: 0.05 })
    tone(2637, 0.14, 0.5, { gain: 0.025 })
    noise(0, 0.05, { type: 'highpass', freq: 5000, gain: 0.04 })
  },
  roll: () => {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.22, { type: 'triangle', gain: 0.07 }))
  },
  error: () => {
    tone(220, 0, 0.18, { type: 'sawtooth', gain: 0.05, slideTo: 150 })
    tone(165, 0.1, 0.2, { type: 'sawtooth', gain: 0.04, slideTo: 110 })
  },
  // Picking up coins: a clink that climbs with how many came in at once.
  coin: (n = 1) => {
    const f = rand(1500, 1750) + Math.min(n, 14) * 38
    tone(f, 0, 0.1, { type: 'triangle', gain: 0.055 })
    tone(f * 1.5, 0.025, 0.14, { gain: 0.028 })
    noise(0, 0.03, { type: 'highpass', freq: 6000, gain: 0.03 })
  },
  // A coin dropping into the chest.
  deposit: () => {
    const f = rand(1900, 2300)
    tone(f, 0, 0.08, { type: 'triangle', gain: 0.045 })
    tone(f * 1.34, 0.03, 0.1, { gain: 0.03 })
    tone(220, 0, 0.1, { gain: 0.05, slideTo: 150 })
  },
  equip: () => {
    noise(0, 0.12, { freq: 700, q: 1.2, gain: 0.07, slideTo: 2600 })
    tone(440, 0.05, 0.1, { type: 'triangle', gain: 0.05 })
  },
  jump: () => {
    tone(260, 0, 0.14, { type: 'triangle', gain: 0.05, slideTo: 520 })
    noise(0, 0.08, { freq: 1500, gain: 0.025 })
  },
  land: () => {
    tone(110, 0, 0.12, { gain: 0.09, slideTo: 60 })
    noise(0, 0.09, { type: 'lowpass', freq: 900, gain: 0.07 })
  },
  step_stone: () => {
    noise(0, 0.06, { freq: rand(800, 1200), q: 1.4, gain: 0.07 })
    tone(rand(110, 140), 0, 0.06, { gain: 0.04, slideTo: 70 })
  },
  step_coins: () => {
    for (let i = 0; i < 3; i += 1) tone(rand(2400, 4600), i * 0.018, 0.05, { type: 'triangle', gain: 0.022 })
    noise(0, 0.07, { freq: 1800, q: 0.8, gain: 0.045 })
  },
  step_snow: () => noise(0, 0.12, { type: 'lowpass', freq: rand(1100, 1700), q: 0.6, gain: 0.09 }),
  step_grass: () => noise(0, 0.09, { freq: rand(2200, 3000), q: 0.7, gain: 0.05 }),
  tick: () => tone(880, 0, 0.07, { type: 'triangle', gain: 0.07 }),
  join: () => {
    tone(587, 0, 0.12, { type: 'triangle', gain: 0.07 })
    tone(880, 0.09, 0.2, { type: 'triangle', gain: 0.07 })
  },
  // Map cleared: a rising fanfare over a warm chord.
  win: () => {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.5, { type: 'triangle', gain: 0.08 }))
    ;[262, 330, 392].forEach((f) => tone(f, 0.55, 1.6, { gain: 0.05, attack: 0.05 }))
    tone(2093, 0.6, 1.2, { gain: 0.03 })
    noise(0.55, 0.4, { type: 'highpass', freq: 6000, gain: 0.03 })
  },
}

/** Minimum gap between plays of one sound (ms), so a burst can't pile up nodes. */
const MIN_GAP = { coin: 45, deposit: 60, step_stone: 140, step_coins: 140, step_snow: 140, step_grass: 140, jump: 150, land: 150 }
const lastPlayed = new Map()

export function sfx(name, arg) {
  if (muted || adBreak || volume <= 0 || !ctx || ctx.state !== 'running') return
  const now = performance.now()
  const gap = MIN_GAP[name]
  if (gap && now - (lastPlayed.get(name) || 0) < gap) return
  lastPlayed.set(name, now)
  try {
    SOUNDS[name]?.(arg)
  } catch {
    // never let a sound break gameplay
  }
}

// --- music and ambience --------------------------------------------------------------

/**
 * One generative bed per place: a slow chord pad, now and then a bell, plus a looping
 * noise bed (water, fire, wind, leaves) and small extras (birds, torch crackle).
 * Semitone offsets are from `root` (Hz).
 */
const PLACES = {
  lobby: { root: 261.63, scale: [0, 2, 4, 7, 9], wave: 'triangle', chord: 3.8, bell: 0.7, bed: 'water' },
  keep: { root: 110, scale: [0, 3, 5, 7, 10], wave: 'sine', chord: 5, bell: 0.3, bed: 'fire', drone: 55 },
  frost: { root: 196, scale: [0, 2, 4, 6, 7, 9, 11], wave: 'sine', chord: 4.4, bell: 0.9, bed: 'wind' },
  grotto: { root: 196, scale: [0, 2, 4, 7, 9], wave: 'triangle', chord: 3.6, bell: 0.4, bed: 'leaves', birds: true },
}
const PROGRESSION = [0, 3, 4, 2, 0, 4, 3, 1]

const hz = (root, semis) => root * 2 ** (semis / 12)

function noiseBed(type, freq, q, gain, out) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = freq
  filter.Q.value = q
  const amp = ctx.createGain()
  amp.gain.value = gain
  src.connect(filter).connect(amp).connect(out)
  src.start()
  return { src, filter, amp }
}

let ambience = null
let wanted = 'lobby'

function startAmbience(kind) {
  if (!ctx) return
  if (ambience && ambience.kind === kind) return
  stopAmbience()
  const place = PLACES[kind] || PLACES.lobby
  const out = ctx.createGain()
  out.gain.setValueAtTime(0, ctx.currentTime)
  out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5)
  out.connect(musicBus)
  const nodes = []

  if (place.bed === 'water') nodes.push(noiseBed('lowpass', 1700, 0.5, 0.016, out))
  else if (place.bed === 'fire') nodes.push(noiseBed('lowpass', 420, 0.5, 0.01, out))
  else if (place.bed === 'leaves') nodes.push(noiseBed('bandpass', 3200, 0.5, 0.012, out))
  else if (place.bed === 'wind') {
    const wind = noiseBed('bandpass', 520, 0.8, 0.026, out)
    const lfo = ctx.createOscillator()
    const depth = ctx.createGain()
    lfo.frequency.value = 0.09
    depth.gain.value = 0.02
    lfo.connect(depth).connect(wind.amp.gain)
    lfo.start()
    nodes.push(wind, { src: lfo })
  }
  if (place.drone) {
    const osc = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const amp = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = place.drone
    filter.type = 'lowpass'
    filter.frequency.value = 180
    amp.gain.value = 0.03
    osc.connect(filter).connect(amp).connect(out)
    osc.start()
    nodes.push({ src: osc })
  }

  let step = 0
  let nextChord = ctx.currentTime + 0.3
  let nextBell = ctx.currentTime + 2
  let nextExtra = ctx.currentTime + 1.5

  const pad = (freq, t, len) => {
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator()
      const amp = ctx.createGain()
      osc.type = place.wave
      osc.frequency.value = freq
      osc.detune.value = detune
      amp.gain.setValueAtTime(0, t)
      amp.gain.linearRampToValueAtTime(0.026, t + len * 0.3)
      amp.gain.exponentialRampToValueAtTime(0.0001, t + len * 1.3)
      osc.connect(amp).connect(out)
      osc.start(t)
      osc.stop(t + len * 1.35)
    }
  }
  const bell = (freq, t) => {
    for (const [mult, g] of [[1, 0.03], [2.76, 0.012], [5.4, 0.005]]) {
      const osc = ctx.createOscillator()
      const amp = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq * mult
      amp.gain.setValueAtTime(0, t)
      amp.gain.linearRampToValueAtTime(g, t + 0.01)
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
      osc.connect(amp).connect(out)
      osc.start(t)
      osc.stop(t + 2.5)
    }
  }
  const chirp = (t) => {
    const base = rand(2400, 3800)
    const notes = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < notes; i += 1) {
      const osc = ctx.createOscillator()
      const amp = ctx.createGain()
      const s = t + i * 0.11
      osc.type = 'sine'
      osc.frequency.setValueAtTime(base * rand(0.9, 1.1), s)
      osc.frequency.exponentialRampToValueAtTime(base * rand(1.25, 1.5), s + 0.07)
      amp.gain.setValueAtTime(0, s)
      amp.gain.linearRampToValueAtTime(0.022, s + 0.01)
      amp.gain.exponentialRampToValueAtTime(0.0001, s + 0.09)
      osc.connect(amp).connect(out)
      osc.start(s)
      osc.stop(s + 0.12)
    }
  }
  const crackle = (t) =>
    noise(t - ctx.currentTime, rand(0.015, 0.04), { type: 'highpass', freq: rand(2500, 6000), gain: rand(0.02, 0.05), bus: out })

  const timer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    while (nextChord < now + 1) {
      const degree = PROGRESSION[step % PROGRESSION.length]
      const n = place.scale.length
      for (const offset of [0, 2, 4]) {
        const i = degree + offset
        const semis = place.scale[i % n] + 12 * Math.floor(i / n)
        pad(hz(place.root, semis), nextChord, place.chord)
      }
      step += 1
      nextChord += place.chord
    }
    if (nextBell < now + 1) {
      if (Math.random() < place.bell) {
        const i = Math.floor(Math.random() * place.scale.length)
        bell(hz(place.root * 2, place.scale[i] + 12 * (Math.random() < 0.4 ? 1 : 0)), nextBell)
      }
      nextBell += rand(1.1, 2.6)
    }
    if (nextExtra < now + 1) {
      if (place.birds) chirp(nextExtra)
      if (place.bed === 'fire') crackle(nextExtra)
      nextExtra += place.birds ? rand(1.8, 5) : rand(0.2, 1.1)
    }
  }, 400)

  ambience = {
    kind,
    stop() {
      clearInterval(timer)
      const t = ctx.currentTime
      out.gain.cancelScheduledValues(t)
      out.gain.setValueAtTime(out.gain.value, t)
      out.gain.linearRampToValueAtTime(0, t + 1.2)
      setTimeout(() => {
        for (const n of nodes) {
          try {
            n.src.stop()
          } catch {
            // already stopped
          }
        }
        out.disconnect()
      }, 1500)
    },
  }
}

function stopAmbience() {
  ambience?.stop()
  ambience = null
}

const placeOf = (s) => (s.scene === 'stage' ? (PLACES[s.modeId] ? s.modeId : 'keep') : 'lobby')

wanted = placeOf(useGame.getState())
// The place follows the scene: the lobby, or whichever map you are on.
useGame.subscribe((s, prev) => {
  if (s.scene === prev.scene && s.modeId === prev.modeId) return
  wanted = placeOf(s)
  startAmbience(wanted)
})
