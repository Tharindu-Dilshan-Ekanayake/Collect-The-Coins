import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { SpriteMaterial } from 'three'

import { useNet } from '../../net/net'
import { DIFFICULTIES, MAX_PARTY } from '../../state/content'
import { useGame } from '../../state/game'
import { useQuality } from '../../state/quality'
import Instances from '../lib/Instances'
import { MATERIALS, useDisposable } from '../lib/resources'
import { padBeamMaterial, padDiscMaterial } from '../lib/shaders'
import { canvasTexture, drawSlotLabel } from '../lib/textures'
import { SLOTS } from './layout'

const PAD_TINT = '#ffe2a0'
const LABEL_W = 4.4
const LABEL_H = LABEL_W * (5 / 8)
const LABEL_Y = 4.3

/** Online: what the server says is on the slot. */
function onlineSlotState(s) {
  if (s.host) {
    const difficulty = DIFFICULTIES.find((d) => d.id === s.difficulty)
    const full = s.members.length >= s.size
    return {
      count: s.members.length,
      max: s.size,
      tag: difficulty?.label.toUpperCase(),
      tagColor: difficulty?.color,
      hint: full ? `Full · starting in ${s.left}s` : `Join! Starting in ${s.left}s`,
      active: true,
    }
  }
  if (s.standing) return { count: s.standing, max: MAX_PARTY, hint: 'Setting up…', active: true }
  return { count: 0, max: MAX_PARTY, hint: 'Touch to create a party', active: false }
}

/** What a slot's label should say, from the stores. */
function slotState(slotId, { activeSlot, hosted }, net = useNet.getState()) {
  const online = net.slots[slotId]
  if (online) return onlineSlotState(online)
  if (hosted && hosted.slot === slotId) {
    const difficulty = DIFFICULTIES.find((d) => d.id === hosted.difficulty)
    return {
      count: 1,
      max: hosted.size,
      tag: difficulty?.label.toUpperCase(),
      tagColor: difficulty?.color,
      hint: 'Starting soon…',
      active: true,
    }
  }
  if (activeSlot === slotId) return { count: 1, max: MAX_PARTY, hint: 'Setting up…', active: true }
  return { count: 0, max: MAX_PARTY, hint: 'Touch to create a party', active: false }
}

const stateKey = (st) => `${st.count}/${st.max}|${st.tag || ''}|${st.hint}`

/**
 * The party slots: a row of glowing pads with "0/4 Touch to create a party" labels.
 * Standing on one opens the create-party panel; every slot leads to the same map.
 * The zone watcher writes `activeSlot`; this component only reacts to the store.
 */
export function PartySlots({ models }) {
  const texSize = useQuality((s) => s.settings.texSize)

  const pads = useMemo(() => SLOTS.map((s) => ({ x: s.x, y: 0.05, z: s.z })), [])
  const tints = useMemo(() => SLOTS.map(() => PAD_TINT), [])
  const labelSpots = useMemo(() => SLOTS.map((s) => [s.x, LABEL_Y, s.z]), [])

  const materials = useDisposable(() => ({ disc: padDiscMaterial(), beam: padBeamMaterial() }), [])

  const labels = useDisposable(
    () =>
      SLOTS.map((slot) => {
        const st = slotState(slot.id, useGame.getState())
        const map = canvasTexture(texSize, Math.round(texSize * 0.625), (ctx, w, h) => drawSlotLabel(ctx, w, h, st))
        map.stateKey = stateKey(st)
        return { map, material: new SpriteMaterial({ map, transparent: true, depthWrite: false }) }
      }),
    [texSize],
  )

  // Redraw labels and light pads only when the slot state actually changes.
  useLayoutEffect(() => {
    const apply = (state) => {
      SLOTS.forEach((slot, i) => {
        const st = slotState(slot.id, state)
        const on = st.active ? 1 : 0
        models.padDisc.attributes.aActive.setX(i, on)
        models.padBeam.attributes.aActive.setX(i, on)
        const key = stateKey(st)
        if (labels[i].map.stateKey !== key) {
          labels[i].map.stateKey = key
          labels[i].map.redraw((ctx, w, h) => drawSlotLabel(ctx, w, h, st))
        }
      })
      models.padDisc.attributes.aActive.needsUpdate = true
      models.padBeam.attributes.aActive.needsUpdate = true
    }
    apply(useGame.getState())
    const offGame = useGame.subscribe((state, prev) => {
      if (state.activeSlot !== prev.activeSlot || state.hosted !== prev.hosted) apply(state)
    })
    const offNet = useNet.subscribe((state, prev) => {
      if (state.slots !== prev.slots) apply(useGame.getState())
    })
    return () => {
      offGame()
      offNet()
    }
  }, [models, labels])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    materials.disc.uniforms.uTime.value = t
    materials.beam.uniforms.uTime.value = t
  })

  return (
    <>
      <Instances geometry={models.slotBase} material={MATERIALS.scenery} items={SLOTS} castShadow receiveShadow />
      <Instances geometry={models.padDisc} material={materials.disc} items={pads} colors={tints} renderOrder={2} />
      <Instances geometry={models.padBeam} material={materials.beam} items={pads} colors={tints} renderOrder={3} />
      {labels.map((label, i) => (
        <sprite key={i} material={label.material} position={labelSpots[i]} scale={[LABEL_W, LABEL_H, 1]} />
      ))}
    </>
  )
}

export default PartySlots
