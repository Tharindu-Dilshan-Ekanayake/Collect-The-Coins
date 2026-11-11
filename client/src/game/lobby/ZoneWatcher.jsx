import { useEffect } from 'react'

import { useGame } from '../../state/game'
import { PAD_RADIUS, SLOTS, SPAWN } from './layout'

const TICK_MS = 100

/**
 * Checks, ten times a second, whether the player is standing on a party slot, and writes that to the store only when it changes.
 *
 * Deliberately an interval, not useFrame: store updates never happen inside the
 * render loop.
 *
 * @param {{ bodyRef: React.MutableRefObject<any> }} props the player's rigid body
 */
export function ZoneWatcher({ bodyRef }) {
  useEffect(() => {
    const id = setInterval(() => {
      const body = bodyRef.current
      if (!body) return
      const p = body.translation()

      // Safety net: anything that falls out of the world goes back to spawn.
      if (p.y < -20) {
        body.setTranslation({ x: SPAWN[0], y: SPAWN[1] + 1, z: SPAWN[2] }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        return
      }

      let slot = null
      for (const s of SLOTS) {
        if (Math.hypot(p.x - s.x, p.z - s.z) < PAD_RADIUS) {
          slot = s.id
          break
        }
      }

      const game = useGame.getState()
      game.setActiveSlot(slot)
    }, TICK_MS)

    return () => {
      clearInterval(id)
      const game = useGame.getState()
      game.setActiveSlot(null)
    }
  }, [bodyRef])

  return null
}

export default ZoneWatcher
