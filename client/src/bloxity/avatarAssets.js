/**
 * URL construction and slot metadata for Bloxity avatar assets.
 *
 * Every URL comes from the told environment (environment.js) or from the SDK's own
 * helpers, never a hardcoded host. The SDK helpers are preferred when the SDK has
 * loaded; the local builders mirror them so the avatar still assembles before that.
 *
 * `avatar.getEquipped()` returns:
 *   { hatId, backId, skinId, headId, armLId, armRId, legLId, legRId, torsoId,
 *     hairId, maskId, neckId, chestId, waistId, handId, shoesId,
 *     pantsId, shirtId, faceId, characterId }
 */
import { avatarCdn, getEnvironment } from './environment'
import { getSDK, safeCall } from './sdk'

/** The base humanoid body + skeleton. All other assets modify this. */
export const baseBodyUrl = () => `${avatarCdn()}/player.glb`

/** Bone that hats attach to, from player.glb's skeleton. */
export const HAT_BONE = 'Neck1'
/** Bone that back items attach to. */
export const BACK_BONE = 'Spine2'
/** Bone whose bind-pose Y drives the neckHeight proportion. */
export const NECK_OFFSET_BONE = 'Neck_Offset'

/** Skin id used when nothing is equipped — the base body has no baked-in texture. */
export const DEFAULT_SKIN_ID = '0'

/**
 * Body-part slots.
 *
 * Each maps an equipped id onto a named skinned mesh already present in player.glb.
 * A part is applied by swapping that mesh's *geometry*, not by attaching a new
 * object — that is what keeps it bound to the shared skeleton.
 */
export const PART_SLOTS = {
  head: { idKey: 'headId', mesh: 'default_head', dir: 'head', suffix: '' },
  arm_L: { idKey: 'armLId', mesh: 'default_arm_L', dir: 'arms', suffix: '_L' },
  arm_R: { idKey: 'armRId', mesh: 'default_arm_R', dir: 'arms', suffix: '_R' },
  leg_L: { idKey: 'legLId', mesh: 'default_leg_L', dir: 'legs', suffix: '_L' },
  leg_R: { idKey: 'legRId', mesh: 'default_leg_R', dir: 'legs', suffix: '_R' },
  torso: { idKey: 'torsoId', mesh: 'default_torso', dir: 'torso', suffix: '' },
}

/**
 * Bone-attached slots besides hat and back, as the SDK's getAccessorySlots() returns
 * them. Used only until the SDK has loaded; afterwards the SDK's list wins, so slots
 * added later work without a code change.
 */
const FALLBACK_ACCESSORY_SLOTS = [
  { type: 'hair', field: 'hairId', bone: 'Neck1', origin: [0, 5.6, 0], inheritScale: true, dir: 'hats', label: 'Hair' },
  { type: 'mask', field: 'maskId', bone: 'Neck1', origin: [0, 5.6, 0], inheritScale: true, dir: 'hats', label: 'Mask' },
  { type: 'neck', field: 'neckId', bone: 'Spine2', origin: [0, 4.8, 0], inheritScale: true, dir: 'neck', label: 'Neck' },
  { type: 'chest', field: 'chestId', bone: 'Spine2', origin: [0, 3.6, 0], inheritScale: true, dir: 'chest', label: 'Chest' },
  { type: 'waist', field: 'waistId', bone: 'Spine1', origin: [0, 2.4, 0], inheritScale: true, dir: 'waist', label: 'Waist' },
  {
    type: 'hand',
    field: 'handId',
    bone: 'ArmL2_leaf',
    mirrorBone: 'ArmR2_leaf',
    origin: [0, 0, 0],
    inheritScale: false,
    dir: 'hand',
    label: 'Hand',
  },
  {
    type: 'shoes',
    field: 'shoesId',
    bone: 'LegL2_leaf',
    mirrorBone: 'LegR2_leaf',
    origin: [0, 0, 0],
    inheritScale: false,
    dir: 'shoes',
    label: 'Shoes',
  },
]

/** Every bone-attached slot besides hat and back (hair, mask, neck, chest, waist, hand, shoes, …). */
export function accessorySlots() {
  const avatar = getSDK()?.avatar
  const slots = avatar?.getAccessorySlots && safeCall(avatar.getAccessorySlots.bind(avatar))
  return Array.isArray(slots) && slots.length ? slots : FALLBACK_ACCESSORY_SLOTS
}

/** Values that all mean "nothing equipped". Superset of the SDK's own check. */
const EMPTY_IDS = new Set(['-1', '', 'undefined', 'null'])

/**
 * @param {unknown} id
 * @returns {boolean} true when the id names a real asset worth fetching
 */
export function isRealId(id) {
  if (id === null || id === undefined) return false
  return !EMPTY_IDS.has(String(id).trim())
}

export const assetUrls = {
  part: (slot, id) => {
    const { dir, suffix } = PART_SLOTS[slot]
    return `${avatarCdn()}/parts/${dir}/${id}${suffix}.glb`
  },
  skinTexture: (id) => `${avatarCdn()}/skins/${id}.png`,
  hatMesh: (id) => `${avatarCdn()}/items/hats/${id}.obj`,
  hatTexture: (id) => `${avatarCdn()}/textures/hats/${id}.png`,
  backMesh: (id) => `${avatarCdn()}/items/back/${id}.obj`,
  backTexture: (id) => `${avatarCdn()}/textures/back/${id}.png`,
}

/**
 * { mesh, texture } for a worn accessory (hatId, backId or any accessory slot field),
 * or null when nothing real is worn there.
 */
export function accessoryUrls(field, id, slot = null) {
  if (!isRealId(id) || String(id) === '0') return null
  const avatar = getSDK()?.avatar
  if (avatar?.getAccessoryUrls) {
    const urls = safeCall(avatar.getAccessoryUrls.bind(avatar), field, String(id))
    if (urls !== undefined) return urls || null
  }
  const dir = field === 'hatId' ? 'hats' : field === 'backId' ? 'back' : slot?.dir
  if (!dir || !/^[A-Za-z0-9_-]+$/.test(String(id))) return null
  return { mesh: `${avatarCdn()}/items/${dir}/${id}.obj`, texture: `${avatarCdn()}/textures/${dir}/${id}.png` }
}

/** Skin ids fall back to "0" rather than being skipped. */
export const skinIdOrDefault = (id) => (isRealId(id) ? String(id) : DEFAULT_SKIN_ID)

/**
 * Clothing and face are not separate meshes: Bloxity draws them onto the skin texture
 * server-side. Listed in the order the API expects their URL segments.
 */
const SKIN_OVERLAYS = [
  ['pantsId', 'pn'],
  ['shirtId', 'sh'],
  ['faceId', 'fc'],
]

/**
 * URL of the skin with the worn pants, shirt and face drawn on, or null when none are
 * worn (then the plain `assetUrls.skinTexture` is the right texture).
 * Fallback for before the SDK loads; see skinTextureUrl().
 */
export function skinCompositeUrl(equipped) {
  // As in the SDK, '0' also means "no overlay" here.
  const worn = (id) => isRealId(id) && String(id) !== '0'
  const layers = SKIN_OVERLAYS.filter(([key]) => worn(equipped?.[key]))
  if (layers.length === 0) return null

  let key = `s${skinIdOrDefault(equipped.skinId)}`
  for (const [field, prefix] of layers) key += `_${prefix}${equipped[field]}`
  return `${getEnvironment().apiUrl}/v1/avatar/skin-texture/${key}.png`
}

/**
 * The body texture for these equipped ids, with pants, shirt and face drawn on:
 * the SDK's getSkinTextureUrlFor() when available, else the same URL built locally.
 */
export function skinTextureUrl(equipped) {
  const avatar = getSDK()?.avatar
  const url = avatar?.getSkinTextureUrlFor && safeCall(avatar.getSkinTextureUrlFor.bind(avatar), equipped || {})
  if (typeof url === 'string' && url) return url
  return skinCompositeUrl(equipped) || assetUrls.skinTexture(skinIdOrDefault(equipped?.skinId))
}
