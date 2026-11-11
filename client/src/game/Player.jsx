import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { MeshBasicMaterial, PlaneGeometry, Quaternion, SpriteMaterial, Vector3 } from 'three'

import { useBloxity } from '../bloxity/BloxityContext'
import { useChat } from '../net/chat'
import { useGame } from '../state/game'
import { sfx } from '../state/audio'
import { input } from '../state/input'
import { useQuality } from '../state/quality'
import { Kit } from './lib/kit'
import { LOBBY_WORLD } from './lobby/collision'
import { MATERIALS, useDisposable } from './lib/resources'
import { blobShadowTexture, canvasTexture, drawNameTag } from './lib/textures'
import PlayerAvatar from './PlayerAvatar'

// Capsule roughly matching the humanoid.
const CAPSULE_RADIUS = 0.35
const PLAYER_HEIGHT = 1.8
const HALF_HEIGHT = PLAYER_HEIGHT / 2

const MOVE_SPEED = 6
const SPRINT_MULTIPLIER = 1.5
const JUMP_SPEED = 5.2
const GRAVITY = 18
/** Stops one long Space press from re-triggering the moment the player lands. */
const JUMP_COOLDOWN_S = 0.25
/** A press this recent still counts: catches taps shorter than a frame and lets a press
 * just before landing jump on touchdown. */
const JUMP_BUFFER_MS = 150
/** Longest step integrated in one frame, so a hitch can't tunnel through a wall. */
const MAX_STEP_S = 1 / 20
/** Metres walked between footsteps. */
const STRIDE_M = 2.1
/** Landing faster than this (m/s) makes a thud. */
const LAND_SPEED = 4

// Scratch objects, reused each frame so the loop allocates nothing.
const _input = new Vector3()
const _move = new Vector3()
const _camForward = new Vector3()
const _camRight = new Vector3()
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)

/** What the ground sounds like: coins in the pool, stone paths, or the map's own floor. */
function footstepSound(ground, mapId) {
  if (ground > 0.4) return 'step_stone'
  if (ground > 0) return 'step_coins'
  if (mapId === 'frost') return 'step_snow'
  if (mapId === 'grotto') return 'step_grass'
  return 'step_stone'
}

/**
 * Kinematic character state with a Rapier-like surface (translation / linvel /
 * setTranslation / setLinvel), so the camera, lights and zone watcher don't care what
 * moves the player. translation() is the capsule centre and returns the same object
 * every call: no per-frame allocations.
 */
function createBody([x, y, z]) {
  const pos = { x, y, z }
  const vel = { x: 0, y: 0, z: 0 }
  return {
    pos,
    vel,
    grounded: false,
    /** Facing (radians about +Y, 0 = +Z) and ground speed, for multiplayer. */
    yaw: 0,
    speed: 0,
    translation: () => pos,
    linvel: () => vel,
    setTranslation(p) {
      pos.x = p.x
      pos.y = p.y
      pos.z = p.z
    },
    setLinvel(v) {
      vel.x = v.x
      vel.y = v.y
      vel.z = v.z
    },
  }
}

/** Shown if the Bloxity avatar can't load (offline, CDN down). */
function buildFallbackAvatar() {
  const k = new Kit(90)
  k.box(0.42, 0.8, 0.32, '#2f3e5c', { p: [-0.13, 0.4, 0] })
  k.box(0.42, 0.8, 0.32, '#2f3e5c', { p: [0.13, 0.4, 0] })
  k.box(0.6, 0.62, 0.36, '#e0a53a', { p: [0, 1.11, 0] })
  k.box(0.2, 0.6, 0.24, '#f0c39a', { p: [-0.42, 1.12, 0] })
  k.box(0.2, 0.6, 0.24, '#f0c39a', { p: [0.42, 1.12, 0] })
  k.box(0.46, 0.42, 0.42, '#f0c39a', { p: [0, 1.6, 0] })
  k.box(0.06, 0.08, 0.02, '#2b1d14', { p: [-0.1, 1.64, 0.22] })
  k.box(0.06, 0.08, 0.02, '#2b1d14', { p: [0.1, 1.64, 0.22] })
  return k.build()
}

function FallbackAvatar({ onReady }) {
  const geometry = useDisposable(buildFallbackAvatar, [])
  useEffect(() => {
    onReady?.()
  }, [onReady])
  return <mesh geometry={geometry} material={MATERIALS.scenery} castShadow />
}

export class AvatarBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.warn('[avatar] Bloxity avatar failed to load; using fallback', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function NameTag() {
  const { identity } = useBloxity()
  const texSize = useQuality((s) => s.settings.texSize)
  const name = identity?.displayName || identity?.username || 'Guest'
  const size = Math.min(512, texSize)

  const tag = useDisposable(() => {
    const map = canvasTexture(size, size / 4, () => {})
    return { map, material: new SpriteMaterial({ map, transparent: true, depthWrite: false }) }
  }, [size])

  // Our latest Boxity chat message replaces the title for a few seconds.
  const bubble = useChat((s) => s.local)
  useEffect(() => {
    const live = bubble && bubble.until > Date.now()
    tag.map.redraw((ctx, w, h) => drawNameTag(ctx, w, h, { name, title: live ? bubble.text : 'Coin Rookie' }))
    if (!live) return undefined
    const id = setTimeout(() => tag.map.redraw((ctx, w, h) => drawNameTag(ctx, w, h, { name, title: 'Coin Rookie' })), bubble.until - Date.now())
    return () => clearTimeout(id)
  }, [tag, name, bubble])

  return <sprite material={tag.material} position={[0, PLAYER_HEIGHT / 2 + 0.75, 0]} scale={[2.6, 0.65, 1]} />
}

/** Fake contact shadow (LOW has no realtime shadows). Stays on the ground mid-jump. */
function BlobShadow({ blobRef }) {
  const blob = useDisposable(() => {
    const map = blobShadowTexture()
    const geometry = new PlaneGeometry(1.3, 1.3)
    geometry.rotateX(-Math.PI / 2)
    return { map, geometry, material: new MeshBasicMaterial({ map, transparent: true, depthWrite: false }) }
  }, [])
  return (
    <mesh
      ref={blobRef}
      geometry={blob.geometry}
      material={blob.material}
      position={[0, -HALF_HEIGHT + 0.04, 0]}
      renderOrder={1}
    />
  )
}

/**
 * The player: a kinematic capsule (see lobby/collision.js) carrying the Bloxity avatar.
 * Input comes from the shared `input` object (keyboard + touch joystick). Everything
 * per-frame is mutation of refs and scratch objects; nothing re-renders.
 *
 * @param {{ position?: [number,number,number], onAvatarReady?: () => void,
 *           bodyRef?: React.MutableRefObject<any>,
 *           world?: { resolve(pos, radius): void, groundAt(x, z): number } }} props
 *   `world` is the map's collision: push-out and floor height (defaults to the lobby).
 */
export function Player({
  position = [0, 3, 0],
  onAvatarReady,
  bodyRef: externalBodyRef,
  world = LOBBY_WORLD,
  firstPerson = false,
}) {
  const localBodyRef = useRef(null)
  const bodyRef = externalBodyRef || localBodyRef
  const rootRef = useRef(null)
  const visualRef = useRef(null)
  const blobRef = useRef(null)
  const shadows = useQuality((s) => s.settings.shadows)
  // The Boxity avatar mounts only once the lobby is playable, so its download and
  // material compile never delay the first frames; first person never shows it at all.
  const lobbyReady = useGame((s) => s.lobbyReady)
  const showAvatar = lobbyReady && !firstPerson

  // Created once; the spawn point only matters on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const body = useMemo(() => createBody(position), [])
  useLayoutEffect(() => {
    bodyRef.current = body
    return () => {
      if (bodyRef.current === body) bodyRef.current = null
    }
  }, [body, bodyRef])

  const jumpCooldown = useRef(0)
  /** Motion state handed to the avatar so it can pose itself. Written every frame. */
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: MOVE_SPEED })

  useFrame((state, delta) => {
    const dt = Math.min(delta, MAX_STEP_S)
    const { pos, vel } = body
    jumpCooldown.current = Math.max(0, jumpCooldown.current - dt)

    // Keyboard and joystick combined; the joystick is analog so it can walk slowly.
    _input.set(
      (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.joyX,
      0,
      (input.backward ? 1 : 0) - (input.forward ? 1 : 0) - input.joyY,
    )
    const amount = Math.min(1, _input.length())

    const maxSpeed =
      MOVE_SPEED *
      (world.speedBoost ? world.speedBoost() : 1) *
      (input.sprint ? SPRINT_MULTIPLIER : 1)

    if (amount > 0.05) {
      _input.normalize()
      // W always means "away from the camera".
      state.camera.getWorldDirection(_camForward)
      _camForward.y = 0
      _camForward.normalize()
      _camRight.crossVectors(_camForward, _up).normalize()
      _move
        .set(0, 0, 0)
        .addScaledVector(_camForward, -_input.z)
        .addScaledVector(_camRight, _input.x)
        .normalize()
      const speed = maxSpeed * amount
      vel.x = _move.x * speed
      vel.z = _move.z * speed
      body.yaw = Math.atan2(_move.x, _move.z)
      if (visualRef.current) {
        _targetQuat.setFromAxisAngle(_up, body.yaw)
        visualRef.current.quaternion.slerp(_targetQuat, 1 - Math.pow(0.001, dt))
      }
    } else {
      // Quick, framerate-independent stop.
      const damp = Math.pow(0.8, dt * 60)
      vel.x *= damp
      vel.z *= damp
    }

    const wantsJump =
      input.jump || input.touchJump || performance.now() - input.jumpPressedAt < JUMP_BUFFER_MS
    if (wantsJump && jumpCooldown.current === 0 && body.grounded) {
      input.jumpPressedAt = -Infinity
      vel.y = JUMP_SPEED
      body.grounded = false
      jumpCooldown.current = JUMP_COOLDOWN_S
      sfx('jump')
    }

    vel.y -= GRAVITY * dt
    pos.x += vel.x * dt
    pos.y += vel.y * dt
    pos.z += vel.z * dt
    world.resolve(pos, CAPSULE_RADIUS)
    const ground = world.groundAt(pos.x, pos.z)
    const floor = ground + HALF_HEIGHT
    const wasGrounded = body.grounded
    if (pos.y <= floor) {
      pos.y = floor
      if (!wasGrounded && vel.y < -LAND_SPEED) sfx('land')
      if (vel.y < 0) vel.y = 0
      body.grounded = true
    } else {
      body.grounded = false
    }

    // Footsteps: one per stride walked.
    const walked = Math.hypot(vel.x, vel.z)
    if (body.grounded && walked > 0.8) {
      motionRef.current.stride = (motionRef.current.stride || 0) + walked * dt
      if (motionRef.current.stride > STRIDE_M) {
        motionRef.current.stride = 0
        sfx(footstepSound(ground, useGame.getState().modeId))
      }
    }

    rootRef.current?.position.set(pos.x, pos.y, pos.z)
    if (blobRef.current) blobRef.current.position.y = 0.04 - pos.y

    const motion = motionRef.current
    motion.time += dt
    motion.speed = Math.hypot(vel.x, vel.z)
    // The victory dance runs until you move.
    motion.dance = Date.now() < useGame.getState().celebrateUntil && motion.speed < 0.5
    body.speed = motion.speed
    if (firstPerson) {
      state.camera.getWorldDirection(_camForward)
      body.yaw = Math.atan2(_camForward.x, _camForward.z)
    }
    motion.grounded = body.grounded
    motion.maxSpeed = maxSpeed
  })

  return (
    <group ref={rootRef} position={position} name="player">
      {/* Avatar origin is at the feet; the body origin is the capsule centre.
          In first person the body is invisible (the camera sits in its head). */}
      <group ref={visualRef} position={[0, -HALF_HEIGHT, 0]} visible={!firstPerson}>
        {showAvatar ? (
          <AvatarBoundary fallback={<FallbackAvatar onReady={onAvatarReady} />}>
            {/* Blocky stand-in while the Bloxity avatar downloads, so it never holds up play. */}
            <Suspense fallback={<FallbackAvatar />}>
              <PlayerAvatar onReady={onAvatarReady} targetHeight={PLAYER_HEIGHT} motionRef={motionRef} />
            </Suspense>
          </AvatarBoundary>
        ) : (
          <FallbackAvatar onReady={onAvatarReady} />
        )}
      </group>
      {!firstPerson && <NameTag />}
      {!shadows && !firstPerson && <BlobShadow blobRef={blobRef} />}
    </group>
  )
}

export { PLAYER_HEIGHT }
export default Player
