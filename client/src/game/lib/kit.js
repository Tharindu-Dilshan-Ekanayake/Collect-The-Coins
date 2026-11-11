import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * A tiny modelling kit: add coloured primitives with transforms, then `build()` merges
 * them into ONE BufferGeometry with per-vertex colours. A whole house, castle or stall
 * becomes a single draw call (and repeated ones are instanced on top of that).
 *
 * Runs once at build time, never per frame, so allocating here is fine.
 */

export const D2R = Math.PI / 180

/** Seeded PRNG so the village layout is identical on every load. */
export function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** [x, z] on a circle. 0 deg = north (-Z), 90 deg = east (+X). */
export function polar(radius, deg) {
  return [radius * Math.sin(deg * D2R), -radius * Math.cos(deg * D2R)]
}

/** Y rotation that turns an object's local +Z towards the plaza centre. */
export const faceCenter = (deg) => -deg * D2R

const _color = new Color()
const _euler = new Euler()
const _quat = new Quaternion()
const _pos = new Vector3()
const _scale = new Vector3()

export function makeMatrix({ p = [0, 0, 0], r = [0, 0, 0], s = 1 } = {}) {
  _euler.set(r[0], r[1], r[2])
  _quat.setFromEuler(_euler)
  if (typeof s === 'number') _scale.set(s, s, s)
  else _scale.set(s[0], s[1], s[2])
  return new Matrix4().compose(_pos.set(p[0], p[1], p[2]), _quat, _scale)
}

/**
 * Writes a flat colour into a non-indexed geometry. `jitter` darkens each triangle by
 * a random 0..jitter, which gives low-poly faces a hand-painted variation.
 */
function paint(geometry, color, jitter, rand) {
  const count = geometry.attributes.position.count
  const colors = new Float32Array(count * 3)
  _color.set(color)
  for (let i = 0; i < count; i += 3) {
    const k = jitter ? 1 - rand() * jitter : 1
    for (let v = 0; v < 3 && i + v < count; v += 1) {
      colors[(i + v) * 3] = _color.r * k
      colors[(i + v) * 3 + 1] = _color.g * k
      colors[(i + v) * 3 + 2] = _color.b * k
    }
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}

export class Kit {
  constructor(seed = 1) {
    this.parts = []
    this.stack = [new Matrix4()]
    this.rand = mulberry32(seed)
  }

  /** Run `fn` with every part it adds transformed by `t` (nestable). */
  group(t, fn) {
    const parent = this.stack[this.stack.length - 1]
    this.stack.push(parent.clone().multiply(makeMatrix(t)))
    fn(this)
    this.stack.pop()
    return this
  }

  /**
   * Adds a geometry (consumed: do not reuse it). `color` may be a colour or a
   * function (triangleCentroid: Vector3) => colour for per-face colouring after the
   * transform, used by terrain.
   */
  add(geometry, color, t = {}, jitter = 0) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry
    if (g !== geometry) geometry.dispose()
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    }
    const matrix = this.stack[this.stack.length - 1].clone().multiply(makeMatrix(t))
    g.applyMatrix4(matrix)
    if (typeof color === 'function') this.paintByFace(g, color, jitter)
    else paint(g, color, jitter, this.rand)
    this.parts.push(g)
    return g
  }

  paintByFace(g, colorFn, jitter) {
    const pos = g.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const centroid = new Vector3()
    for (let i = 0; i < pos.count; i += 3) {
      centroid.set(
        (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3,
        (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3,
        (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3,
      )
      _color.set(colorFn(centroid, this.rand))
      const k = jitter ? 1 - this.rand() * jitter : 1
      for (let v = 0; v < 3; v += 1) {
        colors[(i + v) * 3] = _color.r * k
        colors[(i + v) * 3 + 1] = _color.g * k
        colors[(i + v) * 3 + 2] = _color.b * k
      }
    }
    g.setAttribute('color', new BufferAttribute(colors, 3))
  }

  box(w, h, d, color, t, jitter) {
    return this.add(new BoxGeometry(w, h, d), color, t, jitter)
  }

  cyl(radiusTop, radiusBottom, h, segments, color, t, jitter) {
    return this.add(new CylinderGeometry(radiusTop, radiusBottom, h, segments), color, t, jitter)
  }

  cone(radius, h, segments, color, t, jitter) {
    return this.add(new ConeGeometry(radius, h, segments), color, t, jitter)
  }

  ico(radius, color, t, jitter, detail = 0) {
    return this.add(new IcosahedronGeometry(radius, detail), color, t, jitter)
  }

  /** Merge everything added so far into one geometry and reset the kit. */
  build() {
    if (this.parts.length === 0) {
      // Still mergeable with other kits: same attributes, zero vertices.
      const empty = new BufferGeometry()
      for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3]]) {
        empty.setAttribute(name, new BufferAttribute(new Float32Array(0), size))
      }
      return empty
    }
    const merged = mergeGeometries(this.parts, false)
    for (const g of this.parts) g.dispose()
    this.parts = []
    merged.computeBoundingBox()
    merged.computeBoundingSphere()
    return merged
  }
}
