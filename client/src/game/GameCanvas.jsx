import { PerformanceMonitor, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useState } from 'react'

import { useGame } from '../state/game'
import { useQuality } from '../state/quality'
import { registerDebug } from './lib/debug'
import LobbyScene from './lobby/LobbyScene'
import { FOG_COLOR } from './sceneStyle'

/** Stages are separate chunks, fetched only when a party starts. */
const KeepStage = lazy(() => import('./stages/keep/KeepStage'))

/** r3f-perf overlay (FPS, draw calls, triangles, GPU/CPU time). Dev builds only, never shipped. */
// Dev-only perf overlay, hidden unless the URL has ?perf.
const Perf =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('perf')
    ? lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf })))
    : null

/** Seconds of play before the FPS monitor starts judging (shader compiles are slow). */
const MONITOR_WARMUP_MS = 4000
/** If a lost WebGL context isn't restored by then, rebuild the canvas from scratch. */
const CONTEXT_RESTORE_TIMEOUT_MS = 3000

/** Mirrors drei's asset-loading progress into the store for the HTML loading screen. */
function ProgressBridge() {
  const progress = useProgress((s) => s.progress)
  useEffect(() => {
    useGame.getState().setLoadProgress(progress)
  }, [progress])
  return null
}

export function GameCanvas() {
  const settings = useQuality((s) => s.settings)
  const locked = useQuality((s) => s.locked)
  const scene = useGame((s) => s.scene)
  const stageId = useGame((s) => s.stageId)
  const adBreak = useGame((s) => s.adBreak)
  const lobbyReady = useGame((s) => s.lobbyReady)
  const shadersReady = useGame((s) => s.shadersReady)
  const contextLost = useGame((s) => s.contextLost)

  const [canvasKey, setCanvasKey] = useState(0)
  const [monitoring, setMonitoring] = useState(false)
  // Antialiasing can only be chosen when the context is created.
  const [antialias] = useState(() => settings.name !== 'low')

  useEffect(() => {
    if (!lobbyReady || locked) return undefined
    const id = setTimeout(() => setMonitoring(true), MONITOR_WARMUP_MS)
    return () => clearTimeout(id)
  }, [lobbyReady, locked])

  // Context loss: three restores on 'webglcontextrestored'; if that never comes,
  // remount the canvas to get a brand-new context.
  useEffect(() => {
    if (!contextLost) return undefined
    const id = setTimeout(() => {
      useGame.getState().setContextLost(false)
      setCanvasKey((k) => k + 1)
    }, CONTEXT_RESTORE_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [contextLost])

  const onCreated = ({ gl, scene: threeScene, camera }) => {
    gl.setClearColor(FOG_COLOR)
    // Reading shader logs right after linking forces a synchronous compile wait for
    // every program. Keep the checks in dev, skip them in production.
    gl.debug.checkShaderErrors = import.meta.env.DEV
    const canvas = gl.domElement
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault() // tells the browser we want the context back
      useGame.getState().setContextLost(true)
    })
    canvas.addEventListener('webglcontextrestored', () => useGame.getState().setContextLost(false))
    registerDebug('gl', gl)
    registerDebug('scene', threeScene)
    registerDebug('camera', camera)
    registerDebug('game', useGame)
    registerDebug('quality', useQuality)
  }

  return (
    <>
      <ProgressBridge />
      <Canvas
        key={canvasKey}
        // PCF, not "soft": three r18x removed PCFSoftShadowMap.
        shadows={settings.shadows ? 'percentage' : false}
        // No tone mapping: the palette in sceneStyle.js is picked to look right without it.
        flat
        // Paused until the lobby's shaders finish compiling in parallel (LobbyScene).
        frameloop={!adBreak && (shadersReady || scene !== 'lobby') ? 'always' : 'never'}
        dpr={settings.dpr}
        gl={{ antialias, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 55, near: 0.1, far: settings.viewDistance, position: [0, 6, 24] }}
        onCreated={onCreated}
      >
        {monitoring && (
          <PerformanceMonitor
            ms={500}
            iterations={6}
            bounds={() => [45, 1000]}
            // Defer out of the frame loop: no store writes inside useFrame.
            onDecline={() => setTimeout(() => useQuality.getState().degrade(), 0)}
          />
        )}

        <Suspense fallback={null}>
          {scene === 'lobby' ? <LobbyScene /> : <KeepStage key={stageId} />}
        </Suspense>

        {Perf && (
          <Suspense fallback={null}>
            <Perf position="bottom-right" />
          </Suspense>
        )}
      </Canvas>
    </>
  )
}

export default GameCanvas
