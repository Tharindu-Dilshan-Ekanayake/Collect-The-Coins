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
 * Key: `${accountId}:${mapId}`. Only Boxity-verified account ids are used; guests keep
 * their progress in their own browser.
 */

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
