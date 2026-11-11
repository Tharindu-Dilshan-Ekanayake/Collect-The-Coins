import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getSDK, safeCall } from '../../bloxity/sdk'
import Multiplayer from '../../net/RemotePlayers'
import { useGame } from '../../state/game'
import { useQuality } from '../../state/quality'
import FollowCamera from '../FollowCamera'
import { registerDebug } from '../lib/debug'
import { disposeDeep, disposeSharedMaterials, useDisposable } from '../lib/resources'
import Lighting from '../Lighting'
import Player from '../Player'
import { FOG_COLOR } from '../sceneStyle'
import Atmosphere from './Atmosphere'
import { Leaderboards } from './Landmarks'
import { SLOTS, SPAWN } from './layout'
import { SCENERY_STEPS, buildCoreModels } from './models'
import PartySlots from './PartySlots'
import { Ground, PlazaProps, Village } from './World'
import ZoneWatcher from './ZoneWatcher'

/**
 * Boxity loading-screen calls. Module-level rather than from the Bloxity context, so
 * login/avatar updates during startup don't re-render the whole lobby tree.
 */
const game = {
  loadingStep: (label) => {
    const g = getSDK()?.game
    safeCall(g?.loadingStep?.bind(g), label)
  },
  loadingEnd: () => {
    const g = getSDK()?.game
    safeCall(g?.loadingEnd?.bind(g))
  },
}

/** Longest slice of scenery building per task, so frames keep flowing while it builds. */
const SCENERY_SLICE_MS = 8

/**
 * Builds the scenery a few pieces per task once `start` is true, then returns it all
 * at once (so it appears together). Disposed on unmount.
 */
function useScenery(start) {
  const [scenery, setScenery] = useState(null)
  useEffect(() => {
    if (!start) return undefined
    const built = {}
    let i = 0
    let timer = 0
    let cancelled = false
    const step = () => {
      if (cancelled) return
      const t0 = performance.now()
      while (i < SCENERY_STEPS.length && performance.now() - t0 < SCENERY_SLICE_MS) {
        const [key, build] = SCENERY_STEPS[i]
        built[key] = build()
        i += 1
      }
      if (i < SCENERY_STEPS.length) timer = setTimeout(step, 0)
      else setScenery(built)
    }
    timer = setTimeout(step, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
      disposeDeep(built)
    }
  }, [start])
  return scenery
}

/** Start rendering anyway if async shader compilation takes longer than this. */
const SHADER_TIMEOUT_MS = 6000


/**
 * The lobby: a cozy plaza with party slots and leaderboards. All geometry is built
 * once on mount and disposed on unmount (entering a stage unmounts the lobby).
 */
export function LobbyScene() {
  const bodyRef = useRef(null)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const threeScene = useThree((s) => s.scene)
  const settings = useQuality((s) => s.settings)

  // The plaza and party slots first; the scenery streams in once the lobby is playable.
  const core = useDisposable(buildCoreModels, [])
  const lobbyReady = useGame((s) => s.lobbyReady)
  const scenery = useScenery(lobbyReady)
  const models = useMemo(() => (scenery ? { ...core, ...scenery } : core), [core, scenery])
  useEffect(() => {
    registerDebug('player', bodyRef)
    registerDebug('slots', SLOTS)
  }, [])
  useEffect(() => () => disposeSharedMaterials(), [])

  useEffect(() => {
    camera.far = settings.viewDistance
    camera.updateProjectionMatrix()
  }, [camera, settings.viewDistance])

  useEffect(() => {
    game.loadingStep('Sweeping the plaza…')
  }, [])

  // Ready = every shader is compiled and the lobby has drawn a couple of frames. The
  // avatar is NOT waited for: a placeholder body stands in until it downloads.
  const readyRef = useRef(false)
  const markReady = useCallback(() => {
    if (readyRef.current) return
    readyRef.current = true
    useGame.getState().setShadersReady(true) // starts the render loop
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        useGame.getState().setLobbyReady()
        game.loadingEnd()
      }),
    )
  }, [])

  // Compile all programs in parallel (KHR_parallel_shader_compile) while the loader is
  // up, instead of stalling the first frames on one synchronous compile after another.
  // The canvas render loop is paused until this finishes (see GameCanvas).
  useEffect(() => {
    if (useGame.getState().shadersReady) {
      markReady()
      return undefined
    }
    let cancelled = false
    gl.compileAsync(threeScene, camera)
      .catch(() => {})
      .then(() => !cancelled && markReady())
    const id = setTimeout(markReady, SHADER_TIMEOUT_MS)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [gl, threeScene, camera, markReady])

  return (
    <>
      <fog attach="fog" args={[FOG_COLOR, settings.fogNear, settings.fogFar]} />
      <Atmosphere />
      <Lighting followRef={bodyRef} />

      <Ground models={models} />
      {scenery && <Village models={models} />}
      {scenery && <PlazaProps models={models} />}
      <PartySlots models={models} />
      {scenery && <Leaderboards models={models} />}

      <Player bodyRef={bodyRef} position={SPAWN} />
      <FollowCamera bodyRef={bodyRef} />

      <ZoneWatcher bodyRef={bodyRef} />
      <Multiplayer kind="lobby" bodyRef={bodyRef} />
    </>
  )
}

export default LobbyScene
