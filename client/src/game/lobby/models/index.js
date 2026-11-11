import { CircleGeometry, CylinderGeometry, InstancedBufferAttribute, PlaneGeometry } from 'three'

import { PAD_RADIUS, SLOTS } from '../layout'
import { buildCastle, buildHouse, buildWall } from './buildings'
import { buildBush, buildFlower, buildMountains, buildPine, buildRoundTree } from './nature'
import {
  BOARD_FACE,
  buildBench,
  buildBoardFrame,
  buildCoin,
  buildFountain,
  buildFountainWater,
  buildLamp,
  buildSlotBase,
  buildProps,
  buildStaticGlow,
  buildTrophy,
  buildWaterCurtain,
} from './props'
import { WALL_RADIUS } from '../layout'

function withActiveAttribute(geometry) {
  geometry.setAttribute('aActive', new InstancedBufferAttribute(new Float32Array(SLOTS.length), 1))
  return geometry
}

/**
 * What the first lobby frame needs: the party slots (the plaza wall's collision is code). Built on mount;
 * nothing here depends on the quality preset.
 */
export function buildCoreModels() {
  const padDisc = new CircleGeometry(PAD_RADIUS + 0.15, 48)
  padDisc.rotateX(-Math.PI / 2)
  const padBeam = new CylinderGeometry(PAD_RADIUS, PAD_RADIUS, 2.8, 40, 1, true)
  padBeam.translate(0, 1.4, 0)
  return {
    slotBase: buildSlotBase(),
    padDisc: withActiveAttribute(padDisc),
    padBeam: withActiveAttribute(padBeam),
  }
}

/**
 * The scenery: village, castle, mountains, trees, plaza props and leaderboards. Built
 * one step at a time after the lobby is playable (see LobbyScene), so it never delays
 * the first frame and never blocks the main thread for long.
 */
export const SCENERY_STEPS = [
  ['wall', () => buildWall(WALL_RADIUS)],
  ['mountains', buildMountains],
  ['castle', buildCastle],
  ['houses', () => [buildHouse(0), buildHouse(1)]],
  ['pine', buildPine],
  ['roundTree', buildRoundTree],
  ['bush', buildBush],
  ['flower', buildFlower],
  ['lamp', buildLamp],
  ['bench', buildBench],
  ['fountain', buildFountain],
  ['water', buildFountainWater],
  ['curtain', buildWaterCurtain],
  ['coin', () => buildCoin(0.26)],
  ['bigCoin', () => buildCoin(0.78)],
  ['boardFrame', buildBoardFrame],
  ['boardFace', () => new PlaneGeometry(BOARD_FACE.width, BOARD_FACE.height)],
  ['trophy', buildTrophy],
  ['props', buildProps],
  ['glow', () => buildStaticGlow([])],
]
