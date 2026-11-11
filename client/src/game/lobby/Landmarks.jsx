import { useMemo } from 'react'
import { MeshBasicMaterial } from 'three'

import { useQuality } from '../../state/quality'
import Instances from '../lib/Instances'
import { MATERIALS, useDisposable } from '../lib/resources'
import { canvasTexture, drawLeaderboard, drawStallSign } from '../lib/textures'
import { BOARDS, STALL_PLACES, toWorld } from './layout'
import { BOARD_FACE, STALL_SIGN, TROPHY_Y } from './models/props'

const TROPHY_COLORS = ['#d9dee6', '#ffcf3a', '#d08a4e']

/** Three wooden leaderboards with parchment faces and trophies on top. */
export function Leaderboards({ models }) {
  const texSize = useQuality((s) => s.settings.texSize)

  const faces = useDisposable(
    () =>
      BOARDS.map(({ board }) => {
        const map = canvasTexture(Math.round(texSize * 0.75), texSize, (ctx, w, h) =>
          drawLeaderboard(ctx, w, h, board),
        )
        // Unlit, as if lantern-lit: the rankings must stay readable at dusk.
        return { map, material: new MeshBasicMaterial({ map, color: '#efe6d6' }) }
      }),
    [texSize],
  )

  const facePlacements = useMemo(
    () =>
      BOARDS.map((b) => {
        const [x, z] = toWorld(b, 0, BOARD_FACE.z)
        return { position: [x, BOARD_FACE.y, z], rotation: [0, b.ry, 0] }
      }),
    [],
  )

  const trophies = useMemo(() => {
    const items = []
    const colors = []
    for (const b of BOARDS) {
      ;[-1.3, 0, 1.3].forEach((lx, i) => {
        const [x, z] = toWorld(b, lx, 0)
        items.push({ x, y: TROPHY_Y, z, ry: b.ry, scale: i === 1 ? 1.3 : 1 })
        colors.push(TROPHY_COLORS[i])
      })
    }
    return { items, colors }
  }, [])

  return (
    <>
      <Instances geometry={models.boardFrame} material={MATERIALS.scenery} items={BOARDS} castShadow receiveShadow />
      {faces.map((face, i) => (
        <mesh key={i} geometry={models.boardFace} material={face.material} {...facePlacements[i]} />
      ))}
      <Instances geometry={models.trophy} material={MATERIALS.metal} items={trophies.items} colors={trophies.colors} castShadow />
    </>
  )
}

/** The two market stalls and their painted signs. */
export function Stalls({ models }) {
  const texSize = useQuality((s) => s.settings.texSize)

  const signs = useDisposable(
    () =>
      STALL_PLACES.map(({ stall }) => {
        const map = canvasTexture(texSize, Math.round(texSize / 4), (ctx, w, h) => drawStallSign(ctx, w, h, stall))
        return { map, material: new MeshBasicMaterial({ map, color: '#f2e8da' }) }
      }),
    [texSize],
  )

  return (
    <>
      {STALL_PLACES.map((place, i) => (
        <group key={place.stall.id} position={[place.x, 0, place.z]} rotation={[0, place.ry, 0]}>
          <mesh geometry={models.stalls[i]} material={MATERIALS.scenery} castShadow receiveShadow />
          <mesh
            geometry={models.stallSign}
            material={signs[i].material}
            position={[0, STALL_SIGN.y, STALL_SIGN.z]}
          />
        </group>
      ))}
    </>
  )
}
