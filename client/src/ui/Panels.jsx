import { useCallback, useEffect, useRef, useState } from 'react'

import { sfx } from '../state/audio'
import {
  DIFFICULTIES,
  MAX_PARTY,
  MODE_GROUPS,
  MODES,
} from '../state/content'
import { isUnlocked } from '@shared/maps.js'

import { myPartySlot, party as netParty, useNet } from '../net/net'
import { inviteLink } from '../net/platform'
import { useGame } from '../state/game'
import { CoinIcon, HourglassIcon, LockIcon, UsersIcon } from './icons'

const AUTO_START_S = 30

function Modal({ children, onClose, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.code === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-3 [@media(max-height:480px)]:p-1.5">
      <div
        className={`panel modal-fit animate-pop pointer-events-auto max-h-[calc(100dvh-1.5rem)] [@media(max-height:480px)]:max-h-[calc(100dvh-0.75rem)] w-full overflow-y-auto ${
          wide ? 'max-w-3xl' : 'max-w-md'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

/** A screenshot of the map; greyed out behind a lock until the map before it is cleared. */
function ModeArt({ mode, locked }) {
  return (
    <div className="relative h-full w-full" style={{ background: mode.color }}>
      <img
        src={mode.image}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={`h-full w-full object-cover ${locked ? 'brightness-50 grayscale' : ''}`}
      />
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <LockIcon className="h-10 w-10" />
        </div>
      )}
    </div>
  )
}

/** True when this map can be played (the first map, or the one before it is cleared). */
const useUnlocked = (id) => useGame((s) => isUnlocked(id, s.clearedMaps))

function ModeButton({ mode, selected, onSelect }) {
  const locked = !useUnlocked(mode.id)
  return (
    <button
      type="button"
      onClick={() => {
        sfx('click')
        onSelect(mode.id)
      }}
      className={`relative block h-24 w-full overflow-hidden rounded-xl border-3 border-ink transition ${
        selected ? 'ring-4 ring-white' : 'opacity-90 hover:opacity-100'
      }`}
    >
      <ModeArt mode={mode} locked={locked} />
      <span className="absolute top-1 left-1 rounded-full border-2 border-ink bg-white/85 px-2 text-xs font-bold text-ink">
        {mode.chapter}
      </span>
      <span
        className="title-outline absolute inset-x-1 bottom-1 text-center text-sm leading-tight font-bold"
        style={{ WebkitTextStroke: '4px #3b2414' }}
      >
        {mode.name}
      </span>
    </button>
  )
}

function ModeList({ selected, onSelect }) {
  return (
    <div className="space-y-2">
      {MODE_GROUPS.map((group) => (
        <div key={group.id} className="space-y-2">
          <div
            className="title-outline rounded-xl border-3 border-ink py-1 text-center text-base font-bold tracking-wide"
            style={{ background: group.color, WebkitTextStroke: '4px #3b2414' }}
          >
            {group.label}
          </div>
          {MODES.filter((m) => m.group === group.id).map((mode) => (
            <ModeButton key={mode.id} mode={mode} selected={selected === mode.id} onSelect={onSelect} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Opens when the player steps on a party slot. Every mode plays the same map. */
export function PartyPanel() {
  const party = useGame((s) => s.party)
  const setParty = useGame((s) => s.setParty)
  const closePanel = useGame((s) => s.closePanel)
  const createLocal = useGame((s) => s.createParty)
  const mode = MODES.find((m) => m.id === party.modeId) || MODES[0]
  const locked = !useUnlocked(mode.id)
  const createParty = useCallback(() => {
    const game = useGame.getState()
    const chosen = MODES.find((m) => m.id === game.party.modeId)
    if (game.activeSlot === null || !chosen || !game.isMapUnlocked(chosen.id)) return false
    if (netParty.create(game.party)) {
      useGame.setState({ panel: null, dismissedSlot: game.activeSlot })
      return true
    }
    return createLocal()
  }, [createLocal])

  const [seconds, setSeconds] = useState(AUTO_START_S)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    sfx('pad')
  }, [])

  useEffect(() => {
    if (locked) return undefined
    const id = setInterval(() => setSeconds((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [locked])

  useEffect(() => {
    if (seconds <= 0 && !locked) createParty()
  }, [seconds, locked, createParty])

  const create = () => {
    if (createParty()) sfx('buy')
  }

  const invite = async () => {
    sfx('click')
    try {
      await navigator.clipboard.writeText(inviteLink())
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard blocked: nothing to do.
    }
  }

  return (
    <Modal onClose={closePanel} wide>
      <div className="flex flex-col gap-3 p-3 sm:flex-row">
        <section className="flex-1 overflow-hidden rounded-2xl border-4 border-bark bg-white/40">
          <div className="relative h-28">
            <ModeArt mode={mode} locked={locked} />
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/25 px-3 text-center">
              <h2 className="title-outline text-2xl leading-tight font-bold sm:text-3xl">{mode.name}</h2>
              <div className="title-outline text-lg font-bold" style={{ WebkitTextStroke: '4px #3b2414' }}>
                CREATE PARTY
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <p className="text-center text-sm text-bark">{mode.tagline}</p>

            {locked ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border-3 border-dashed border-bark/50 bg-black/5 p-4 text-center">
                <LockIcon className="h-10 w-10" />
                <div className="font-bold">Locked</div>
                <div className="text-sm text-bark">{mode.unlockHint}</div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-1.5">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={d.locked}
                      onClick={() => {
                        sfx('click')
                        setParty({ difficulty: d.id })
                      }}
                      className={`btn relative py-1.5 text-xs sm:text-sm ${party.difficulty === d.id ? 'ring-4 ring-white' : ''}`}
                      style={{ '--btn': d.color }}
                    >
                      {d.label}
                      {d.locked && <LockIcon className="absolute -top-2 -right-1.5 h-5 w-5" />}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm font-bold">
                  <span className="flex items-center gap-1.5">
                    <HourglassIcon /> {mode.timeLimit}
                  </span>
                  <span className="flex items-center gap-1.5 text-[#c02a4a]">
                    <CoinIcon className="h-6 w-6" /> {mode.coins.toLocaleString('en-US')} coins · keep what you bank
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-black/5 px-4 py-2">
                  <span className="text-lg font-bold">Party size</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn h-9 w-9 text-xl"
                      style={{ '--btn': '#8a6a4a' }}
                      onClick={() => setParty({ size: Math.max(1, party.size - 1) })}
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-2xl font-bold">{party.size}</span>
                    <button
                      type="button"
                      className="btn h-9 w-9 text-xl"
                      style={{ '--btn': '#8a6a4a' }}
                      onClick={() => setParty({ size: Math.min(MAX_PARTY, party.size + 1) })}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      sfx('click')
                      setParty({ friendsOnly: !party.friendsOnly })
                    }}
                    className="btn py-2 text-sm"
                    style={{ '--btn': party.friendsOnly ? '#4caf50' : '#a08060' }}
                  >
                    <UsersIcon className="h-5 w-5" /> Friends only {party.friendsOnly ? 'ON' : 'OFF'}
                  </button>
                  <button type="button" onClick={invite} className="btn py-2 text-sm" style={{ '--btn': '#3b82c4' }}>
                    <UsersIcon className="h-5 w-5" /> {copied ? 'Link copied!' : 'Invite friends'}
                  </button>
                </div>
              </>
            )}

            <div className="text-center">
              <button
                type="button"
                disabled={locked}
                onClick={create}
                className="btn w-full py-3 text-2xl"
                style={{ '--btn': '#3fae3f' }}
              >
                CREATE
              </button>
              {!locked && <div className="mt-1.5 text-xs text-bark/80">auto create in {Math.max(0, seconds)}s</div>}
            </div>
          </div>
        </section>

        <aside className="sm:w-56">
          <ModeList selected={mode.id} onSelect={(modeId) => setParty({ modeId })} />
        </aside>
      </div>

      <div className="px-3 pb-3">
        <button type="button" onClick={closePanel} className="btn w-full py-2 text-lg" style={{ '--btn': '#d9483b' }}>
          BACK
        </button>
      </div>
    </Modal>
  )
}

function BannerView({ modeId, difficultyId, count, size, left, canStart, onStart, onLeave, note }) {
  // Countdown ticks for the last three seconds, and a chime when someone joins.
  useEffect(() => {
    if (left > 0 && left <= 3) sfx('tick')
  }, [left])
  const lastCount = useRef(count)
  useEffect(() => {
    if (count > lastCount.current) sfx('join')
    lastCount.current = count
  }, [count])
  const mode = MODES.find((m) => m.id === modeId)
  const difficulty = DIFFICULTIES.find((d) => d.id === difficultyId)
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[8.6rem] z-20 flex justify-center px-3 sm:top-24">
      <div className="panel animate-pop pointer-events-auto flex items-center gap-3 !rounded-2xl py-2 pr-2 pl-4">
        <div className="leading-tight">
          <div className="text-xs font-bold text-bark/80">
            {note ? `${note} · ` : 'PARTY · '}
            {mode?.name} · <span style={{ color: difficulty?.color }}>{difficulty?.label}</span> · {count}/{size}
          </div>
          <div className="text-lg font-bold">Starting in {Math.max(0, left)}…</div>
        </div>
        {canStart && (
          <button
            type="button"
            onClick={() => {
              sfx('buy')
              onStart()
            }}
            className="btn px-3 py-1.5 text-sm"
            style={{ '--btn': '#3fae3f' }}
          >
            Start now
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            sfx('click')
            onLeave()
          }}
          className="btn px-3 py-1.5 text-sm"
          style={{ '--btn': '#d9483b' }}
        >
          Leave
        </button>
      </div>
    </div>
  )
}

/** Solo (offline): the countdown runs here and loads the stage when it ends. */
function OfflineBanner() {
  const hosted = useGame((s) => s.hosted)
  const enterStage = useGame((s) => s.enterStage)
  const leaveParty = useGame((s) => s.leaveParty)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!hosted) return undefined
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [hosted])

  const left = hosted ? Math.ceil((hosted.startsAt - now) / 1000) : 0
  useEffect(() => {
    if (hosted && left <= 0) enterStage(hosted.modeId)
  }, [hosted, left, enterStage])

  if (!hosted) return null
  return (
    <BannerView
      modeId={hosted.modeId}
      difficultyId={hosted.difficulty}
      count={1}
      size={hosted.size}
      left={left}
      canStart
      onStart={() => enterStage(hosted.modeId)}
      onLeave={leaveParty}
    />
  )
}

/** Online: the server runs the countdown and sends everyone in the party to one stage. */
function OnlineBanner() {
  const slots = useNet((s) => s.slots)
  const myId = useNet((s) => s.myId)
  const index = myPartySlot(slots, myId)
  if (index === null) return null
  const slot = slots[index]
  const isHost = slot.host === myId
  return (
    <BannerView
      modeId={slot.modeId}
      difficultyId={slot.difficulty}
      count={slot.members.length}
      size={slot.size}
      left={slot.left}
      canStart={isHost}
      note={isHost ? 'YOUR PARTY' : `${slot.hostName.toUpperCase()}'S PARTY`}
      onStart={() => netParty.start()}
      onLeave={() => {
        netParty.leave()
        useGame.setState({ dismissedSlot: useGame.getState().activeSlot })
      }}
    />
  )
}

/** After CREATE: countdown on screen; stepping off the slot or Leave cancels it. */
export function PartyBanner() {
  const online = useNet((s) => s.slots.length > 0)
  return online ? <OnlineBanner /> : <OfflineBanner />
}

export function Panels() {
  const panel = useGame((s) => s.panel)
  const activeSlot = useGame((s) => s.activeSlot)
  // Online, a slot someone else already hosts is joined by standing on it: no create panel.
  const takenByOther = useNet((s) => {
    const slot = activeSlot === null ? null : s.slots[activeSlot]
    return Boolean(slot?.host && slot.host !== s.myId)
  })
  if (panel === 'party' && !takenByOther) return <PartyPanel key={activeSlot} />
  return null
}

export default Panels
