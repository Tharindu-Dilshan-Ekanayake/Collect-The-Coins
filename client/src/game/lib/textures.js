import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

import { mulberry32 } from './kit'

/**
 * Procedural canvas textures. Nothing is downloaded: cobbles, grass, the leaderboards,
 * signs and labels are all drawn at runtime, sized by the quality preset's `texSize`.
 */

export const FONT_FAMILY = 'Fredoka, "Trebuchet MS", system-ui, sans-serif'
export const font = (weight, px) => `${weight} ${Math.round(px)}px ${FONT_FAMILY}`

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Wraps a canvas as an sRGB texture. `redraw(fn)` repaints it in place, no realloc. */
export function canvasTexture(width, height, draw, { repeat = false, anisotropy = 4 } = {}) {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  draw(ctx, width, height)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = anisotropy
  if (repeat) {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
  }
  texture.redraw = (fn) => {
    ctx.clearRect(0, 0, width, height)
    fn(ctx, width, height)
    texture.needsUpdate = true
  }
  return texture
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Outlined text: dark stroke behind a coloured fill, readable on anything. */
function outlinedText(ctx, text, x, y, { fill = '#fff', stroke = '#2b1d14', width = 6 } = {}) {
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.lineWidth = width
  ctx.strokeStyle = stroke
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

/** Calls draw at the 9 wrapped offsets so shapes crossing an edge tile seamlessly. */
function wrapped(size, x, y, reach, draw) {
  for (const ox of [-size, 0, size]) {
    if (x + ox < -reach || x + ox > size + reach) continue
    for (const oy of [-size, 0, size]) {
      if (y + oy < -reach || y + oy > size + reach) continue
      draw(x + ox, y + oy)
    }
  }
}

// --- Ground -----------------------------------------------------------------------

const COBBLE_COLORS = ['#ada6a8', '#a19a9d', '#b8b0ae', '#97909a', '#aea398', '#b6aca2']

/** Rounded, irregular cobblestones on dark mortar. Tileable. */
export function cobbleTexture(size) {
  return canvasTexture(
    size,
    size,
    (ctx) => {
      const rand = mulberry32(42)
      ctx.fillStyle = '#6e6766'
      ctx.fillRect(0, 0, size, size)

      const cells = 9
      const cell = size / cells
      for (let cy = 0; cy < cells; cy += 1) {
        for (let cx = 0; cx < cells; cx += 1) {
          // Brick-like stagger on alternate rows.
          const x = (cx + 0.5 + (cy % 2) * 0.5 + (rand() - 0.5) * 0.3) * cell
          const y = (cy + 0.5 + (rand() - 0.5) * 0.3) * cell
          const radius = cell * (0.5 + rand() * 0.07)
          const sides = 6 + Math.floor(rand() * 3)
          const squash = 0.82 + rand() * 0.3
          const spin = rand() * Math.PI
          const points = Array.from({ length: sides }, (_, i) => {
            const a = (i / sides) * Math.PI * 2 + spin
            const r = radius * (0.72 + rand() * 0.3)
            return [Math.cos(a) * r * squash, Math.sin(a) * r * (2 - squash)]
          })
          const color = COBBLE_COLORS[Math.floor(rand() * COBBLE_COLORS.length)]

          wrapped(size, x, y, radius * 1.2, (px, py) => {
            ctx.beginPath()
            points.forEach(([dx, dy], i) => {
              const [nx, ny] = points[(i + 1) % points.length]
              const mx = px + (dx + nx) / 2
              const my = py + (dy + ny) / 2
              if (i === 0) ctx.moveTo(mx, my)
              ctx.quadraticCurveTo(px + nx, py + ny, mx, my)
            })
            ctx.closePath()
            ctx.fillStyle = color
            ctx.fill()
            // Light from the top-left: a soft highlight and a shaded lower edge.
            const g = ctx.createLinearGradient(px - radius, py - radius, px + radius, py + radius)
            g.addColorStop(0, 'rgba(255,250,240,0.16)')
            g.addColorStop(0.55, 'rgba(255,255,255,0)')
            g.addColorStop(1, 'rgba(30,15,20,0.2)')
            ctx.fillStyle = g
            ctx.fill()
          })
        }
      }
    },
    { repeat: true, anisotropy: 8 },
  )
}

const FLAG_COLORS = ['#d2c2a6', '#c7b597', '#dccdb2', '#bfab8c', '#cfbb9b']

/** Warm rectangular flagstones in running bond, for the paths and fountain ring. Tileable. */
export function flagstoneTexture(size) {
  return canvasTexture(
    size,
    size,
    (ctx) => {
      const rand = mulberry32(77)
      ctx.fillStyle = '#7b6d60'
      ctx.fillRect(0, 0, size, size)
      const rows = 6
      const rowH = size / rows
      const gap = Math.max(2, size / 170)

      for (let r = 0; r < rows; r += 1) {
        // Random widths that sum to exactly one tile, so rows wrap seamlessly.
        const widths = []
        let total = 0
        while (total < size) {
          const w = rowH * (1.1 + rand() * 1.1)
          widths.push(w)
          total += w
        }
        const scale = size / total
        let x = (r % 2) * rowH * 0.6
        for (const w0 of widths) {
          const w = w0 * scale
          const color = FLAG_COLORS[Math.floor(rand() * FLAG_COLORS.length)]
          for (const ox of [-size, 0]) {
            const sx = x + ox + gap
            const sy = r * rowH + gap
            const sw = w - gap * 2
            const sh = rowH - gap * 2
            roundRect(ctx, sx, sy, sw, sh, gap * 2)
            ctx.fillStyle = color
            ctx.fill()
            const g = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh)
            g.addColorStop(0, 'rgba(255,250,235,0.2)')
            g.addColorStop(0.5, 'rgba(255,255,255,0)')
            g.addColorStop(1, 'rgba(60,40,20,0.18)')
            ctx.fillStyle = g
            ctx.fill()
          }
          x += w
        }
      }
    },
    { repeat: true, anisotropy: 8 },
  )
}

const GRASS_BLADES = ['#4f8a3c', '#6aa64f', '#78b45a', '#568f40', '#83bd62']

/** Soft painterly grass with darker patches and the odd tiny flower. Tileable. */
export function grassTexture(size) {
  return canvasTexture(
    size,
    size,
    (ctx) => {
      const rand = mulberry32(7)
      ctx.fillStyle = '#5f9548'
      ctx.fillRect(0, 0, size, size)
      const k = size / 512

      for (let i = 0; i < 26; i += 1) {
        const x = rand() * size
        const y = rand() * size
        const r = (30 + rand() * 60) * k
        const dark = rand() > 0.5
        wrapped(size, x, y, r, (px, py) => {
          const g = ctx.createRadialGradient(px, py, 0, px, py, r)
          g.addColorStop(0, dark ? 'rgba(40,80,35,0.35)' : 'rgba(150,200,110,0.25)')
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.fillRect(px - r, py - r, r * 2, r * 2)
        })
      }

      ctx.lineCap = 'round'
      // Blade count scales with area, so a 256 px texture does a quarter of the work.
      const blades = Math.round(2600 * (size / 512) ** 2)
      for (let i = 0; i < blades; i += 1) {
        const x = rand() * size
        const y = rand() * size
        const len = (3 + rand() * 6) * k
        const lean = (rand() - 0.5) * 3 * k
        ctx.strokeStyle = GRASS_BLADES[Math.floor(rand() * GRASS_BLADES.length)]
        ctx.globalAlpha = 0.55 + rand() * 0.45
        ctx.lineWidth = (1 + rand() * 1.2) * k
        wrapped(size, x, y, len, (px, py) => {
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px + lean, py - len)
          ctx.stroke()
        })
      }
      ctx.globalAlpha = 1

      for (let i = 0; i < 40; i += 1) {
        ctx.fillStyle = rand() > 0.5 ? '#fff6d8' : '#ffd95a'
        ctx.beginPath()
        ctx.arc(rand() * size, rand() * size, 1.6 * k, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    { repeat: true, anisotropy: 8 },
  )
}

// --- Leaderboard ------------------------------------------------------------------

const MEDALS = ['#f2b53a', '#c3c9d2', '#cf8d55']

/** Parchment leaderboard: ribbon title, column header, ten ranked rows. 3:4 aspect. */
export function drawLeaderboard(ctx, w, h, board) {
  const k = w / 768
  const rand = mulberry32(board.id.length * 13)

  // Parchment with a darker edge.
  ctx.fillStyle = '#f2e1bb'
  ctx.fillRect(0, 0, w, h)
  const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.85)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(110,60,20,0.35)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgb(120,80,40)'
  const specks = Math.round(700 * k * k)
  for (let i = 0; i < specks; i += 1) {
    ctx.globalAlpha = rand() * 0.08
    ctx.fillRect(rand() * w, rand() * h, 2 * k, 2 * k)
  }
  ctx.globalAlpha = 1

  // Ribbon header.
  ctx.fillStyle = '#9a3d2f'
  roundRect(ctx, 40 * k, 34 * k, w - 80 * k, 118 * k, 26 * k)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  roundRect(ctx, 52 * k, 44 * k, w - 104 * k, 40 * k, 18 * k)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = font(700, 72 * k)
  outlinedText(ctx, board.title, w / 2, 96 * k, { fill: '#fff4dc', width: 10 * k })

  ctx.font = font(600, 30 * k)
  ctx.fillStyle = '#8a5a34'
  ctx.fillText('★  ALL TIME  ★', w / 2, 190 * k)

  // Column header.
  ctx.font = font(700, 30 * k)
  ctx.fillStyle = '#5a3b25'
  ctx.textAlign = 'left'
  ctx.fillText('#', 70 * k, 240 * k)
  ctx.fillText('Player', 160 * k, 240 * k)
  ctx.textAlign = 'right'
  ctx.fillText(board.unit, w - 70 * k, 240 * k)
  ctx.fillStyle = '#b48a5c'
  ctx.fillRect(56 * k, 264 * k, w - 112 * k, 4 * k)

  const rowH = 70 * k
  const top = 280 * k
  board.rows.slice(0, 10).forEach(([name, value], i) => {
    const y = top + i * rowH
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(160,110,60,0.14)'
      roundRect(ctx, 48 * k, y + 4 * k, w - 96 * k, rowH - 8 * k, 14 * k)
      ctx.fill()
    }
    const cy = y + rowH / 2

    if (i < 3) {
      ctx.fillStyle = MEDALS[i]
      ctx.beginPath()
      ctx.arc(84 * k, cy, 26 * k, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 4 * k
      ctx.strokeStyle = 'rgba(80,50,20,0.6)'
      ctx.stroke()
      ctx.fillStyle = '#4a2e1d'
    } else {
      ctx.fillStyle = '#8a6a4a'
    }
    ctx.textAlign = 'center'
    ctx.font = font(700, 32 * k)
    ctx.fillText(String(i + 1), 84 * k, cy + 2 * k)

    ctx.textAlign = 'left'
    ctx.font = font(i < 3 ? 700 : 600, 36 * k)
    ctx.fillStyle = '#4a2e1d'
    ctx.fillText(name, 140 * k, cy + 2 * k)

    ctx.textAlign = 'right'
    ctx.font = font(700, 36 * k)
    ctx.fillStyle = i === 0 ? '#b0700c' : '#5a3b25'
    ctx.fillText(value, w - 66 * k, cy + 2 * k)
  })

  ctx.textAlign = 'center'
  ctx.font = font(600, 26 * k)
  ctx.fillStyle = '#9a7650'
  ctx.fillText('Beat a record to see your name here!', w / 2, h - 34 * k)
}

// --- Signs & labels -------------------------------------------------------------------

/** Wooden stall sign, 4:1. */
export function drawStallSign(ctx, w, h, { title, subtitle, color }) {
  const k = w / 1024
  const rand = mulberry32(title.length * 31)
  ctx.fillStyle = '#7a4a2a'
  ctx.fillRect(0, 0, w, h)
  // Planks and grain.
  for (let i = 1; i < 3; i += 1) {
    ctx.fillStyle = 'rgba(40,20,10,0.35)'
    ctx.fillRect(0, (h / 3) * i - 2 * k, w, 4 * k)
  }
  for (let i = 0; i < 70; i += 1) {
    ctx.strokeStyle = `rgba(50,25,10,${0.08 + rand() * 0.12})`
    ctx.lineWidth = (1 + rand() * 2) * k
    const y = rand() * h
    ctx.beginPath()
    ctx.moveTo(rand() * w * 0.3, y)
    ctx.bezierCurveTo(w * 0.4, y + (rand() - 0.5) * 12 * k, w * 0.6, y, w * (0.7 + rand() * 0.3), y)
    ctx.stroke()
  }
  ctx.lineWidth = 14 * k
  ctx.strokeStyle = '#4a2a16'
  ctx.strokeRect(7 * k, 7 * k, w - 14 * k, h - 14 * k)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = font(700, 120 * k)
  outlinedText(ctx, title, w / 2, h * 0.42, { fill: '#fff1cf', stroke: '#2b1608', width: 14 * k })
  ctx.font = font(600, 44 * k)
  outlinedText(ctx, subtitle, w / 2, h * 0.8, { fill: color, stroke: '#2b1608', width: 8 * k })
}

/**
 * Floating party-slot label, 8:5, transparent background:
 *   [EASY]        optional coloured tag (difficulty of a hosted party)
 *   0/4           players in the party
 *   Touch to create a party
 */
export function drawSlotLabel(ctx, w, h, { count, max, hint, tag, tagColor, active }) {
  const k = w / 1024
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (tag) {
    ctx.font = font(700, 64 * k)
    const tw = ctx.measureText(tag).width + 70 * k
    ctx.fillStyle = tagColor
    roundRect(ctx, w / 2 - tw / 2, 18 * k, tw, 92 * k, 46 * k)
    ctx.fill()
    ctx.lineWidth = 8 * k
    ctx.strokeStyle = '#2b1d14'
    ctx.stroke()
    outlinedText(ctx, tag, w / 2, 66 * k, { fill: '#fff', width: 9 * k })
  }

  ctx.font = font(700, 230 * k)
  outlinedText(ctx, `${count}/${max}`, w / 2, 290 * k, {
    fill: active ? '#ffe9a8' : '#ffffff',
    width: 20 * k,
  })

  ctx.font = font(600, 72 * k)
  outlinedText(ctx, hint, w / 2, 500 * k, { fill: active ? '#ffd34d' : '#f2ecff', width: 12 * k })
}

/** Player name tag, 4:1, transparent background. */
export function drawNameTag(ctx, w, h, { name, title }) {
  const k = w / 512
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = font(700, 34 * k)
  outlinedText(ctx, title, w / 2, 34 * k, { fill: '#ffd34d', width: 7 * k })
  ctx.font = font(700, 52 * k)
  outlinedText(ctx, name, w / 2, 88 * k, { fill: '#ffffff', width: 9 * k })
}

/** Soft round dark blob, for the fake contact shadow on LOW. */
export function blobShadowTexture() {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(0,0,0,0.55)')
    g.addColorStop(0.6, 'rgba(0,0,0,0.25)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  })
}

// --- Treasure Hall ---------------------------------------------------------------------

const BRICKS = ['#7a2f38', '#6b2831', '#863843', '#5f222b', '#8c4048', '#73303a']

/**
 * Brick (or carved stone) in running bond. Tileable; one tile = 4 m x 2 m of wall.
 * Deep burgundy by default; each map passes its own colours.
 */
export function brickTexture(size, { bricks = BRICKS, mortar = '#c9b49a', seed = 31 } = {}) {
  return canvasTexture(
    size,
    size / 2,
    (ctx, w, h) => {
      const rand = mulberry32(seed)
      ctx.fillStyle = mortar
      ctx.fillRect(0, 0, w, h)
      const rows = 8
      const rowH = h / rows
      const brickW = w / 8
      const gap = Math.max(2, w / 260)
      for (let r = 0; r < rows; r += 1) {
        const offset = (r % 2) * brickW * 0.5
        for (let c = -1; c <= 8; c += 1) {
          const x = c * brickW + offset
          const y = r * rowH
          ctx.fillStyle = bricks[Math.floor(rand() * bricks.length)]
          ctx.fillRect(x + gap, y + gap, brickW - gap * 2, rowH - gap * 2)
          const g = ctx.createLinearGradient(x, y, x, y + rowH)
          g.addColorStop(0, 'rgba(255,255,255,0.12)')
          g.addColorStop(1, 'rgba(0,0,0,0.18)')
          ctx.fillStyle = g
          ctx.fillRect(x + gap, y + gap, brickW - gap * 2, rowH - gap * 2)
        }
      }
    },
    { repeat: true, anisotropy: 8 },
  )
}

/** Overlapping coins seen from above, for the bed under the loose 3D coins. Tileable. */
export function coinBedTexture(size) {
  return canvasTexture(
    size,
    size,
    (ctx) => {
      const rand = mulberry32(12)
      ctx.fillStyle = '#c98a12'
      ctx.fillRect(0, 0, size, size)
      const r0 = size / 14
      for (let i = 0; i < 260; i += 1) {
        const x = rand() * size
        const y = rand() * size
        const r = r0 * (0.8 + rand() * 0.4)
        const squash = 0.55 + rand() * 0.45
        const tone = rand()
        wrapped(size, x, y, r * 1.2, (px, py) => {
          ctx.beginPath()
          ctx.ellipse(px, py + r * 0.12, r, r * squash, 0, 0, Math.PI * 2)
          ctx.fillStyle = '#9a6508'
          ctx.fill()
          ctx.beginPath()
          ctx.ellipse(px, py, r, r * squash, 0, 0, Math.PI * 2)
          ctx.fillStyle = tone > 0.5 ? '#ffd24d' : '#f5bd2e'
          ctx.fill()
          ctx.beginPath()
          ctx.ellipse(px, py, r * 0.72, r * squash * 0.72, 0, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(160,100,10,0.55)'
          ctx.lineWidth = r * 0.08
          ctx.stroke()
        })
      }
    },
    { repeat: true, anisotropy: 8 },
  )
}

/** Wooden price plaques stacked in one texture (one 2:1 row per tool). */
export function drawPricePlaques(ctx, w, h, items) {
  const cellH = h / items.length
  const k = cellH / 256
  items.forEach((item, i) => {
    const y = i * cellH
    ctx.fillStyle = '#5a341c'
    roundRect(ctx, 8 * k, y + 8 * k, w - 16 * k, cellH - 16 * k, 26 * k)
    ctx.fill()
    ctx.lineWidth = 10 * k
    ctx.strokeStyle = item.owned ? '#7fd36a' : '#c98a12'
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = font(700, 44 * k)
    outlinedText(ctx, item.name, w / 2, y + 80 * k, { fill: '#fff1cf', stroke: '#2b1608', width: 8 * k })
    ctx.font = font(700, 62 * k)
    const label = item.owned ? 'OWNED' : item.price === 0 ? 'FREE' : item.price.toLocaleString('en-US')
    outlinedText(ctx, label, w / 2, y + 170 * k, {
      fill: item.owned ? '#9cf08a' : '#ffd34d',
      stroke: '#2b1608',
      width: 10 * k,
    })
  })
}

/** Floating sign: big outlined title and a smaller line under it. 2:1, transparent. */
export function drawFloatingSign(ctx, w, h, { title, sub, color = '#ffd34d' }) {
  const k = w / 1024
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = font(700, 200 * k)
  outlinedText(ctx, title, w / 2, h * 0.42, { fill: color, width: 22 * k })
  ctx.font = font(600, 78 * k)
  outlinedText(ctx, sub, w / 2, h * 0.82, { fill: '#fff4dc', width: 12 * k })
}

/** A minted gold coin face on a transparent square (cut out with alphaTest). */
/**
 * A lit sphere for MeshMatcapMaterial: warm white highlight, soft falloff and a dark
 * rim, so gold looks polished with no lights or environment map. Neutral-warm on
 * purpose: it multiplies the gold coin texture.
 */
export function goldMatcapTexture(size = 128) {
  return canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#6a5030'
    ctx.fillRect(0, 0, w, h)
    const g = ctx.createRadialGradient(w * 0.36, h * 0.3, w * 0.02, w * 0.5, h * 0.5, w * 0.5)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.12, '#fff6dc')
    g.addColorStop(0.42, '#e8d2a4')
    g.addColorStop(0.72, '#c4a470')
    g.addColorStop(0.92, '#8a6a3e')
    g.addColorStop(1, '#6a5030')
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
    // Bounce light from the gold below.
    const r = ctx.createRadialGradient(w * 0.62, h * 0.82, 0, w * 0.62, h * 0.82, w * 0.32)
    r.addColorStop(0, 'rgba(255, 220, 140, 0.55)')
    r.addColorStop(1, 'rgba(255, 220, 140, 0)')
    ctx.fillStyle = r
    ctx.fill()
  })
}

/**
 * Equirectangular sky for scene.background (horizon across the middle).
 * 'aurora': starry night with green-teal aurora curtains. 'day': blue sky, soft clouds.
 */
export function skyTexture(kind, width) {
  return canvasTexture(width, width / 2, (ctx, w, h) => {
    const rand = mulberry32(kind === 'aurora' ? 515 : 616)
    const g = ctx.createLinearGradient(0, 0, 0, h)
    if (kind === 'aurora') {
      g.addColorStop(0, '#040a1c')
      g.addColorStop(0.32, '#0b1c40')
      g.addColorStop(0.5, '#22406a')
      g.addColorStop(1, '#16283f')
    } else {
      g.addColorStop(0, '#3f8fe0')
      g.addColorStop(0.3, '#7ab8ee')
      g.addColorStop(0.5, '#cfe6dc')
      g.addColorStop(1, '#8fb08a')
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    if (kind === 'aurora') {
      for (let i = 0; i < w / 3; i += 1) {
        ctx.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.6})`
        const s = rand() < 0.1 ? 2 : 1
        ctx.fillRect(rand() * w, rand() * h * 0.46, s, s)
      }
      ctx.filter = `blur(${Math.round(w / 110)}px)`
      for (let band = 0; band < 3; band += 1) {
        ctx.beginPath()
        const y0 = h * (0.2 + band * 0.06)
        for (let x = 0; x <= w; x += w / 64) {
          const y = y0 + Math.sin(x / w * Math.PI * (4 + band) + band) * h * 0.04
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = ['rgba(90,255,170,0.55)', 'rgba(80,220,255,0.4)', 'rgba(170,120,255,0.3)'][band]
        ctx.lineWidth = h * 0.05
        ctx.stroke()
      }
      ctx.filter = 'none'
    } else {
      ctx.filter = `blur(${Math.round(w / 140)}px)`
      for (let i = 0; i < 26; i += 1) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 + rand() * 0.35})`
        ctx.beginPath()
        ctx.ellipse(rand() * w, h * (0.22 + rand() * 0.2), w * (0.02 + rand() * 0.04), h * (0.015 + rand() * 0.02), 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.filter = 'none'
      const sun = ctx.createRadialGradient(w * 0.3, h * 0.26, 0, w * 0.3, h * 0.26, h * 0.16)
      sun.addColorStop(0, 'rgba(255,250,220,1)')
      sun.addColorStop(0.25, 'rgba(255,240,190,0.6)')
      sun.addColorStop(1, 'rgba(255,240,190,0)')
      ctx.fillStyle = sun
      ctx.fillRect(0, 0, w, h)
    }
  })
}

/** Packed snow with soft blue speckles and wind lines. Tileable. */
export function snowTexture(size) {
  return canvasTexture(
    size,
    size,
    (ctx, w) => {
      const rand = mulberry32(88)
      ctx.fillStyle = '#e8f1f9'
      ctx.fillRect(0, 0, w, w)
      for (let i = 0; i < w * 2; i += 1) {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(170,200,230,0.35)' : 'rgba(255,255,255,0.8)'
        const r = 1 + rand() * (w / 128)
        ctx.fillRect(rand() * w, rand() * w, r, r)
      }
      ctx.strokeStyle = 'rgba(150,180,215,0.25)'
      ctx.lineWidth = Math.max(1, w / 256)
      for (let i = 0; i < 9; i += 1) {
        const y = rand() * w
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(w * 0.3, y + w * 0.05, w * 0.6, y - w * 0.05, w, y)
        ctx.stroke()
      }
    },
    { repeat: true, anisotropy: 8 },
  )
}

/** Jungle grass with blades, darker tufts and a few earth patches. Tileable. */
export function jungleGrassTexture(size) {
  return canvasTexture(
    size,
    size,
    (ctx, w) => {
      const rand = mulberry32(99)
      ctx.fillStyle = '#4f8a3a'
      ctx.fillRect(0, 0, w, w)
      for (let i = 0; i < 6; i += 1) {
        ctx.fillStyle = 'rgba(110,80,40,0.25)'
        ctx.beginPath()
        ctx.ellipse(rand() * w, rand() * w, w * 0.08, w * 0.05, rand() * 3, 0, Math.PI * 2)
        ctx.fill()
      }
      const blades = ['#3f7a30', '#5fa046', '#6db352', '#356b29', '#78bd5a']
      ctx.lineWidth = Math.max(1, w / 200)
      for (let i = 0; i < w * 3; i += 1) {
        const x = rand() * w
        const y = rand() * w
        const len = w * (0.01 + rand() * 0.02)
        ctx.strokeStyle = blades[Math.floor(rand() * blades.length)]
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + (rand() - 0.5) * len, y - len)
        ctx.stroke()
      }
    },
    { repeat: true, anisotropy: 8 },
  )
}

export function coinFaceTexture(size) {
  const t = canvasTexture(size, size, (ctx, w) => {
    const c = w / 2
    const disc = (r, fill) => {
      ctx.beginPath()
      ctx.arc(c, c, r * w, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
    }
    disc(0.5, '#a8700c')
    const face = ctx.createRadialGradient(c - w * 0.12, c - w * 0.14, w * 0.04, c, c, w * 0.46)
    face.addColorStop(0, '#fff2a8')
    face.addColorStop(0.45, '#ffd34d')
    face.addColorStop(1, '#d9951c')
    disc(0.455, face)
    // Raised inner ring.
    ctx.lineWidth = w * 0.035
    ctx.strokeStyle = '#b8800f'
    ctx.beginPath()
    ctx.arc(c, c + w * 0.006, w * 0.37, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#fff0a0'
    ctx.lineWidth = w * 0.014
    ctx.beginPath()
    ctx.arc(c, c - w * 0.006, w * 0.37, Math.PI * 0.9, Math.PI * 1.9)
    ctx.stroke()
    // Star emblem with a soft bevel.
    const star = (dx, dy, fill) => {
      ctx.beginPath()
      for (let i = 0; i < 10; i += 1) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5
        const rr = (i % 2 ? 0.1 : 0.23) * w
        const x = c + dx + Math.cos(ang) * rr
        const y = c + dy + Math.sin(ang) * rr
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
    }
    star(w * 0.008, w * 0.012, '#a8700c')
    star(0, 0, '#ffe680')
    // Glint.
    const glint = ctx.createRadialGradient(c - w * 0.2, c - w * 0.22, 0, c - w * 0.2, c - w * 0.22, w * 0.16)
    glint.addColorStop(0, 'rgba(255,255,240,0.75)')
    glint.addColorStop(1, 'rgba(255,255,240,0)')
    ctx.fillStyle = glint
    ctx.fillRect(0, 0, w, w)
  })
  t.anisotropy = 4
  return t
}
