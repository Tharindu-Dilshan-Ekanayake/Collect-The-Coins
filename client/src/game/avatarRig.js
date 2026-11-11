import { Euler, Matrix4, NearestFilter, Quaternion, SRGBColorSpace, Vector3 } from 'three'

import { BACK_BONE, HAT_BONE, NECK_OFFSET_BONE, PART_SLOTS } from '../bloxity/avatarAssets'

/**
 * Rig manipulation for the base `player.glb` character.
 *
 * The rig's real structure (confirmed by reading player.glb directly):
 *   character
 *     - default_arm_L / default_arm_R / default_head
 *     - default_leg_L / default_leg_R / default_torso   (6 SkinnedMeshes, 1 skeleton)
 *     - Rig1
 *         - Spine1 > Spine2 > { ArmL_Offset > ArmL1 > ArmL2,
 *                               ArmR_Offset > ArmR1 > ArmR2,
 *                               Neck_Offset > Neck1 }
 *         - LegL_Offset > LegL1 > LegL2, LegR_Offset > LegR1 > LegR2
 *
 * Two consequences drive everything below:
 *  1. Body parts are NOT attached to bones. Each is a separate SkinnedMesh sharing one
 *     skeleton, so equipping a part means swapping that mesh's geometry (remapping
 *     skin indices into the base skeleton's bone order first).
 *  2. Accessories DO attach to bones: hats to `Neck1`, back items to `Spine2`, and the
 *     SDK's accessory slots (hair, mask, neck, chest, waist, hand, shoes, …) to the bone
 *     each slot names, placed with the rest-pose inverse captured at load.
 *
 * player.glb ships no animation clips, so the character is posed, not animated.
 */

/**
 * Walks the loaded rig and collects everything later operations need.
 *
 * @param {import('three').Object3D} root
 */
export function collectRig(root) {
  const rig = {
    root,
    skeleton: null,
    /** slot -> SkinnedMesh */
    partMeshes: {},
    /** slot -> the pristine geometry to restore on unequip */
    originalGeometries: {},
    /** bone name -> { bone, origPos, origQuat, origScale } */
    bones: {},
    hatBone: null,
    backBone: null,
    neckOffsetBindY: 0,
    skinnedMeshes: [],
    /** Geometry clones made by applyPart, disposed with the avatar. */
    ownedGeometries: new Set(),
    /** Rest Y of the character root, so the run-cycle bob can return to it. */
    rootRestY: root.position.y,
  }

  const meshBySlot = new Map(
    Object.entries(PART_SLOTS).map(([slot, cfg]) => [cfg.mesh.toLowerCase(), slot]),
  )

  // Rest pose of every bone in model space, captured before any animation or
  // proportions touch the rig. Accessories are authored in this pose:
  //   local = restInverse(bone) * translate(origin)
  // (skeleton.boneInverses are NOT used: the leaf bones' inverse binds in player.glb
  // are 90 degrees off their rest pose.)
  const rest = captureRestPose(root)
  rig.restInverse = rest.restInverse
  /** Every bone by name, including the *_leaf bones that don't skin anything. */
  rig.bonesByName = rest.bonesByName

  root.traverse((node) => {
    if (node.isSkinnedMesh) {
      node.castShadow = true
      node.receiveShadow = true
      rig.skinnedMeshes.push(node)
      if (!rig.skeleton) rig.skeleton = node.skeleton

      const slot = meshBySlot.get((node.name || '').toLowerCase())
      if (slot) {
        rig.partMeshes[slot] = node
        rig.originalGeometries[slot] = node.geometry.clone()
      }
    } else if (node.isMesh) {
      node.castShadow = true
      node.receiveShadow = true
    }
  })

  const skeleton = rig.skeleton
  if (skeleton) {
    for (const bone of skeleton.bones) {
      // Proportions are re-applied every frame from these rest values.
      bone.matrixAutoUpdate = true
      rig.bones[bone.name] = {
        bone,
        origPos: bone.position.clone(),
        origQuat: bone.quaternion.clone(),
        origScale: bone.scale.clone(),
      }
    }

    // Bone local axes are NOT world-aligned in this rig: a limb bone's local X
    // points along world -Z and its local Z along world -X, so rotating a leg about
    // its local X swings it sideways instead of forward/back. The offsets differ per
    // bone (Spine1 is identity, ArmL2 is off by ~14 degrees), so rather than hardcode
    // an axis, record for each bone the local-space axis matching each character-space
    // axis and animate about those.
    root.updateMatrixWorld(true)
    const rootQuat = new Quaternion()
    root.getWorldQuaternion(rootQuat)
    const rootQuatInv = rootQuat.invert()
    const boneWorld = new Quaternion()

    for (const bone of skeleton.bones) {
      const entry = rig.bones[bone.name]
      if (!entry) continue
      bone.getWorldQuaternion(boneWorld)
      // Bone orientation relative to the character, then inverted: this maps a
      // character-space axis into the bone's own local frame.
      const relInv = rootQuatInv.clone().multiply(boneWorld).invert()
      /** Local axis to rotate about for forward/back swing. */
      entry.axisX = new Vector3(1, 0, 0).applyQuaternion(relInv).normalize()
      /** Local axis to rotate about for lateral sway. */
      entry.axisZ = new Vector3(0, 0, 1).applyQuaternion(relInv).normalize()
    }

    rig.hatBone = skeleton.bones.find((b) => b.name === HAT_BONE) || null
    rig.backBone = skeleton.bones.find((b) => b.name === BACK_BONE) || null

    const neckIndex = skeleton.bones.findIndex((b) => b.name === NECK_OFFSET_BONE)
    if (neckIndex >= 0) {
      // elements[13] is the Y translation of the inverted bind matrix.
      rig.neckOffsetBindY = skeleton.boneInverses[neckIndex].clone().invert().elements[13]
    }
  }

  return rig
}

/**
 * Bloxity textures are authored unflipped and pixel-art filtered.
 *
 * They are also sRGB images. A plain TextureLoader leaves them tagged as linear, which
 * makes three skip the sRGB decode and the avatar renders pale and washed out.
 */
export function configureAvatarTexture(texture) {
  if (!texture) return texture
  texture.colorSpace = SRGBColorSpace
  texture.flipY = false
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

/**
 * Applies the skin texture to every skinned mesh of the base body.
 * The base body ships with an empty texture, so this always runs - with skin "0"
 * standing in when nothing is equipped.
 */
export function applySkin(rig, texture) {
  if (!texture) return
  for (const mesh of rig.skinnedMeshes) {
    if (!mesh.material) continue
    mesh.material.map = texture
    mesh.material.needsUpdate = true
  }
}

/**
 * Swaps a body part's geometry onto its base skinned mesh.
 *
 * A part GLB carries its own skeleton whose bone *order* may differ from the base
 * rig's. Its `skinIndex` attribute therefore has to be remapped by bone name, or the
 * limb deforms against the wrong bones.
 *
 * @param {object} rig from `collectRig`
 * @param {string} slot key of PART_SLOTS
 * @param {import('three').Object3D|null} partScene loaded GLB scene, or null to reset
 */
export function applyPart(rig, slot, partScene) {
  const targetMesh = rig.partMeshes[slot]
  if (!targetMesh) return

  // Unequipped / failed download: restore the part baked into player.glb.
  if (!partScene) {
    const original = rig.originalGeometries[slot]
    if (original && targetMesh.geometry !== original) targetMesh.geometry = original
    return
  }

  let skinnedSource = null
  let plainSource = null
  partScene.traverse((node) => {
    if (node.isSkinnedMesh && !skinnedSource) skinnedSource = node
    else if (node.isMesh && !plainSource) plainSource = node
  })

  if (!skinnedSource) {
    // Some parts ship as plain meshes; use them as-is.
    if (plainSource) targetMesh.geometry = plainSource.geometry
    return
  }

  const baseSkeleton = rig.skeleton
  if (!baseSkeleton || !skinnedSource.skeleton) {
    targetMesh.geometry = skinnedSource.geometry
    return
  }

  const geometry = skinnedSource.geometry.clone()
  rig.ownedGeometries?.add(geometry)

  const baseIndexByName = new Map()
  baseSkeleton.bones.forEach((bone, i) => baseIndexByName.set(bone.name, i))

  const remap = new Map()
  skinnedSource.skeleton.bones.forEach((bone, i) => {
    const baseIndex = baseIndexByName.get(bone.name)
    if (baseIndex !== undefined) remap.set(i, baseIndex)
  })

  const skinIndex = geometry.getAttribute('skinIndex')
  if (skinIndex) {
    const array = skinIndex.array
    for (let i = 0; i < array.length; i += 1) {
      const mapped = remap.get(array[i])
      if (mapped !== undefined) array[i] = mapped
    }
    skinIndex.needsUpdate = true
  }

  targetMesh.geometry = geometry
}

/**
 * Attaches a hat or back accessory to its bone.
 * Offsets are the SDK's own: hats sit at y=0.8 on `Neck1`, back items at the origin
 * of `Spine2`.
 */
export function attachAccessory(rig, kind, object) {
  const bone = kind === 'hat' ? rig.hatBone : rig.backBone
  if (!object || !bone) return null

  object.scale.setScalar(1)
  object.position.set(0, kind === 'hat' ? 0.8 : 0, 0)
  object.traverse((child) => {
    if (child.isMesh) child.castShadow = true
  })

  bone.add(object)
  return object
}

/**
 * Applies Bloxity body proportions.
 *
 * Must run every frame: each bone is reset to its rest transform before the
 * multipliers are re-applied, which is what makes the result idempotent and lets
 * proportion changes take effect live.
 *
 * `height`, `armLength`, `headScale` and `neckHeight` are applied exactly as the
 * Bloxity portal does, so the in-game body matches the preview. The remaining three
 * (`shoulderWidth`, `torsoScaleX`, `legOffsetX`) are not implemented in the SDK's
 * preview renderer; they are applied here in the spirit of their names and are the
 * ones to sanity-check against the portal.
 */
export function applyProportions(rig, proportions) {
  const skeleton = rig.skeleton
  if (!skeleton || !proportions) return

  const height = proportions.height ?? 1
  const armLength = proportions.armLength ?? 1
  const headScale = proportions.headScale ?? 1
  const neckHeight = proportions.neckHeight ?? 1
  const shoulderWidth = proportions.shoulderWidth ?? 1
  const torsoScaleX = proportions.torsoScaleX ?? 1
  const legOffsetX = proportions.legOffsetX ?? 1

  // Overall height is a scale on the character root, not on a bone.
  rig.root.scale.set(1, height, 1)

  for (const bone of skeleton.bones) {
    const rest = rig.bones[bone.name]
    if (!rest) continue

    const { origScale, origPos, origQuat } = rest
    bone.position.copy(origPos)
    bone.quaternion.copy(origQuat)
    bone.scale.copy(origScale)

    const name = bone.name

    if (name.startsWith('Arm')) {
      bone.scale.y = origScale.y * armLength
      // Not in the SDK preview: widen the shoulders by pushing the arm roots out.
      if (name === 'ArmL_Offset' || name === 'ArmR_Offset') {
        bone.position.x = origPos.x * shoulderWidth
      }
    } else if (name === NECK_OFFSET_BONE) {
      // Keeps the head sitting on the neck as height/headScale change, then applies
      // neckHeight against the bind-pose offset.
      bone.position.y += (height - headScale) * origPos.y
      bone.position.y += rig.neckOffsetBindY * (neckHeight - 1) * 0.8
    } else if (name === HAT_BONE) {
      // Divided by height so the head stays uniform inside the stretched root.
      bone.scale.set(
        origScale.x * headScale,
        origScale.y * (headScale / height),
        origScale.z * headScale,
      )
    } else if (name === BACK_BONE) {
      // Not in the SDK preview: torso width.
      bone.scale.x = origScale.x * torsoScaleX
    } else if (name === 'LegL_Offset' || name === 'LegR_Offset') {
      // Not in the SDK preview: leg splay, mirrored about the rig centre.
      bone.position.x = origPos.x * legOffsetX
    }
  }
}

/* ---------------------------------------------------------------------------
 * Procedural animation
 *
 * player.glb ships zero animation clips, so a walk/run/jump cycle has to be
 * driven directly on the bones. Rotations are *multiplied onto* whatever
 * applyProportions() just wrote, so this must run immediately after it in the
 * same frame - proportions reset each bone to its rest pose, which is exactly
 * the clean base a pose needs.
 * ------------------------------------------------------------------------- */

const _animQ = new Quaternion()

/**
 * Rotates a bone about one of its precomputed character-space axes.
 * `which` is 'axisX' (forward/back swing) or 'axisZ' (lateral sway).
 */
function rotateBone(rig, name, which, angle) {
  if (!angle) return
  const entry = rig.bones[name]
  const axis = entry?.[which]
  if (!axis) return
  entry.bone.quaternion.multiply(_animQ.setFromAxisAngle(axis, angle))
}

/** Swing a limb forward/back - the plane a walk cycle actually moves in. */
const swing = (rig, name, angle) => rotateBone(rig, name, 'axisX', angle)
/** Sway a limb out to the side. */
const sway = (rig, name, angle) => rotateBone(rig, name, 'axisZ', angle)

/**
 * Poses the rig for the current motion state.
 *
 * @param {object} rig from `collectRig`
 * @param {{ time: number, speed: number, grounded: boolean, maxSpeed: number }} motion
 *   `speed` is horizontal speed in world units/sec; `maxSpeed` is what counts as a
 *   full-amplitude run, so the cycle scales smoothly from a walk to a sprint.
 */
export function animateRig(rig, motion) {
  animateBase(rig, motion)
  if (!rig?.skeleton || !motion || motion.dance) return
  const g = motion.grab
  const s = g >= 0 && g < 1 ? Math.sin(g * Math.PI) : 0
  if (motion.holding) {
    // Holding a tool (other players): a relaxed carry, the hand just in front of the hip
    // with the elbow bent; a grab swings the tool forward through the coins and the body
    // leans into it.
    swing(rig, 'ArmR1', -0.3 - 0.65 * s)
    swing(rig, 'ArmR2', -0.6 + 0.15 * s)
    sway(rig, 'ArmR1', 0.05)
    swing(rig, 'Spine1', -0.22 * s)
    return
  }
  // Bare hands reaching for coins: the right arm swings out and back.
  if (s) {
    swing(rig, 'ArmR1', -1.6 * s)
    swing(rig, 'ArmR2', -0.5 * s)
    swing(rig, 'Spine1', -0.15 * s)
  }
}

function animateBase(rig, motion) {
  if (!rig?.skeleton || !motion) return

  const { time = 0, speed = 0, grounded = true, maxSpeed = 6 } = motion
  const ratio = Math.min(speed / Math.max(maxSpeed, 0.001), 1)

  rig.root.position.y = rig.rootRestY

  // --- Victory dance: arms pumping overhead, bouncing, hips swaying ----------
  if (motion.dance && grounded) {
    const p = time * 8
    const beat = Math.sin(p)
    swing(rig, 'ArmL1', -2.5 + beat * 0.55)
    swing(rig, 'ArmR1', -2.5 - beat * 0.55)
    sway(rig, 'ArmL1', -0.35)
    sway(rig, 'ArmR1', 0.35)
    swing(rig, 'ArmL2', 0.5 + Math.max(0, beat) * 0.5)
    swing(rig, 'ArmR2', 0.5 + Math.max(0, -beat) * 0.5)
    swing(rig, 'LegL1', beat * 0.55)
    swing(rig, 'LegR1', -beat * 0.55)
    swing(rig, 'LegL2', Math.max(0, -beat) * 0.9)
    swing(rig, 'LegR2', Math.max(0, beat) * 0.9)
    swing(rig, 'Spine1', Math.sin(p * 0.5) * 0.18)
    rig.root.position.y = rig.rootRestY + Math.abs(beat) * 0.24
    return
  }

  // --- Airborne: tuck the legs, throw the arms up ---------------------------
  if (!grounded) {
    swing(rig, 'LegL1', -0.55)
    swing(rig, 'LegL2', 0.75)
    swing(rig, 'LegR1', 0.3)
    swing(rig, 'LegR2', 0.2)
    swing(rig, 'ArmL1', -2.1)
    if (!motion.holding) swing(rig, 'ArmR1', -2.1)
    swing(rig, 'Spine1', -0.1)
    return
  }

  // --- Standing still: a slow breathing sway --------------------------------
  if (ratio < 0.04) {
    const idle = Math.sin(time * 1.6)
    sway(rig, 'ArmL1', -0.07 - idle * 0.03)
    sway(rig, 'ArmR1', 0.07 + idle * 0.03)
    swing(rig, 'Spine1', idle * 0.02)
    rig.root.position.y = rig.rootRestY + idle * 0.03
    return
  }

  // --- Walk / run cycle -----------------------------------------------------
  // Step frequency rises with speed so a sprint doesn't look like a moonwalk.
  const phase = time * (5 + ratio * 5)
  const cycle = Math.sin(phase)
  const legAmp = 0.85 * ratio
  const armAmp = 0.7 * ratio

  // Legs swing in opposition; knees fold on the backswing only.
  swing(rig, 'LegL1', cycle * legAmp)
  swing(rig, 'LegR1', -cycle * legAmp)
  swing(rig, 'LegL2', Math.max(0, -cycle) * 1.1 * ratio)
  swing(rig, 'LegR2', Math.max(0, cycle) * 1.1 * ratio)

  // Arms counter-swing against the legs.
  // (A held tool keeps the right arm still; animateRig poses it.)
  swing(rig, 'ArmL1', -cycle * armAmp)
  swing(rig, 'ArmL2', Math.max(0, cycle) * 0.5 * ratio)
  if (!motion.holding) {
    swing(rig, 'ArmR1', cycle * armAmp)
    swing(rig, 'ArmR2', Math.max(0, -cycle) * 0.5 * ratio)
  }

  // Lean into the run, and bob once per step (twice per full cycle).
  swing(rig, 'Spine1', -0.14 * ratio)
  rig.root.position.y = rig.rootRestY + Math.abs(Math.cos(phase)) * 0.18 * ratio
}

/* ---------------------------------------------------------------------------
 * Accessory slots (hair, mask, neck, chest, waist, hand, shoes, and any slot the SDK
 * adds later). Everything here runs at load time except followAccessories(), which
 * runs per frame and allocates nothing.
 * ------------------------------------------------------------------------- */

/**
 * Model-space rest inverse of every bone: inverse(inverse(model.matrixWorld) *
 * bone.matrixWorld). Call right after the GLB loads, before posing.
 */
export function captureRestPose(root) {
  root.updateMatrixWorld(true)
  const modelInverse = root.matrixWorld.clone().invert()
  const restInverse = {}
  const bonesByName = {}
  root.traverse((node) => {
    if (!node.isBone) return
    bonesByName[node.name] = node
    restInverse[node.name] = modelInverse.clone().multiply(node.matrixWorld).invert()
  })
  return { restInverse, bonesByName }
}

/** restInverse(bone) * [scale(-1,1,1)] * translate(origin). */
export function accessoryLocal(restInverse, boneName, origin, mirrored = false) {
  const base = restInverse?.[boneName]
  if (!base) return null
  const local = base.clone()
  if (mirrored) local.multiply(new Matrix4().makeScale(-1, 1, 1))
  return local.multiply(new Matrix4().makeTranslation(origin[0], origin[1], origin[2]))
}

/**
 * Attaches one loaded accessory object for an SDK slot. Returns the entries created
 * (one, or two with the mirrored copy). Bone-following items go under their bone with
 * a fixed matrix; position+rotation-only items (inheritScale false: hands, shoes) go
 * under `holder` and are placed every frame by followAccessories().
 *
 * @param {object} rig from collectRig
 * @param {{ bone: string, mirrorBone?: string, origin: number[], inheritScale: boolean }} slot
 * @param {import('three').Object3D} object
 * @param {import('three').Object3D} holder sibling of the character, identity transform
 * @param {(boneName: string, mirrored: boolean) => import('three').Matrix4|null} [localFor]
 *   overrides the local matrix (custom characters)
 */
export function attachSlotAccessory(rig, slot, object, holder, localFor) {
  const entries = []
  const makeLocal = localFor || ((bone, mirrored) => accessoryLocal(rig.restInverse, bone, slot.origin, mirrored))
  const parts = [{ object, bone: slot.bone, mirrored: false }]
  if (slot.mirrorBone) parts.push({ object: object.clone(), bone: slot.mirrorBone, mirrored: true })
  const followOnly = slot.inheritScale === false
  for (const part of parts) {
    const bone = rig.bonesByName?.[part.bone]
    const local = makeLocal(part.bone, part.mirrored)
    if (!bone || !local || (followOnly && !holder)) continue
    part.object.matrixAutoUpdate = false
    part.object.traverse((child) => {
      if (child.isMesh) child.castShadow = true
    })
    if (followOnly) {
      holder.add(part.object)
    } else {
      part.object.matrix.copy(local)
      bone.add(part.object)
    }
    entries.push({ object: part.object, bone, local, followOnly })
  }
  return entries
}

const _inv = new Matrix4()
const _rel = new Matrix4()
const _fp = new Vector3()
const _fs = new Vector3()
const _fq = new Quaternion()
const _one = new Vector3(1, 1, 1)

/**
 * Places position+rotation-only accessories: compose(bone position, bone rotation,
 * scale 1) * local, in the holder's space. Proportions here move bones (shoulder
 * width, leg spacing, torso width), so the items follow them with no extra offset.
 *
 * @param {import('three').Object3D} space the group holding both the character and
 *   `holder`; updated here so bone world matrices are current for this frame
 */
export function followAccessories(followers, holder, space) {
  if (!followers.length || !holder || !space) return
  space.updateMatrixWorld(true)
  _inv.copy(holder.matrixWorld).invert()
  for (let i = 0; i < followers.length; i += 1) {
    const entry = followers[i]
    _rel.multiplyMatrices(_inv, entry.bone.matrixWorld)
    _rel.decompose(_fp, _fq, _fs)
    entry.object.matrix.compose(_fp, _fq, _one).multiply(entry.local)
  }
}

const _hand = new Matrix4()
const _handPos = new Vector3()

/**
 * Puts `target` on a bone (default: the right hand, at the end of the forearm), turned by
 * however far the bone has rotated from its rest pose. `target` must share the avatar's
 * parent (identity avatar group), so what's inside it is authored in the avatar's rest
 * pose (arm hanging down), in metres, relative to the bone. Runs per frame after the
 * pose; allocates nothing. `fresh`: matrices were already updated this frame.
 * False if the rig has no such bone.
 */
export function followBone(rig, target, boneName = 'ArmR2_leaf', fresh = false) {
  const bone = rig?.bonesByName?.[boneName]
  const restInverse = rig?.restInverse?.[boneName]
  const parent = target?.parent
  if (!bone || !restInverse || !parent) return false
  if (!fresh) parent.updateMatrixWorld(true)
  _hand.copy(parent.matrixWorld).invert().multiply(bone.matrixWorld)
  _handPos.setFromMatrixPosition(_hand)
  _hand.multiply(restInverse).decompose(_fp, _fq, _fs)
  target.position.copy(_handPos)
  target.quaternion.copy(_fq)
  return true
}

/* ---------------------------------------------------------------------------
 * Emotes: clips are degree deltas over the bind pose per bone, euler XYZ
 * right-multiplied onto the bind quaternion, smoothstep between keys.
 * ------------------------------------------------------------------------- */

const _euler = new Euler()
const _eq = new Quaternion()
const _target = new Quaternion()

/**
 * Poses the rig at time `t` (seconds, already wrapped for looping clips) of a
 * prepared clip, blended over the current pose by `weight` (0..1).
 *
 * @param {{ len: number, loop: boolean, tracks: { bone: string, keys: Float32Array }[] }} clip
 *   keys are [time, xRad, yRad, zRad] quadruples, sorted by time
 */
export function applyEmote(rig, clip, t, weight) {
  if (!rig?.bones || !clip) return
  for (let i = 0; i < clip.tracks.length; i += 1) {
    const track = clip.tracks[i]
    const entry = rig.bones[track.bone]
    if (!entry) continue // bones this rig doesn't have are ignored
    const k = track.keys
    const n = k.length / 4
    let x
    let y
    let z
    if (n === 1 || t <= k[0]) {
      x = k[1]
      y = k[2]
      z = k[3]
    } else if (t >= k[(n - 1) * 4]) {
      const j = (n - 1) * 4
      x = k[j + 1]
      y = k[j + 2]
      z = k[j + 3]
    } else {
      let j = 0
      while (j < n - 2 && t > k[(j + 1) * 4]) j += 1
      const a = j * 4
      const b = a + 4
      const span = k[b] - k[a]
      let u = span > 0 ? (t - k[a]) / span : 1
      u = u * u * (3 - 2 * u)
      x = k[a + 1] + (k[b + 1] - k[a + 1]) * u
      y = k[a + 2] + (k[b + 2] - k[a + 2]) * u
      z = k[a + 3] + (k[b + 3] - k[a + 3]) * u
    }
    _euler.set(x, y, z, 'XYZ')
    _eq.setFromEuler(_euler)
    _target.copy(entry.origQuat).multiply(_eq)
    if (weight >= 1) entry.bone.quaternion.copy(_target)
    else entry.bone.quaternion.slerp(_target, weight)
  }
}
