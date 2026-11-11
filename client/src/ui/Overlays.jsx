import { useEffect, useState } from 'react'

import { MODES } from '../state/content'
import { useGame } from '../state/game'

const TIPS = [
  'Step on a glowing pad to start a party.',
  'Upgrades at the blue stall make you faster.',
  'Feeling lucky? Roll a trinket at the purple stall.',
  'Beat a record to get your name on the boards.',
]

function SpinningCoin({ size = 72 }) {
  return (
    <div style={{ perspective: 400 }}>
      <div
        className="animate-coin flex items-center justify-center rounded-full border-[5px] border-[#b07a10] bg-[#ffc83a] font-bold text-[#b07a10] shadow-[inset_0_-6px_0_rgba(0,0,0,0.15)]"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        ★
      </div>
    </div>
  )
}

/** Full-screen loader until the first lobby frame with the avatar has rendered. */
export function LoadingScreen() {
  const ready = useGame((s) => s.lobbyReady)
  const progress = useGame((s) => s.loadProgress)
  const [hidden, setHidden] = useState(false)
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])

  useEffect(() => {
    if (!ready) return undefined
    const id = setTimeout(() => setHidden(true), 450)
    return () => clearTimeout(id)
  }, [ready])

  if (hidden) return null
  const shown = ready ? 100 : Math.max(12, Math.min(95, 15 + progress * 0.8))

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 transition-opacity duration-400"
      style={{
        opacity: ready ? 0 : 1,
        background: 'radial-gradient(circle at 50% 110%, #e39a8c 0%, #3b3a7c 45%, #121a44 100%)',
      }}
    >
      <SpinningCoin />
      <h1 className="title-outline text-center text-5xl font-bold sm:text-6xl">Coinhaven</h1>
      <div className="h-5 w-72 max-w-full overflow-hidden rounded-full border-4 border-ink bg-[#2a2350]">
        <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${shown}%` }} />
      </div>
      <p className="text-outline max-w-sm text-center text-lg font-semibold text-cream">{tip}</p>
    </div>
  )
}

export function ContextLostOverlay() {
  const lost = useGame((s) => s.contextLost)
  if (!lost) return null
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="panel animate-pop flex flex-col items-center gap-3 p-6">
        <SpinningCoin size={48} />
        <div className="text-lg font-bold">Reconnecting graphics…</div>
      </div>
    </div>
  )
}

/** Card shown while the stage chunk downloads and builds. */
export function StageOverlay() {
  const scene = useGame((s) => s.scene)
  const modeId = useGame((s) => s.modeId)
  const stageReady = useGame((s) => s.stageReady)
  if (scene !== 'stage' || stageReady) return null
  const mode = MODES.find((m) => m.id === modeId)

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#241b1a]">
      <div className="panel animate-pop flex max-w-sm flex-col items-center gap-3 p-6 text-center">
        {mode && <div className="font-bold text-bark">Chapter {mode.chapter}</div>}
        <h2 className="title-outline -mt-2 text-3xl font-bold">{mode?.name || 'Treasure map'}</h2>
        <div className="flex items-center gap-3 font-bold">
          <SpinningCoin size={36} /> Opening the treasure hall…
        </div>
      </div>
    </div>
  )
}
