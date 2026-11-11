import { useEffect } from 'react'

/**
 * Player input as one module-level mutable object, deliberately not React state.
 * Keyboard listeners and the touch joystick write to it; the player's `useFrame`
 * reads it. Nothing here ever causes a re-render.
 */
export const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  /** Touch joystick, -1..1 each axis. +y is forward. */
  joyX: 0,
  joyY: 0,
  touchJump: false,
  /** Touch COLLECT button held: grab at the crosshair (screen centre) over and over. */
  collect: false,
  /** performance.now() of the last jump press, so a tap shorter than a frame still jumps. */
  jumpPressedAt: -Infinity,
  /** Boxity camera_sensitivity (0.1..5): scales mouse/touch look speed. */
  lookScale: 1,
}

const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
}

function releaseAll() {
  for (const action of Object.values(KEY_MAP)) input[action] = false
  input.joyX = 0
  input.joyY = 0
  input.touchJump = false
}

/** Attach once, at the app root. */
export function useKeyboardInput() {
  useEffect(() => {
    const onKeyDown = (e) => {
      const action = KEY_MAP[e.code]
      if (!action) return
      e.preventDefault() // stop Space/arrows scrolling the page
      input[action] = true
      if (action === 'jump' && !e.repeat) input.jumpPressedAt = performance.now()
    }
    const onKeyUp = (e) => {
      const action = KEY_MAP[e.code]
      if (action) input[action] = false
    }
    // Alt-tabbing away mid-run otherwise leaves a key stuck down.
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
    }
  }, [])
}

export const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)
