import { useRef, useState } from 'react'

import { useGame } from '../state/game'
import { input, isTouchDevice } from '../state/input'
import { useRun } from '../state/run'
import { ArrowUpIcon, CoinIcon } from './icons'

const BASE = 104
const KNOB = 46
const RANGE = (BASE - KNOB) / 2 + 8

/**
 * On-screen joystick (left) and jump button (right). Writes straight into the shared
 * `input` object; the knob position is the only React state, and it only changes
 * while a finger is on the stick.
 */
export function TouchControls() {
  const inStage = useGame((s) => s.scene === 'stage')
  const collectOn = useRun((s) => Boolean(s.startedAt) && !s.result && !s.panel)
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
        className="pointer-events-auto absolute bottom-4 left-4 z-10 touch-none rounded-full border-4 border-white/40 bg-black/25 backdrop-blur-sm"
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

      {inStage && collectOn && (
        <button
          type="button"
          aria-label="Collect coins"
          className="btn pointer-events-auto absolute right-3 bottom-3 z-10 h-[4.5rem] w-[4.5rem] touch-none !flex-col !gap-0 !rounded-full !p-0"
          style={{ '--btn': '#3fae3f' }}
          onPointerDown={(e) => {
            input.collect = true
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              // No capture: pointerleave/cancel still release the button.
            }
          }}
          onPointerUp={() => {
            input.collect = false
          }}
          onPointerCancel={() => {
            input.collect = false
          }}
          onLostPointerCapture={() => {
            input.collect = false
          }}
        >
          <CoinIcon className="h-8 w-8" />
          <span className="text-[10px] leading-3">COLLECT</span>
        </button>
      )}

      <button
        type="button"
        aria-label="Jump"
        className={`btn pointer-events-auto absolute z-10 touch-none !rounded-full !p-0 ${
          inStage ? 'right-[5.6rem] bottom-4 h-14 w-14' : 'right-4 bottom-5 h-16 w-16'
        }`}
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
        <ArrowUpIcon className="h-8 w-8" />
      </button>
    </>
  )
}

export default TouchControls
