import { ConeGeometry } from 'three'

import { PALETTE as P } from '../../sceneStyle'
import { Kit, mulberry32, polar } from '../../lib/kit'

/** Deterministic 0..1 hash of a position, so coincident vertices move together. */
function hash3(x, y, z, seed) {
  const n =
    Math.sin(Math.round(x * 100) * 12.9898 + Math.round(y * 100) * 78.233 + Math.round(z * 100) * 37.719 + seed) *
    43758.5453
  return n - Math.floor(n)
}

/**
 * Roughens a cone/cylinder in place: pushes vertices in and out radially and nudges
 * them vertically, except along the base ring. Shared seam vertices get the same
 * offset, so the surface stays closed.
 */
export function jitterGeometry(geometry, amount, seed) {
  const pos = geometry.attributes.position
  geometry.computeBoundingBox()
  const { min, max } = geometry.boundingBox
  const height = max.y - min.y
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const radial = 1 + (hash3(x, y, z, seed) - 0.5) * amount * 2
    const atBase = y - min.y < 1e-3
    const lift = atBase ? 0 : (hash3(z, x, y, seed + 1) - 0.5) * amount * height * 0.5
    pos.setXYZ(i, x * radial, y + lift, z * radial)
  }
  geometry.computeVertexNormals()
  return geometry
}

export function buildPine() {
  const k = new Kit(11)
  k.cyl(0.2, 0.3, 1.4, 6, P.trunk, { p: [0, 0.7, 0] })
  k.cone(1.9, 2.5, 7, P.pine, { p: [0, 2.3, 0] }, 0.14)
  k.cone(1.45, 2.2, 7, P.pineMid, { p: [0, 3.55, 0], r: [0, 0.45, 0] }, 0.14)
  k.cone(1.0, 1.9, 7, P.pineTop, { p: [0, 4.7, 0], r: [0, 0.9, 0] }, 0.14)
  return k.build()
}

/** Round tree in neutral colours; instanceColor gives each one its foliage colour. */
export function buildRoundTree() {
  const k = new Kit(12)
  const leaf = '#ecebe0'
  k.cyl(0.18, 0.3, 1.9, 6, '#7a5a45', { p: [0, 0.95, 0] })
  k.ico(1.55, leaf, { p: [0, 2.9, 0] }, 0.2)
  k.ico(1.1, leaf, { p: [0.85, 2.5, 0.35] }, 0.2)
  k.ico(1.0, leaf, { p: [-0.75, 2.6, -0.4] }, 0.2)
  k.ico(0.95, leaf, { p: [0.1, 3.85, 0.1] }, 0.2)
  return k.build()
}

export function buildBush() {
  const k = new Kit(13)
  const leaf = '#ecebe0'
  k.ico(0.85, leaf, { p: [0, 0.5, 0], s: [1.25, 0.8, 1] }, 0.22)
  k.ico(0.6, leaf, { p: [0.65, 0.38, 0.2] }, 0.22)
  k.ico(0.55, leaf, { p: [-0.6, 0.35, -0.15] }, 0.22)
  return k.build()
}

export function buildFlower() {
  const k = new Kit(14)
  k.box(0.04, 0.34, 0.04, '#6a9a50', { p: [0, 0.17, 0] })
  k.ico(0.11, '#ffffff', { p: [0, 0.38, 0], s: [1.2, 0.7, 1.2] })
  k.box(0.14, 0.03, 0.06, '#7fb85e', { p: [0.06, 0.14, 0], r: [0, 0, 0.5] })
  return k.build()
}

const MOUNTAIN = {
  forest: ['#2f5845', '#355f49', '#3b6a4c'],
  rock: ['#5f5b7d', '#6b6789', '#57536f'],
  snow: '#e2e4f4',
}

function peak(k, x, z, radius, height, snowLine, seed) {
  const g = jitterGeometry(new ConeGeometry(radius, height, 8, 4), 0.14, seed)
  k.add(
    g,
    (c, rand) => {
      const t = c.y / height
      if (t > snowLine) return MOUNTAIN.snow
      if (t > 0.38 + rand() * 0.12) return MOUNTAIN.rock[Math.floor(rand() * 3)]
      return MOUNTAIN.forest[Math.floor(rand() * 3)]
    },
    { p: [x, height / 2 - 1, z] },
    0.1,
  )
}

/** Two rings: tall far mountains and rolling near hills. One mesh. */
export function buildMountains() {
  const k = new Kit(15)
  const rand = mulberry32(99)

  for (let i = 0; i < 18; i += 1) {
    const deg = (i / 18) * 360 + rand() * 12
    const [x, z] = polar(225 + rand() * 50, deg)
    peak(k, x, z, 48 + rand() * 30, 70 + rand() * 75, 0.74 + rand() * 0.08, i)
  }

  for (let i = 0; i < 16; i += 1) {
    const deg = (i / 16) * 360 + rand() * 14
    const off = Math.abs(((deg + 540) % 360) - 180)
    if (off < 26) continue // keep the castle hill in the clear
    const [x, z] = polar(110 + rand() * 30, deg)
    peak(k, x, z, 30 + rand() * 18, 16 + rand() * 18, 2, 50 + i)
  }

  return k.build()
}
