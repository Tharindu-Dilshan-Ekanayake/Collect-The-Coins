import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

import { input } from '../state/input'
import { registerDebug } from './lib/debug'

const MOUSE_SENSITIVITY = 0.0022
const DRAG_SENSITIVITY = 0.006
const MIN_PITCH = -1.2
const MAX_PITCH = 1.35
/** Eye height above the body centre (the body centre is 0.9 m above the feet). */
const EYE = 0.72

/** Is the pointer locked to this canvas (mouse-look mode)? */
const isPointerLocked = (el) => typeof document !== 'undefined' && document.pointerLockElement === el

/**
 * First-person view for stages.
 *
 * Desktop: clicking the 3D view locks the mouse; moving it looks around and the
 * crosshair (screen centre) is the aim. Esc releases it. While unlocked, right-drag
 * also looks. Touch: one-finger drag looks; taps are left to the coin grabber.
 *
 * `look.pitch` is positive when looking down (same sign as the orbit camera).
 *
 * @param {{ bodyRef, initialYaw?: number, canLock?: () => boolean }} props
 */
export function FirstPersonCamera({ bodyRef, initialYaw = 0, canLock = () => true }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const look = useRef({ yaw: initialYaw, pitch: 0.18 })

  useEffect(() => registerDebug('orbit', look), [])

  useEffect(() => {
    camera.rotation.order = 'YXZ'
    const el = gl.domElement
    const drags = new Map()

    const turn = (dx, dy, k) => {
      const l = look.current
      l.yaw -= dx * k
      l.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, l.pitch + dy * k))
    }

    const onDown = (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button === 0 && !isPointerLocked(el) && canLock()) {
          // Some browsers reject the request (iframes, tests); right-drag still works.
          el.requestPointerLock?.()?.catch?.(() => {})
        }
        if (e.button !== 2) return
      }
      drags.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const onMove = (e) => {
      if (e.pointerType === 'mouse' && isPointerLocked(el)) {
        turn(e.movementX, e.movementY, MOUSE_SENSITIVITY * input.lookScale)
        return
      }
      const last = drags.get(e.pointerId)
      if (!last) return
      turn(e.clientX - last.x, e.clientY - last.y, DRAG_SENSITIVITY * input.lookScale)
      last.x = e.clientX
      last.y = e.clientY
    }
    const onUp = (e) => drags.delete(e.pointerId)
    const onContextMenu = (e) => e.preventDefault()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('contextmenu', onContextMenu)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('contextmenu', onContextMenu)
      if (isPointerLocked(el)) document.exitPointerLock()
      camera.rotation.order = 'XYZ'
    }
  }, [camera, gl, canLock])

  useFrame(() => {
    const body = bodyRef.current
    if (!body) return
    const p = body.translation()
    camera.position.set(p.x, p.y + EYE, p.z)
    camera.rotation.set(-look.current.pitch, look.current.yaw, 0)
  })

  return null
}

export default FirstPersonCamera
