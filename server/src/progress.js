import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sanitizeProgress } from '../../shared/economy.js'

/**
 * Per-player, per-map progress (what they own and have banked) for signed-in players.
 *
 * Boxity hosting injects MONGODB_URI: an isolated database for this game and channel,
 * so there is nothing to set up. Without it (local dev) progress goes to a JSON file
 * next to the server. Every call is safe to await: a database failure is logged and
 * never breaks a match.
 *
 * Progress belongs to a TEAM on a map: the same people on the same map pick up where
 * they left off, while playing solo or with other people is a separate save that starts
 * fresh. Key: `${accountId}:${mapId}~${team}` (see teamKey). Only Boxity-verified
 * account ids are used; guests keep their progress in their own browser.
 */

/** A browser's stable guest id (client generated, only ever used to tell teams apart). */
export const sanitizeGid = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(v) ? v : '')

/**
 * Who a player is for team purposes: their verified account, else their guest id, else
 * (an old client) their session, which makes them a team of their own every time.
 */
export const identityOf = (accountId, gid, sessionId) => (accountId ? `a:${accountId}` : gid ? `g:${gid}` : `s:${sessionId}`)

/** 'solo' for one player, else a short hash of the sorted member identities. */
export function teamKey(identities) {
  const ids = [...new Set(identities)].sort()
  if (ids.length <= 1) return 'solo'
  return crypto.createHash('sha1').update(ids.join('|')).digest('hex').slice(0, 12)
}

/** The save slot for a map and team. */
export const progressKey = (mapId, team) => `${mapId}~${team || 'solo'}`

const MONGODB_URI = process.env.MONGODB_URI || ''
const COLLECTION = 'progress'
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'progress.json')

let collectionPromise = null

function collection() {
  collectionPromise ||= import('mongodb')
    .then(async ({ MongoClient }) => {
      const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
      await client.connect()
      return client.db().collection(COLLECTION)
    })
    .catch((err) => {
      console.error('[progress] could not connect to MongoDB; progress will not be saved:', err.message)
      collectionPromise = null
      return null
    })
  return collectionPromise
}

// --- local file store (dev) ----------------------------------------------------------
let fileData = null
let fileTimer = null

function readFile() {
  if (fileData) return fileData
  try {
    fileData = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    fileData = {}
  }
  return fileData
}

function writeFileSoon() {
  clearTimeout(fileTimer)
  fileTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true })
      fs.writeFileSync(FILE, JSON.stringify(fileData))
    } catch (err) {
      console.error('[progress] could not write', FILE, err.message)
    }
  }, 500)
}

const keyOf = (accountId, mapId) => `${accountId}:${mapId}`

/** The player's saved progress on this map, or null. */
export async function loadProgress(accountId, mapId) {
  if (!accountId) return null
  try {
    if (MONGODB_URI) {
      const col = await collection()
      const doc = col ? await col.findOne({ _id: keyOf(accountId, mapId) }) : null
      return sanitizeProgress(doc?.data)
    }
    return sanitizeProgress(readFile()[keyOf(accountId, mapId)])
  } catch (err) {
    console.error('[progress] load failed:', err.message)
    return null
  }
}

/** Saves (or, with null data, clears) a player's progress on this map. */
export async function saveProgress(accountId, mapId, data) {
  if (!accountId) return
  try {
    if (MONGODB_URI) {
      const col = await collection()
      if (!col) return
      const _id = keyOf(accountId, mapId)
      if (data) await col.updateOne({ _id }, { $set: { accountId, mapId, data, updatedAt: new Date() } }, { upsert: true })
      else await col.deleteOne({ _id })
      return
    }
    const all = readFile()
    if (data) all[keyOf(accountId, mapId)] = data
    else delete all[keyOf(accountId, mapId)]
    writeFileSoon()
  } catch (err) {
    console.error('[progress] save failed:', err.message)
  }
}
