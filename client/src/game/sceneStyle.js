/**
 * The lobby's whole look in one place: a cozy village plaza at dusk. Cool violet sky,
 * warm lantern light, cream plaster houses, lavender-grey stone.
 *
 * Colours are sRGB hex, as you'd pick them in an image editor. Light intensities are
 * three.js physical units: a light of intensity PI (~3.14) lights a surface facing it
 * to its full colour. The scene renders without tone mapping (`flat` canvas).
 */

export const SKY = {
  top: '#121a44',
  mid: '#3b3a7c',
  horizon: '#e39a8c',
  /** Below the horizon. Matches the fog so distant ground melts away. */
  bottom: '#5a5488',
}

export const FOG_COLOR = '#5a5488'

export const LIGHTS = {
  hemiSky: '#b4bfff',
  hemiGround: '#6b5846',
  hemiIntensity: 1.55,

  /** Cool key light ("moonlight"), from behind the spawn camera so faces read. */
  keyColor: '#e6e8ff',
  keyIntensity: 1.65,
  keyDirection: [-0.45, 0.85, 0.5],

  /** Warm, low fill from the far side, as if from the lanterns and the castle. */
  fillColor: '#ffb070',
  fillIntensity: 0.6,
  fillDirection: [0.55, 0.35, -0.75],

  shadowIntensity: 0.65,
  shadowSoftness: 3,
}

export const PALETTE = {
  grass: '#5f9548',
  grassAlt: '#6ea653',
  stone: '#8b8798',
  stoneDark: '#6f6b80',
  stoneLight: '#a29eb0',
  stoneWarm: '#9c948e',
  plaster: '#f0e6d0',
  timber: '#5b3a29',
  wood: '#a8703f',
  woodLight: '#c68a52',
  woodDark: '#6e4426',
  iron: '#2e2b38',
  roofRed: '#c9473c',
  glow: '#ffcf73',
  flame: '#ff9a3c',
  gold: '#ffc83a',
  goldDark: '#c98a12',
  water: '#3f8fc0',
  skin: '#f0c39a',
  leaf: '#3d7a46',
  pine: '#2c5a3d',
  pineMid: '#35694a',
  pineTop: '#41795a',
  trunk: '#5a3b28',
  soil: '#4a3426',
}

/** Roof tints for the instanced houses. */
export const ROOF_COLORS = ['#c9473c', '#d9773a', '#b8503f', '#7c4a8c', '#3f7f8c', '#c45c3a']

/** Canopy tints for the round trees, greens with a few autumn ones for warmth. */
export const CANOPY_COLORS = ['#6fae5a', '#5d9a4f', '#7cb862', '#e39a3b', '#d9682e', '#e8c547']

export const FLOWER_COLORS = ['#ff8fb1', '#ffd34d', '#ffffff', '#b98cff', '#ff6b5b']
