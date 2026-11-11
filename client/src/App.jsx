import { lazy, Suspense, useEffect, useState } from 'react'

import { useBloxity } from './bloxity/BloxityContext'
import { setProfile } from './net/net'
import { installPlatform } from './net/platform'
import { installAudioUnlock } from './state/audio'
import { useGame } from './state/game'
import { useKeyboardInput } from './state/input'
import Hud from './ui/Hud'
import { ContextLostOverlay, LoadingScreen, StageOverlay } from './ui/Overlays'
import Panels, { PartyBanner } from './ui/Panels'
import TouchControls from './ui/TouchControls'

/**
 * three.js, R3F and the lobby live in this chunk. Splitting it off lets the HTML
 * loading screen paint immediately while the 3D code downloads.
 */
const gameCanvasChunk = import('./game/GameCanvas') // start downloading right away
const GameCanvas = lazy(() => gameCanvasChunk)

/** Stage HUD and panels ship with the stage, not the lobby. */
const StageUI = lazy(() => import('./ui/stage/StageUI'))

/** Canvas text (signs, boards, labels) is drawn once, so wait briefly for the font. */
function useFontsReady(timeoutMs = 1500) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let done = false
    const finish = () => {
      if (!done) {
        done = true
        setReady(true)
      }
    }
    const fonts = document.fonts
    if (!fonts?.load) {
      finish()
      return undefined
    }
    Promise.all([fonts.load('700 40px Fredoka'), fonts.load('600 40px Fredoka')]).then(finish, finish)
    const id = setTimeout(finish, timeoutMs)
    return () => clearTimeout(id)
  }, [timeoutMs])
  return ready
}

/**
 * The name other players see (sent when joining a lobby or stage). A leaf component on
 * purpose: Boxity context updates re-render only this, not the whole app and 3D tree.
 */
function NetProfile() {
  const { identity } = useBloxity()
  const name = identity?.displayName || identity?.username || 'Guest'
  useEffect(() => setProfile({ name }), [name])
  return null
}

function App() {
  useKeyboardInput()
  useEffect(() => installAudioUnlock(), [])
  useEffect(() => installPlatform(), [])
  const fontsReady = useFontsReady()
  const scene = useGame((s) => s.scene)

  return (
    <div className="relative h-dvh w-screen overflow-hidden select-none">
      {fontsReady && (
        <Suspense fallback={null}>
          <GameCanvas />
        </Suspense>
      )}
      <NetProfile />
      <Hud />
      <TouchControls />
      {scene === 'stage' && (
        <Suspense fallback={null}>
          <StageUI />
        </Suspense>
      )}
      <Panels />
      <PartyBanner />
      <StageOverlay />
      <ContextLostOverlay />
      <LoadingScreen />
    </div>
  )
}

export default App
