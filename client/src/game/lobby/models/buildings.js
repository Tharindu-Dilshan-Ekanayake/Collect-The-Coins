import { CylinderGeometry, ExtrudeGeometry, Shape } from 'three'

import { PALETTE as P } from '../../sceneStyle'
import { D2R, Kit, polar } from '../../lib/kit'
import { jitterGeometry } from './nature'

// --- Half-timbered houses -------------------------------------------------------------

const HOUSE_VARIANTS = [
  { w: 6.2, d: 5.0, h: 3.8, floors: 2, rise: 2.6, shutter: '#3f7f6c' },
  { w: 4.6, d: 4.6, h: 5.1, floors: 3, rise: 3.1, shutter: '#4a6aa0' },
]

function gableGeometry(w, rise, depth) {
  const shape = new Shape()
  shape.moveTo(-w / 2, 0)
  shape.lineTo(w / 2, 0)
  shape.lineTo(0, rise)
  shape.closePath()
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  g.translate(0, 0, -depth / 2)
  return g
}

/** Window on a wall face. Origin on the wall plane, local +Z pointing out. */
function addWindow(body, glow, { x, y, z, ry, w = 0.78, h = 0.9, shutter }) {
  const t = { p: [x, y, z], r: [0, ry, 0] }
  body.group(t, (k) => {
    k.box(w + 0.2, h + 0.2, 0.06, P.timber, { p: [0, 0, 0.02] })
    k.box(0.07, h, 0.05, P.timber, { p: [0, 0, 0.1] })
    k.box(w, 0.07, 0.05, P.timber, { p: [0, 0, 0.1] })
    k.box(w + 0.34, 0.1, 0.2, P.woodDark, { p: [0, -h / 2 - 0.12, 0.08] })
    if (shutter) {
      k.box(0.3, h + 0.1, 0.05, shutter, { p: [-(w / 2 + 0.28), 0, 0.05] })
      k.box(0.3, h + 0.1, 0.05, shutter, { p: [w / 2 + 0.28, 0, 0.05] })
    }
  })
  glow.group(t, (k) => k.box(w, h, 0.04, P.glow, { p: [0, 0, 0.065] }))
}

/**
 * A two- or three-storey half-timbered house, front facing +Z, origin at ground
 * centre. Returns three geometries sharing one set of instance matrices:
 *   body  plaster, timber, stone (vertex colours)
 *   roof  shingle rows in white/grey, tinted per house with instanceColor
 *   glow  lit windows and the door lantern (unlit material)
 */
export function buildHouse(variant) {
  const { w, d, h, floors, rise, shutter } = HOUSE_VARIANTS[variant]
  const body = new Kit(10 + variant)
  const roof = new Kit(20 + variant)
  const glow = new Kit(30 + variant)
  const base = 0.5
  const top = base + h
  const fh = h / floors

  body.box(w + 0.35, base, d + 0.35, P.stone, { p: [0, base / 2, 0] }, 0.1)
  body.box(w, h, d, P.plaster, { p: [0, base + h / 2, 0] })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.box(0.3, h, 0.3, P.timber, { p: [(sx * w) / 2, base + h / 2, (sz * d) / 2] })
    }
  }

  // Floor beams all the way round.
  for (let f = 0; f <= floors; f += 1) {
    const y = Math.min(top - 0.1, base + 0.1 + f * fh)
    for (const sz of [-1, 1]) {
      body.box(w + 0.08, 0.22, 0.14, P.timber, { p: [0, y, sz * (d / 2 + 0.04)] })
    }
    for (const sx of [-1, 1]) {
      body.box(0.14, 0.22, d + 0.08, P.timber, { p: [sx * (w / 2 + 0.04), y, 0] })
    }
  }

  // Upper floors: diagonal braces at the front corners and a stud on each side wall.
  const braceX = w / 2 - 0.42
  const braceLen = fh / Math.cos(0.55)
  for (let f = 1; f < floors; f += 1) {
    const y = base + f * fh + fh / 2
    for (const sx of [-1, 1]) {
      body.box(0.15, braceLen * 0.95, 0.1, P.timber, {
        p: [sx * braceX, y, d / 2 + 0.05],
        r: [0, 0, sx * 0.55],
      })
      body.box(0.14, fh, 0.12, P.timber, { p: [sx * (w / 2 + 0.05), y, 0] })
    }
  }

  // Front door, step and a little lantern beside it.
  const wide = w > 5.5
  const doorX = wide ? 0 : 0.8
  body.box(1.35, 2.15, 0.1, P.timber, { p: [doorX, base + 1.07, d / 2 + 0.03] })
  body.box(1.1, 1.95, 0.08, '#7a4527', { p: [doorX, base + 0.98, d / 2 + 0.08] })
  body.box(0.1, 0.1, 0.06, P.gold, { p: [doorX + 0.38, base + 0.95, d / 2 + 0.14] })
  body.box(1.6, base, 0.6, P.stoneDark, { p: [doorX, base / 2, d / 2 + 0.45] })
  body.box(0.5, 0.06, 0.06, P.iron, { p: [doorX + 0.9, base + 2.05, d / 2 + 0.2] })
  body.box(0.26, 0.06, 0.26, P.iron, { p: [doorX + 1.05, base + 2.02, d / 2 + 0.28] })
  glow.box(0.18, 0.26, 0.18, P.glow, { p: [doorX + 1.05, base + 1.85, d / 2 + 0.28] })

  // Windows.
  const groundWindows = wide ? [-(w / 2 - 1.05), w / 2 - 1.05] : [-1.0]
  for (const x of groundWindows) {
    addWindow(body, glow, { x, y: base + fh * 0.55, z: d / 2, ry: 0, shutter })
  }
  const upperWindows = wide ? [-1.5, 0, 1.5] : [-0.95, 0.95]
  for (let f = 1; f < floors; f += 1) {
    for (const x of upperWindows) {
      addWindow(body, glow, { x, y: base + f * fh + fh * 0.52, z: d / 2, ry: 0, w: 0.7, h: 0.8 })
    }
  }
  for (let f = 0; f < floors; f += 1) {
    for (const sx of [-1, 1]) {
      addWindow(body, glow, {
        x: (sx * w) / 2,
        y: base + f * fh + fh * 0.52,
        z: 0,
        ry: (sx * Math.PI) / 2,
        w: 0.7,
        h: 0.8,
      })
    }
  }

  // Gable ends, with a small round-ish attic window at the front.
  body.add(gableGeometry(w, rise, d), P.plaster, { p: [0, top, 0] })
  addWindow(body, glow, { x: 0, y: top + rise * 0.36, z: d / 2, ry: 0, w: 0.5, h: 0.55 })

  // Chimney.
  const chimneyH = rise * 0.7 + 1.0
  body.box(0.75, chimneyH, 0.75, P.stoneDark, {
    p: [w * 0.25, top + rise * 0.3 + chimneyH / 2, -d * 0.2],
  }, 0.1)
  body.box(0.95, 0.2, 0.95, P.stone, { p: [w * 0.25, top + rise * 0.3 + chimneyH + 0.1, -d * 0.2] })

  // Roof: rows of shingles down each slope, alternating shade.
  const theta = Math.atan2(rise, w / 2)
  const overhang = 0.5
  const slope = (w / 2 + overhang) / Math.cos(theta)
  const rows = 5
  const thick = 0.26
  const depth = d + 0.9
  const ridgeY = top + rise
  for (const s of [-1, 1]) {
    const dx = s * Math.cos(theta)
    const dy = -Math.sin(theta)
    const nx = s * Math.sin(theta)
    const ny = Math.cos(theta)
    for (let i = 0; i < rows; i += 1) {
      const along = (slope / rows) * (i + 0.5)
      const lift = thick / 2 + (i % 2) * 0.035
      roof.box(slope / rows + 0.04, thick, depth, i % 2 ? '#dedede' : '#ffffff', {
        p: [dx * along + nx * lift, ridgeY + dy * along + ny * lift, 0],
        r: [0, 0, -s * theta],
      })
    }
  }
  roof.box(0.5, 0.34, depth + 0.1, '#8f8f8f', { p: [0, ridgeY + thick * 0.85, 0] })

  return { body: body.build(), roof: roof.build(), glow: glow.build() }
}

// --- Plaza wall --------------------------------------------------------------------------

const WALL_STONES = [P.stone, P.stoneDark, P.stoneLight, '#7f7a90', '#9690a6']

/** Low dry-stone wall around the plaza: a dark core with chunky stones on top. */
export function buildWall(radius) {
  const k = new Kit(5)
  const thickness = 0.9
  const rowH = 0.42
  const rows = 3
  const coreSegments = 64
  const coreLen = (2 * Math.PI * radius) / coreSegments + 0.12

  for (let i = 0; i < coreSegments; i += 1) {
    const deg = (i / coreSegments) * 360
    const [x, z] = polar(radius, deg)
    k.box(coreLen, rows * rowH, thickness - 0.14, '#555163', {
      p: [x, (rows * rowH) / 2, z],
      r: [0, -deg * D2R, 0],
    })
  }

  const course = (y, h, depth, minLen, maxLen, colors, startDeg) => {
    let a = startDeg * D2R
    const end = a + Math.PI * 2
    while (a < end - 0.01) {
      const len = minLen + k.rand() * (maxLen - minLen)
      const da = Math.min(len / radius, end - a)
      const deg = (a + da / 2) / D2R
      const [x, z] = polar(radius + (k.rand() - 0.5) * 0.06, deg)
      k.box(da * radius - 0.07, h, depth, colors[Math.floor(k.rand() * colors.length)], {
        p: [x, y, z],
        r: [0, -deg * D2R, 0],
      }, 0.08)
      a += da
    }
  }

  for (let row = 0; row < rows; row += 1) {
    course(row * rowH + rowH / 2, rowH - 0.05, thickness, 0.9, 1.7, WALL_STONES, row * 17)
  }
  course(rows * rowH + 0.11, 0.22, thickness + 0.18, 1.1, 1.7, ['#aaa5b9', '#9d98ad', '#b3aec0'], 5)

  // Moss on the cap stones.
  for (let i = 0; i < 40; i += 1) {
    const deg = k.rand() * 360
    const [x, z] = polar(radius, deg)
    k.box(0.35 + k.rand() * 0.5, 0.06, 0.55, '#5b8a4a', {
      p: [x, rows * rowH + 0.24, z],
      r: [0, -deg * D2R, 0],
    }, 0.15)
  }

  return k.build()
}

// --- Castle on the hill ----------------------------------------------------------------

const CASTLE = {
  stone: '#a39eb5',
  stoneDark: '#878199',
  roof: '#3d4c9c',
  gold: '#e2b13c',
  banner: '#b8423a',
  gate: '#2a2236',
}
const CASTLE_SCALE = 1.3
const HILL_TOP = 26

function castleFrame(k, fn) {
  k.group({ p: [0, HILL_TOP, 0], s: CASTLE_SCALE }, fn)
}

/** The distant castle the portals lead to: hill, walls, towers and keep in one mesh. */
export function buildCastle() {
  const k = new Kit(77)

  const hill = jitterGeometry(new CylinderGeometry(22, 62, HILL_TOP, 12, 3), 0.12, 3)
  k.add(
    hill,
    (c, rand) => {
      if (c.y > HILL_TOP - 0.5) return '#4d7d48'
      return rand() < 0.3 ? '#6f6a86' : rand() < 0.5 ? '#467446' : '#3f6b42'
    },
    { p: [0, HILL_TOP / 2, 0] },
    0.1,
  )

  castleFrame(k, (c) => {
    const ground = 1.5
    c.box(32, ground, 32, CASTLE.stoneDark, { p: [0, ground / 2, 0] })

    // Curtain walls with merlons.
    const wallH = 8
    const walls = [
      { p: [0, 0, -15], len: 30, rotY: 0 },
      { p: [-15, 0, 0], len: 30, rotY: Math.PI / 2 },
      { p: [15, 0, 0], len: 30, rotY: Math.PI / 2 },
      { p: [-9.5, 0, 15], len: 11, rotY: 0 },
      { p: [9.5, 0, 15], len: 11, rotY: 0 },
    ]
    for (const wall of walls) {
      c.group({ p: wall.p, r: [0, wall.rotY, 0] }, (g) => {
        g.box(wall.len, wallH, 2.4, CASTLE.stone, { p: [0, ground + wallH / 2, 0] }, 0.06)
        const count = Math.round(wall.len / 2.6)
        for (let i = 0; i < count; i += 1) {
          const x = -wall.len / 2 + (wall.len / count) * (i + 0.5)
          g.box(1.3, 1.2, 2.6, CASTLE.stoneDark, { p: [x, ground + wallH + 0.6, 0] })
        }
      })
    }

    // Corner towers.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = [sx * 15, 0, sz * 15]
        c.cyl(3.4, 3.7, 14, 8, CASTLE.stone, { p: [p[0], ground + 7, p[2]] }, 0.06)
        c.cyl(4.0, 4.0, 1.0, 8, CASTLE.stoneDark, { p: [p[0], ground + 14.5, p[2]] })
        c.cone(4.6, 7.5, 8, CASTLE.roof, { p: [p[0], ground + 15 + 3.75, p[2]] }, 0.08)
        c.cone(0.3, 1.6, 4, CASTLE.gold, { p: [p[0], ground + 23.3, p[2]] })
      }
    }

    // Gatehouse.
    for (const sx of [-1, 1]) {
      c.box(4.4, 12, 4.4, CASTLE.stone, { p: [sx * 4.2, ground + 6, 15.4] }, 0.06)
      c.cone(3.5, 3.6, 4, CASTLE.roof, { p: [sx * 4.2, ground + 13.8, 15.4], r: [0, Math.PI / 4, 0] })
    }
    c.box(4.4, 9, 2.6, CASTLE.stone, { p: [0, ground + 4.5 + 3.2, 15] })
    c.box(5.2, 6.6, 0.4, CASTLE.stoneDark, { p: [0, ground + 3.3, 16.35] })

    // Keep with a pyramid roof, banners, and one tall tower.
    c.box(15, 17, 12, CASTLE.stone, { p: [0, ground + 8.5, -4] }, 0.05)
    c.cone(11.2, 7.5, 4, CASTLE.roof, { p: [0, ground + 17 + 3.75, -4], r: [0, Math.PI / 4, 0] }, 0.06)
    for (const sx of [-1, 1]) {
      c.box(1.6, 4.6, 0.15, CASTLE.banner, { p: [sx * 4.9, ground + 11, 2.1] })
      c.box(1.6, 0.3, 0.2, CASTLE.gold, { p: [sx * 4.9, ground + 8.6, 2.1] })
    }
    c.cyl(3.1, 3.3, 28, 8, CASTLE.stone, { p: [-5.5, ground + 14, -8] }, 0.05)
    c.cyl(3.7, 3.7, 1.0, 8, CASTLE.stoneDark, { p: [-5.5, ground + 28.4, -8] })
    c.cone(3.9, 9, 8, CASTLE.roof, { p: [-5.5, ground + 29 + 4.5, -8] }, 0.06)
    c.cyl(0.12, 0.12, 4, 4, CASTLE.stoneDark, { p: [-5.5, ground + 39.5, -8] })
    c.box(2.4, 1.4, 0.1, CASTLE.gold, { p: [-4.2, ground + 40.6, -8] })
  })

  return k.build()
}

/** Lit castle windows and the glowing gate, added to the shared glow mesh. */
export function addCastleGlow(glow, position) {
  glow.group({ p: position }, (g) =>
    castleFrame(g, (c) => {
      const ground = 1.5
      for (const y of [ground + 7, ground + 12]) {
        for (const x of [-2.2, 0, 2.2]) {
          c.box(1.0, 1.7, 0.2, P.glow, { p: [x, y, 2.05] })
        }
      }
      for (const sx of [-1, 1]) c.box(0.8, 1.4, 0.3, P.glow, { p: [sx * 15, ground + 9, 18.6] })
      for (const y of [14, 20, 26]) c.box(0.7, 1.3, 0.3, P.glow, { p: [-5.5, ground + y, -4.85] })
      c.box(3.8, 4.4, 0.3, '#ffb85c', { p: [0, ground + 2.2, 16.5] })
      c.add(
        new CylinderGeometry(1.9, 1.9, 0.3, 10, 1, false, -Math.PI / 2, Math.PI),
        '#ffb85c',
        { p: [0, ground + 4.4, 16.5], r: [-Math.PI / 2, 0, 0] },
      )
    }),
  )
}

/** Window-light positions on the castle, for halos. */
export function castleHalos(position) {
  const s = CASTLE_SCALE
  const y0 = HILL_TOP + 1.5 * s
  return [[position[0], position[1] + y0 + 2.2 * s, position[2] + 17 * s, 26]]
}
