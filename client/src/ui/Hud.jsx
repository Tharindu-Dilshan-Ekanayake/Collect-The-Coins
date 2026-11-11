import { useEffect, useState } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import { useNet } from '../net/net'
import { isMuted, setMuted, sfx } from '../state/audio'
import { useGame } from '../state/game'
import { useRun } from '../state/run'
import { PRESET_ORDER, useQuality } from '../state/quality'
import { GearIcon, SoundIcon } from './icons'

/**
 * Name tab, top-right: Boxity's toolbar and logo live at the top-left. No Log in /
 * Log out buttons: Boxity handles accounts.
 */
function PlayerCard() {
  const { identity, isLoggedIn } = useBloxity()
  const name = identity?.displayName || identity?.username || 'Guest'
  const pfp = identity?.pfp

  return (
    <div className="panel pointer-events-auto flex items-center gap-2 !rounded-2xl px-2 py-1.5 sm:gap-3 sm:px-3">
      {pfp ? (
        <img src={pfp} alt="" className="h-9 w-9 rounded-full border-2 border-bark object-cover" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-bark bg-gold text-lg font-bold text-ink">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="hidden leading-tight sm:block">
        <div className="max-w-32 truncate text-sm font-bold">{name}</div>
        <div className="text-xs text-bark/80">{isLoggedIn ? 'Signed in' : 'Playing as guest'}</div>
      </div>
    </div>
  )
}

function SettingsPanel({ onClose }) {
  const scene = useGame((s) => s.scene)
  const mode = useQuality((s) => s.mode)
  const preset = useQuality((s) => s.preset)
  const locked = useQuality((s) => s.locked)
  const setMode = useQuality((s) => s.setMode)

  return (
    <div className="panel animate-pop pointer-events-auto absolute top-16 right-0 w-64 p-4">
      <div className="mb-2 text-lg font-bold">Graphics</div>
      <div className="grid grid-cols-2 gap-2">
        {['auto', ...PRESET_ORDER].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              sfx('click')
              setMode(m)
            }}
            className="btn py-1.5 text-sm capitalize"
            style={{ '--btn': mode === m ? '#4caf50' : '#a08060' }}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs text-bark/80">
        Running on <b className="capitalize">{preset}</b>
        {locked ? ' (pinned by URL)' : '. Drops automatically if the game slows down.'}
      </div>
      {scene === 'stage' && (
        <button
          type="button"
          onClick={() => {
            sfx('click')
            onClose()
            // Leaving keeps every coin banked so far.
            useRun.getState().leaveRun()
            useGame.getState().returnToLobby()
          }}
          className="btn mt-3 w-full py-2 text-base"
          style={{ '--btn': '#d9483b' }}
        >
          Leave stage
        </button>
      )}
      <button type="button" onClick={onClose} className="btn mt-3 w-full py-1.5 text-sm" style={{ '--btn': '#8a6a4a' }}>
        Close
      </button>
    </div>
  )
}

function TopRight() {
  const [muted, setMutedState] = useState(isMuted())
  const panel = useGame((s) => s.panel)
  const openPanel = useGame((s) => s.openPanel)
  const closePanel = useGame((s) => s.closePanel)
  const open = panel === 'settings'

  return (
    <div className="pointer-events-auto relative flex gap-2">
      <button
        type="button"
        aria-label={muted ? 'Unmute' : 'Mute'}
        onClick={() => {
          setMuted(!muted)
          setMutedState(!muted)
        }}
        className="btn h-12 w-12 !rounded-full"
        style={{ '--btn': '#f2b53a' }}
      >
        <SoundIcon muted={muted} />
      </button>
      <button
        type="button"
        aria-label="Settings"
        onClick={() => {
          sfx('click')
          if (open) closePanel()
          else openPanel('settings')
        }}
        className="btn h-12 w-12 !rounded-full"
        style={{ '--btn': '#f2b53a' }}
      >
        <GearIcon />
      </button>
      {open && <SettingsPanel onClose={closePanel} />}
    </div>
  )
}

/** Short network notices (the connection status chip is gone on purpose). */
function NetBadge() {
  const notice = useNet((s) => s.notice)

  useEffect(() => {
    if (!notice) return undefined
    const id = setTimeout(() => useNet.setState({ notice: null }), 4000)
    return () => clearTimeout(id)
  }, [notice])

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1">
      {notice && <div className="rounded-lg bg-[#d9483b] px-2.5 py-1 text-xs font-bold text-white">{notice}</div>}
    </div>
  )
}

/** After clearing a map: "Map cleared!" and which map just unlocked, while the team dances. */
function CelebrationBanner() {
  const until = useGame((s) => s.celebrateUntil)
  const info = useGame((s) => s.celebrate)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return undefined
    const id = setInterval(() => setNow(Date.now()), 300)
    return () => clearInterval(id)
  }, [until])
  if (!until || now >= until) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center px-3">
      <div className="panel animate-pop !rounded-2xl px-5 py-3 text-center">
        <div className="title-outline text-2xl font-bold">Map cleared!</div>
        {info?.unlocked && <div className="font-bold text-[#2f8f2f]">New map unlocked: {info.unlocked}</div>}
      </div>
    </div>
  )
}

export function Hud() {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-end gap-2 p-3 sm:p-4">
        <PlayerCard />
        <TopRight />
      </div>
      {/* Own row on phones so it never collides with the corners. */}
      <div className="pointer-events-none absolute top-[4.6rem] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 sm:top-4">
        <NetBadge />
      </div>
      <CelebrationBanner />
    </>
  )
}

export default Hud
