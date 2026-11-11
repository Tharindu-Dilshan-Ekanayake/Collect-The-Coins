/** Lobby and party rules shared by client and server. */
import { MAP_IDS } from './maps.js'

/** Players per lobby room. When one is full, matchmaking opens another. */
export const LOBBY_CAPACITY = 30
export const PARTY_SLOTS = 6
export const MAX_PARTY = 4
/** Seconds a hosted party waits for others before it starts (sooner when full). */
export const PARTY_WAIT_S = 15
/** Seconds left on the clock once a party fills up. */
export const PARTY_FULL_S = 3

/** Party "modes" are the maps. Locked maps are enforced by the client's progress. */
export const PLAYABLE_MODES = MAP_IDS
export const UNLOCKED_DIFFICULTIES = ['easy']

/** The lobby plaza is a disc; positions are clamped to it. */
export const PLAZA_LIMIT = 28

export const NAME_MAX = 20
export const sanitizeName = (name) =>
  String(name || 'Guest')
    .replace(/[^\w .-]/g, '')
    .trim()
    .slice(0, NAME_MAX) || 'Guest'

/**
 * Equipped Boxity cosmetic ids ({ hatId, hairId, skinId, ... }) as a JSON string. Only
 * "...Id" keys with plain id values survive, so new accessory slots replicate without a
 * code change and nothing else can ride along.
 */
export function sanitizeLook(value) {
  let obj = value
  if (typeof obj === 'string') {
    if (obj.length > 1200) return '{}'
    try {
      obj = JSON.parse(obj)
    } catch {
      return '{}'
    }
  }
  if (!obj || typeof obj !== 'object') return '{}'
  const out = {}
  let n = 0
  for (const [k, v] of Object.entries(obj)) {
    if (n >= 32) break
    if (v === null || v === undefined || !/^[a-zA-Z]{1,24}Id$/.test(k)) continue
    const id = String(v)
    if (!/^[\w-]{1,40}$/.test(id)) continue
    out[k] = id
    n += 1
  }
  return JSON.stringify(out)
}

const HEX = /^#[0-9a-f]{6}$/i
export const sanitizeColor = (value, fallback) => (HEX.test(String(value)) ? String(value) : fallback)

/** Stable look for a player from their name, so everyone sees the same colours. */
const SHIRTS = ['#e0484f', '#3b82c4', '#4caf50', '#f2b53a', '#9a4fc4', '#ff8a5c', '#2f9e9e', '#d9468f']
const PANTS = ['#2f3e5c', '#4a3a2a', '#3a3a46', '#2c4a3a', '#5a3048']
const SKINS = ['#f0c39a', '#d9a066', '#a8714a', '#7a4f2e', '#ffd9b8']
export function looksFor(name) {
  let h = 2166136261
  for (const ch of String(name)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const u = h >>> 0
  return { shirt: SHIRTS[u % SHIRTS.length], pants: PANTS[(u >>> 5) % PANTS.length], skin: SKINS[(u >>> 10) % SKINS.length] }
}
