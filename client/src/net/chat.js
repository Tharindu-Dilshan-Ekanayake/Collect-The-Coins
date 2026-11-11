import { create } from 'zustand'

import { safeCall } from '../bloxity/sdk'

/**
 * Boxity chat bubbles. Boxity draws the chat box itself; the game only shows each
 * player's latest message above their head for a few seconds, on the name tag that is
 * already there (so no extra draw calls).
 */

const MAX_CHARS = 26

/** Latest bubble per Boxity account id: { text, until }. Read by the remote name tags. */
const bubbles = new Map()

/** The local player's bubble, for their own name tag. */
export const useChat = create(() => ({ local: null }))

const clip = (text) => {
  const one = String(text || '').replace(/\s+/g, ' ').trim()
  return one.length > MAX_CHARS ? `${one.slice(0, MAX_CHARS - 1)}…` : one
}

/** Subscribes to Legion.SDK.chat once the SDK is ready. Subscribing is the opt-in. */
export function installChat(sdk) {
  const chat = sdk?.chat
  if (!chat?.onMessage) return
  safeCall(chat.onMessage.bind(chat), (m) => {
    if (!m) return
    const seconds = Number(chat.bubbleSeconds) || 4
    const text = clip(safeCall(chat.bubbleText?.bind(chat), m) || (m.isGif ? 'sent a GIF' : m.text))
    const bubble = { text, until: Date.now() + seconds * 1000 }
    if (m.isLocalPlayer) useChat.setState({ local: bubble })
    if (m.userId) bubbles.set(String(m.userId).replace(/^legion_/, ''), bubble)
  })
}

/** Current bubble text for an account id, or ''. */
export function bubbleFor(uid) {
  const b = uid ? bubbles.get(uid) : null
  if (!b) return ''
  if (b.until <= Date.now()) {
    bubbles.delete(uid)
    return ''
  }
  return b.text
}
