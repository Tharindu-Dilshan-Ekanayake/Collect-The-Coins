import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Box3, DoubleSide, Matrix4, MeshStandardMaterial, Vector3 } from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import {
  accessorySlots,
  accessoryUrls,
  assetUrls,
  baseBodyUrl,
  isRealId,
  PART_SLOTS,
  skinIdOrDefault,
  skinTextureUrl,
} from '../bloxity/avatarAssets'
import { loadAccessoryTexture, loadCharacterGLB, loadOBJ, loadPartGLB, loadTexture } from '../bloxity/avatarLoader'
import { useBloxity } from '../bloxity/BloxityContext'
import { getEmoteClip } from '../bloxity/emotes'
import { getSDK, safeCall } from '../bloxity/sdk'
import { DEFAULT_PROPORTIONS, useBloxityStore } from '../bloxity/store'
import {
  accessoryLocal,
  animateRig,
  applyEmote,
  applyPart,
  applyProportions,
  applySkin,
  attachAccessory,
  attachSlotAccessory,
  captureRestPose,
  collectRig,
  followAccessories,
  followBone,
} from './avatarRig'

/** Emotes stop when the player moves faster than this (world units / s). */
const EMOTE_STOP_SPEED = 0.6
const EMOTE_BLEND_S = 0.1

/**
 * Keeps the avatar breathing when it is rendered outside the game (a menu preview,
 * say) with no physics body feeding it motion.
 */
const _idleMotion = { time: 0, speed: 0, grounded: true, maxSpeed: 6 }
function fallbackMotion(delta) {
  _idleMotion.time += delta
  return _idleMotion
}

/** Model-space placements of head/torso items on a custom character (spec values). */
const HAT_PLACEMENT = [0, 5.6, 0]
const BACK_PLACEMENT = [0, 4.2, 0]
const translation = ([x, y, z]) => new Matrix4().makeTranslation(x, y, z)

/** scale(rig.anchors[bone]) for a custom character, identity when not given. */
function anchorScale(info, bone) {
  const a = info?.rig?.anchors?.[bone]
  if (typeof a === 'number' && Number.isFinite(a)) return new Matrix4().makeScale(a, a, a)
  if (Array.isArray(a) && a.length >= 3) return new Matrix4().makeScale(a[0], a[1], a[2])
  if (a && typeof a === 'object' && Number.isFinite(a.x)) return new Matrix4().makeScale(a.x, a.y ?? a.x, a.z ?? a.x)
  return new Matrix4()
}

/** The SDK's characterAccessoryMatrix (16 column-major numbers) as a Matrix4, or null. */
function characterMatrix(info, bone) {
  const avatar = getSDK()?.avatar
  if (!avatar?.characterAccessoryMatrix) return null
  const m = safeCall(avatar.characterAccessoryMatrix.bind(avatar), info, bone)
  return Array.isArray(m) && m.length === 16 ? new Matrix4().fromArray(m) : null
}

/**
 * A player's own uploaded character (equipped.characterId), loaded and ready, or null:
 * no character, still loading, or it failed (then the regular avatar is drawn).
 */
function useCustomCharacter(characterId) {
  const [state, setState] = useState(null)
  useEffect(() => {
    if (!isRealId(characterId)) return undefined
    let cancelled = false
    const avatar = getSDK()?.avatar
    const request = avatar?.getCharacterFor
      ? safeCall(avatar.getCharacterFor.bind(avatar), { characterId })
      : avatar?.getCharacter
        ? safeCall(avatar.getCharacter.bind(avatar))
        : null
    Promise.resolve(request)
      .then(async (info) => {
        if (!info?.glbUrl) return null
        const [scene, texture] = await Promise.all([
          loadCharacterGLB(info.glbUrl),
          info.textureUrl ? loadTexture(info.textureUrl) : null,
        ])
        return scene ? { info, scene, texture } : null
      })
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setState({ id: characterId, result })
      })
    return () => {
      cancelled = true
    }
  }, [characterId])
  return state && state.id === characterId ? state.result : null
}

/** Gives an accessory its texture (the material is per attach and disposed with it). */
function dress(object, texture) {
  if (!texture) return
  object.traverse((child) => {
    if (child.isMesh) {
      child.material = new MeshStandardMaterial({ map: texture, alphaTest: 0.5, side: DoubleSide })
    }
  })
}

function loadAccessory(urls) {
  return Promise.all([loadOBJ(urls.mesh), loadAccessoryTexture(urls.texture)]).then(([object, texture]) => ({
    object,
    texture,
  }))
}

/**
 * The player's own Bloxity avatar, assembled at runtime: the WHOLE look.
 *
 * `player.glb` is the base humanoid rig: six skinned meshes (head, torso, two arms,
 * two legs) sharing one skeleton. Assembly means, per equipped slot:
 *   - body parts       -> swap the matching mesh's geometry
 *   - hat / back       -> attach an OBJ to the Neck1 / Spine2 bone
 *   - accessory slots  -> every slot from avatar.getAccessorySlots() (hair, mask,
 *                         neck, chest, waist, hand, shoes, and any added later):
 *                         local = restInverse(bone) * translate(origin), plus a mirrored
 *                         copy on mirrorBone; hands/shoes follow position+rotation only
 *   - skin             -> one texture (pants, shirt, face drawn on) on every mesh
 *   - characterId      -> the player's own uploaded GLB replaces player.glb (no skin,
 *                         parts or proportions); accessories fitted to it
 *
 * Any slot that is unequipped or 404s leaves the base body's own part in place. The
 * whole thing re-assembles when `onAvatarChanged` / `onProportionsChanged` fire, so
 * changing cosmetics in the Bloxity portal updates the character live. Boxity emotes
 * play on top of the procedural animation.
 *
 * @param {{ onReady?: () => void, targetHeight?: number }} props
 *   `targetHeight` is the world-space height to fit the avatar into, in the game's
 *   own units. Bloxity authors the rig ~6.4 units tall with the feet at y=0, which is
 *   far bigger than a metric-scale physics capsule, so the model is measured and
 *   rescaled rather than trusted at native size.
 */
export const PlayerAvatar = forwardRef(function PlayerAvatar(
  { onReady, targetHeight = 1.8, motionRef, handRef, backRef, equipped: equippedProp, remote = false, ...props },
  ref,
) {
  const bloxity = useBloxity()
  // Another player: their replicated ids, no loading-screen calls, no proportions or emotes.
  const equipped = remote ? equippedProp : bloxity.avatar
  const game = bloxity.game
  const { scene: baseScene } = useGLTF(baseBodyUrl())
  const custom = useCustomCharacter(equipped?.characterId)
  const [assembled, setAssembled] = useState(false)
  const fitRef = useRef(null)
  /** Holds position+rotation-only accessories (hands, shoes), beside the character. */
  const holderRef = useRef(null)
  const followersRef = useRef([])
  const emoteRef = useRef({ stopped: -1 })

  // The GLTF cache hands back one shared scene. Clone via SkeletonUtils so this
  // instance gets an independent, still-working skeleton.
  const sourceScene = custom?.scene || baseScene
  const character = useMemo(() => cloneSkeleton(sourceScene), [sourceScene])

  // Rig lookup tables (bones, part meshes, pristine geometries, rest pose) built once
  // per clone, before anything poses it.
  const rig = useMemo(() => {
    const collected = collectRig(character)
    collected.custom = custom

    // Every mesh gets its own material instance so a skin swap here can't leak into
    // another avatar (or into the cached GLB). A custom character keeps its texture.
    character.traverse((mesh) => {
      if (!mesh.isMesh || (!custom && !mesh.isSkinnedMesh)) return
      mesh.material = new MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 1,
        map: custom ? custom.texture || mesh.material?.map || null : null,
      })
    })

    if (!collected.skeleton) {
      console.warn('[bloxity] avatar has no skeleton - it will not deform')
    }
    return collected
  }, [character, custom])

  // Custom characters place hands/shoes with player.glb's rest pose, not their own.
  const baseRest = useMemo(() => (custom ? captureRestPose(baseScene).restInverse : null), [custom, baseScene])

  // Free what this mount created: the per-mesh materials, the cloned skeletons (each
  // owns a bone texture) and the geometry clones. The cached GLTFs are shared and stay
  // alive for the next mount.
  useEffect(
    () => () => {
      const skeletons = new Set()
      character.traverse((mesh) => {
        if (!mesh.isMesh) return
        mesh.material?.dispose()
        if (mesh.skeleton) skeletons.add(mesh.skeleton)
      })
      skeletons.forEach((skeleton) => skeleton.dispose())
      Object.values(rig.originalGeometries).forEach((g) => g.dispose())
      rig.ownedGeometries.forEach((g) => g.dispose())
    },
    [rig, character],
  )

  // Measured once from player.glb's bind pose (custom characters use the same scale:
  // both are 6.4-unit rigs with the feet at y 0).
  const fit = useMemo(() => {
    baseScene.updateMatrixWorld(true)
    const box = new Box3().setFromObject(baseScene)
    const size = box.getSize(new Vector3())
    if (!Number.isFinite(size.y) || size.y <= 0) return { scale: 1, footOffset: 0 }
    const scale = targetHeight / size.y
    // The rig's feet sit at its bbox minimum; drop the group so they land on y=0
    // of the parent (which Player positions at the bottom of the capsule).
    return { scale, footOffset: -box.min.y * scale }
  }, [baseScene, targetHeight])

  // --- Assemble equipped cosmetics --------------------------------------------
  useEffect(() => {
    let cancelled = false
    // Everything attached this pass, removed and disposed when the outfit changes.
    const attached = []
    const followers = []
    const holder = holderRef.current
    const info = rig.custom?.info || null

    if (!remote) game.loadingStep('Loading avatar…')

    const jobs = []

    if (!info) {
      // Skin always loads - "0" is the fallback, since the base body has no baked map.
      // With a face, shirt or pants worn it's the composited version; if that can't be
      // fetched, the bare skin is better than an untextured body.
      const skinUrl = skinTextureUrl(equipped)
      const plainSkinUrl = assetUrls.skinTexture(skinIdOrDefault(equipped?.skinId))
      jobs.push(
        loadTexture(skinUrl)
          .then((texture) => texture || (skinUrl !== plainSkinUrl ? loadTexture(plainSkinUrl) : null))
          .then((texture) => ({ kind: 'skin', texture })),
      )

      // Body parts: fetch only real ids; a missing slot resets to the base geometry.
      for (const [slot, cfg] of Object.entries(PART_SLOTS)) {
        const id = equipped?.[cfg.idKey]
        if (!isRealId(id)) {
          jobs.push(Promise.resolve({ kind: 'part', slot, scene: null }))
          continue
        }
        jobs.push(loadPartGLB(assetUrls.part(slot, id)).then((scene) => ({ kind: 'part', slot, scene })))
      }
    }

    // Hat and back.
    for (const [kind, field] of [
      ['hat', 'hatId'],
      ['back', 'backId'],
    ]) {
      const urls = accessoryUrls(field, equipped?.[field])
      if (urls) jobs.push(loadAccessory(urls).then((r) => ({ kind: 'accessory', accessory: kind, ...r })))
    }

    // Every other bone-attached slot, from the SDK's own list.
    for (const slot of accessorySlots()) {
      const urls = accessoryUrls(slot.field, equipped?.[slot.field], slot)
      if (urls) jobs.push(loadAccessory(urls).then((r) => ({ kind: 'slot', slot, ...r })))
    }

    /** Custom character: head/torso items through characterAccessoryMatrix. */
    const fittedLocal = (bone, placement, standard) => {
      const m = characterMatrix(info, bone)
      if (m) return m.multiply(translation(placement))
      return standard ? anchorScale(info, bone).multiply(standard) : null
    }

    /** Custom character slot items: fitted head/torso items, anchored hands/shoes. */
    const customSlotLocal = (slot) => (bone, mirrored) => {
      const standard = accessoryLocal(baseRest, bone, slot.origin, mirrored)
      if (slot.inheritScale === false) return standard ? anchorScale(info, bone).multiply(standard) : null
      return fittedLocal(bone, slot.origin, standard)
    }

    const attachFixed = (object, boneName, local) => {
      const bone = rig.bonesByName?.[boneName]
      if (!bone || !local) return false
      object.matrixAutoUpdate = false
      object.matrix.copy(local)
      object.traverse((child) => {
        if (child.isMesh) child.castShadow = true
      })
      bone.add(object)
      return true
    }

    Promise.all(jobs)
      .then((results) => {
        if (cancelled) return

        for (const result of results) {
          // One bad slot must not take the rest of the character down.
          try {
            if (result.kind === 'skin') {
              applySkin(rig, result.texture)
            } else if (result.kind === 'part') {
              applyPart(rig, result.slot, result.scene)
            } else if (result.kind === 'accessory' && result.object) {
              dress(result.object, result.texture)
              if (info) {
                const hat = result.accessory === 'hat'
                const bone = hat ? 'Neck1' : 'Spine2'
                const local = fittedLocal(bone, hat ? HAT_PLACEMENT : BACK_PLACEMENT, hat ? translation([0, 0.8, 0]) : new Matrix4())
                if (attachFixed(result.object, bone, local)) attached.push(result.object)
              } else {
                const added = attachAccessory(rig, result.accessory, result.object)
                if (added) attached.push(added)
              }
            } else if (result.kind === 'slot' && result.object) {
              dress(result.object, result.texture)
              const { slot } = result
              const localFor = info ? customSlotLocal(slot) : undefined
              for (const entry of attachSlotAccessory(rig, slot, result.object, holder, localFor)) {
                attached.push(entry.object)
                if (entry.followOnly) followers.push(entry)
              }
            }
          } catch (err) {
            console.warn(`[bloxity] failed to apply ${result.kind}`, err)
          }
        }

        followersRef.current = followers
        setAssembled(true)
      })
      .catch((err) => {
        console.warn('[bloxity] avatar assembly failed; showing base body', err)
        if (!cancelled) setAssembled(true)
      })

    return () => {
      cancelled = true
      followersRef.current = []
      for (const object of attached) {
        object.parent?.remove(object)
        object.traverse((child) => {
          child.geometry?.dispose()
          // Accessory materials are made per attach; their textures are cached and shared.
          if (child.isMesh && child.material?.isMeshStandardMaterial) child.material.dispose()
        })
      }
    }
  }, [rig, equipped, game, baseRest, remote])

  // --- Proportions, animation, emotes -----------------------------------------
  // Applied per frame rather than in an effect: every bone is reset to its rest pose
  // and re-scaled each pass, which keeps it idempotent and survives anything else
  // that touches the skeleton. Read from the store: no re-render needed.
  useFrame((_state, delta) => {
    try {
      const motion = motionRef?.current ?? fallbackMotion(delta)
      // Order matters: proportions reset every bone to its rest pose, the animation
      // rotates on top of that clean base, then an emote blends over both. Custom
      // characters take no proportions (the defaults just reset the pose).
      const store = useBloxityStore.getState()
      applyProportions(rig, rig.custom || remote ? DEFAULT_PROPORTIONS : store.proportions || DEFAULT_PROPORTIONS)
      animateRig(rig, motion)

      // Reading the store here is fine; it's only ever written from events/intervals.
      const emote = remote ? null : store.emote
      if (emote && emoteRef.current.stopped !== emote.at) {
        const clip = getEmoteClip(emote.id)
        const t = (performance.now() - emote.at) / 1000
        const moving = motion.speed > EMOTE_STOP_SPEED || motion.grounded === false
        if (!clip || moving || (!clip.loop && t > clip.len)) emoteRef.current.stopped = emote.at
        else applyEmote(rig, clip, clip.loop ? t % clip.len : t, Math.min(1, t / EMOTE_BLEND_S))
      }

      followAccessories(followersRef.current, holderRef.current, fitRef.current)
      // Another player's tool: held in the right hand, and (a vac tank) worn on the back.
      const held = handRef?.current ? followBone(rig, handRef.current, 'ArmR2_leaf') : false
      if (backRef?.current) followBone(rig, backRef.current, 'Spine2', held)
    } catch {
      // A malformed payload must not kill the render loop.
    }
  })

  // Clears a finished or interrupted emote from the store (never from useFrame).
  useEffect(() => {
    if (remote) return undefined
    const id = setInterval(() => {
      const { emote, setEmote } = useBloxityStore.getState()
      if (emote && emoteRef.current.stopped === emote.at) setEmote(null)
    }, 150)
    return () => clearInterval(id)
  }, [remote])

  // Signal readiness only once the model is actually standing there.
  useEffect(() => {
    if (assembled) onReady?.()
  }, [assembled, onReady])

  return (
    <group ref={ref} {...props}>
      {/* Fit scale lives on this wrapper, not on `character` - applyProportions
          overwrites the character's own scale every frame. */}
      <group ref={fitRef} scale={fit.scale} position={[0, fit.footOffset, 0]}>
        <primitive object={character} />
        <group ref={holderRef} />
      </group>
    </group>
  )
})

useGLTF.preload(baseBodyUrl())

export default PlayerAvatar
