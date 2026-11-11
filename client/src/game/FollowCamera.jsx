import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { input } from '../state/input'
import { registerDebug } from './lib/debug'
import { LOBBY_WORLD } from './lobby/collision'

/** How high above the player's origin the camera aims. */
const LOOK_HEIGHT = 1.3

const MIN_DISTANCE = 3.5
const MAX_DISTANCE = 18
const START_DISTANCE = 9

// Pitch limits, in radians. Stops the camera flipping over the top or sinking
// under the ground.
const MIN_PITCH = -0.1
const MAX_PITCH = 1.2
const START_PITCH = 0.3

const DRAG_SENSITIVITY = 0.005
const TOUCH_SENSITIVITY = 0.007
const ZOOM_SENSITIVITY = 0.01
const PINCH_SENSITIVITY = 0.04

// Higher = snappier. Framerate-independent via the pow() smoothing below.
const POSITION_SMOOTHING = 5
const LOOK_SMOOTHING = 9

/** Samples along the camera boom when checking for obstacles. */
const BOOM_SAMPLES = 14
const MIN_BOOM = 0.8

/** Mouse buttons that orbit the camera. Stages free the left button for grabbing. */
const DEFAULT_DRAG_BUTTONS = [0, 2]

const _desired = new Vector3()
const _target = new Vector3()
const _dir = new Vector3()
const _origin = new Vector3()

/**
 * Third-person orbit camera that trails the player's rigid body.
 *
 * The boom from the player to the camera is sampled against the lobby colliders, so
 * the camera pulls in front of stalls, boards and the fountain instead of clipping
 * through them.
 *
 * Mouse: left or right drag orbits, wheel zooms.
 * Touch: one finger on the 3D view orbits, two fingers pinch-zoom. (The joystick
 * and buttons are HTML on top of the canvas, so their touches never reach here.)
 *
 * @param {{ bodyRef: React.MutableRefObject<any> }} props
 */
export function FollowCamera({ bodyRef, world = LOBBY_WORLD, dragButtons = DEFAULT_DRAG_BUTTONS, initialYaw = 0 }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  // Spherical offset from the player. A ref, not state: pointer events write to it.
  const orbit = useRef({ yaw: initialYaw, pitch: START_PITCH, distance: START_DISTANCE })
  const lookAt = useRef(new Vector3())
  const initialised = useRef(false)

  useEffect(() => registerDebug('orbit', orbit), [])

  useEffect(() => {
    const el = gl.domElement
    if (!el) return undefined

    /** pointerId -> { x, y } for every finger / button currently dragging. */
    const pointers = new Map()
    let pinchDistance = 0

    const pinchSpan = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && !dragButtons.includes(e.button)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture?.(e.pointerId)
      if (pointers.size === 2) pinchDistance = pinchSpan()
    }

    const onPointerMove = (e) => {
      const last = pointers.get(e.pointerId)
      if (!last) return
      const o = orbit.current

      if (pointers.size >= 2) {
        last.x = e.clientX
        last.y = e.clientY
        const span = pinchSpan()
        o.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, o.distance - (span - pinchDistance) * PINCH_SENSITIVITY))
        pinchDistance = span
        return
      }

      const sensitivity = (e.pointerType === 'touch' ? TOUCH_SENSITIVITY : DRAG_SENSITIVITY) * input.lookScale
      o.yaw -= (e.clientX - last.x) * sensitivity
      o.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, o.pitch + (e.clientY - last.y) * sensitivity))
      last.x = e.clientX
      last.y = e.clientY
    }

    const endDrag = (e) => {
      if (!pointers.delete(e.pointerId)) return
      el.releasePointerCapture?.(e.pointerId)
      if (pointers.size === 2) pinchDistance = pinchSpan()
    }

    const onWheel = (e) => {
      e.preventDefault()
      const o = orbit.current
      o.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, o.distance + e.deltaY * ZOOM_SENSITIVITY))
    }

    const onContextMenu = (e) => e.preventDefault()

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl, dragButtons])

  useFrame((_state, delta) => {
    const body = bodyRef.current
    if (!body) return

    const pos = body.translation()
    _target.set(pos.x, pos.y, pos.z)

    // Spherical -> cartesian. yaw 0 puts the camera behind the player on +Z.
    const { yaw, pitch, distance } = orbit.current
    const horizontal = Math.cos(pitch) * distance
    _desired.set(
      _target.x + Math.sin(yaw) * horizontal,
      Math.max(0.6, _target.y + Math.sin(pitch) * distance + LOOK_HEIGHT),
      _target.z + Math.cos(yaw) * horizontal,
    )

    // Camera collision: shorten the boom if something solid is in the way.
    _origin.set(_target.x, _target.y + LOOK_HEIGHT, _target.z)
    _dir.subVectors(_desired, _origin)
    const boom = _dir.length()
    _dir.divideScalar(boom)
    let blocked = false
    for (let i = 1; i <= BOOM_SAMPLES; i += 1) {
      const t = (i / BOOM_SAMPLES) * boom
      if (world.isBlocked(_origin.x + _dir.x * t, _origin.y + _dir.y * t, _origin.z + _dir.z * t)) {
        const d = Math.max(MIN_BOOM, t - boom / BOOM_SAMPLES)
        _desired.copy(_origin).addScaledVector(_dir, d)
        blocked = true
        break
      }
    }

    if (!initialised.current) {
      camera.position.copy(_desired)
      lookAt.current.copy(_target).setY(_target.y + LOOK_HEIGHT)
      initialised.current = true
    }

    // Snap in fast when blocked so the wall is never seen from the inside.
    const smoothing = blocked ? POSITION_SMOOTHING * 4 : POSITION_SMOOTHING
    camera.position.lerp(_desired, 1 - Math.pow(0.001, delta * (smoothing / 10)))
    _target.y += LOOK_HEIGHT
    lookAt.current.lerp(_target, 1 - Math.pow(0.001, delta * (LOOK_SMOOTHING / 10)))
    camera.lookAt(lookAt.current)
  })

  return null
}

export default FollowCamera
