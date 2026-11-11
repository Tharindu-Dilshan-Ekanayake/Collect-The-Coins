import { useRef, useState } from 'react'

import { input, isTouchDevice } from '../state/input'
import { ArrowUpIcon } from './icons'

const BASE = 128
const KNOB = 56
const RANGE = (BASE - KNOB) / 2 + 8

/**
 * On-screen joystick (left) and jump button (right). Writes straight into the shared
 * `input` object; the knob position is the only React state, and it only changes
 * while a finger is on the stick.
 */
export function TouchControls() {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const origin = useRef(null)
  const pointerId = useRef(null)

  if (!isTouchDevice()) return null

  const update = (e) => {
    const o = origin.current
    let dx = e.clientX - o.x
    let dy = e.clientY - o.y
    const len = Math.hypot(dx, dy)
    if (len > RANGE) {
      dx = (dx / len) * RANGE
      dy = (dy / len) * RANGE
    }
    input.joyX = dx / RANGE
    input.joyY = -dy / RANGE
    setKnob({ x: dx, y: dy })
  }

  const onDown = (e) => {
    if (pointerId.current !== null) return
    pointerId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    update(e)
  }

  const onMove = (e) => {
    if (e.pointerId === pointerId.current) update(e)
  }

  const onUp = (e) => {
    if (e.pointerId !== pointerId.current) return
    pointerId.current = null
    input.joyX = 0
    input.joyY = 0
    setKnob({ x: 0, y: 0 })
  }

  return (
    <>
      <div
        className="pointer-events-auto absolute bottom-6 left-6 z-10 touch-none rounded-full border-4 border-white/40 bg-black/25 backdrop-blur-sm"
        style={{ width: BASE, height: BASE }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className="absolute rounded-full border-4 border-ink bg-cream shadow-lg"
          style={{
            width: KNOB,
            height: KNOB,
            left: (BASE - KNOB) / 2 - 4 + knob.x,
            top: (BASE - KNOB) / 2 - 4 + knob.y,
          }}
        />
      </div>

      <button
        type="button"
        aria-label="Jump"
        className="btn pointer-events-auto absolute right-6 bottom-8 z-10 h-20 w-20 touch-none !rounded-full"
        style={{ '--btn': '#f2b53a' }}
        onPointerDown={() => {
          input.touchJump = true
          input.jumpPressedAt = performance.now()
        }}
        onPointerUp={() => {
          input.touchJump = false
        }}
        onPointerCancel={() => {
          input.touchJump = false
        }}
        onPointerLeave={() => {
          input.touchJump = false
        }}
      >
        <ArrowUpIcon className="h-10 w-10" />
      </button>
    </>
  )
}

export default TouchControls
