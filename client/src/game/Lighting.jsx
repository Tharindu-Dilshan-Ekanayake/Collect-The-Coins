import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { useQuality } from '../state/quality'
import { LIGHTS } from './sceneStyle'

const KEY_DIRECTION = new Vector3(...LIGHTS.keyDirection).normalize()
const FILL_POSITION = new Vector3(...LIGHTS.fillDirection).normalize().multiplyScalar(50).toArray()
/** How far back along KEY_DIRECTION the light sits from the point it shadows. */
const KEY_DISTANCE = 50
/** Half-size of the square area around the player that receives shadows. */
const SHADOW_EXTENT = 22
const KEY_START = KEY_DIRECTION.clone().multiplyScalar(KEY_DISTANCE).toArray()

/**
 * Dusk lighting: violet hemisphere fill, a cool key light (the only shadow caster,
 * and only on MEDIUM/HIGH) and a warm low fill from the far side.
 *
 * The key light's shadow box follows the player so shadows exist wherever they walk.
 *
 * @param {{ followRef: React.MutableRefObject<any> }} props the player's rigid body
 */
export function Lighting({ followRef }) {
  const keyRef = useRef(null)
  const scene = useThree((s) => s.scene)
  const { shadows, shadowMapSize } = useQuality((s) => s.settings)

  useLayoutEffect(() => {
    const key = keyRef.current
    if (!key) return undefined
    const cam = key.shadow.camera
    cam.left = -SHADOW_EXTENT
    cam.right = SHADOW_EXTENT
    cam.top = SHADOW_EXTENT
    cam.bottom = -SHADOW_EXTENT
    cam.near = 1
    cam.far = KEY_DISTANCE * 2
    cam.updateProjectionMatrix()
    // The target has to be in the scene for its matrix to update as it moves.
    scene.add(key.target)
    return () => {
      scene.remove(key.target)
    }
  }, [scene, shadows, shadowMapSize])

  useFrame(() => {
    const key = keyRef.current
    const body = followRef.current
    if (!key || !body) return
    const p = body.translation()
    key.target.position.set(p.x, 0, p.z)
    key.position.copy(key.target.position).addScaledVector(KEY_DIRECTION, KEY_DISTANCE)
  })

  return (
    <>
      <hemisphereLight args={[LIGHTS.hemiSky, LIGHTS.hemiGround, LIGHTS.hemiIntensity]} />
      <directionalLight
        // Remount when the map size changes: three can't resize a live shadow map.
        key={shadows ? shadowMapSize : 'off'}
        ref={keyRef}
        castShadow={shadows}
        color={LIGHTS.keyColor}
        intensity={LIGHTS.keyIntensity}
        position={KEY_START}
        shadow-mapSize={shadows ? [shadowMapSize, shadowMapSize] : [1, 1]}
        shadow-radius={LIGHTS.shadowSoftness}
        shadow-intensity={LIGHTS.shadowIntensity}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
      <directionalLight color={LIGHTS.fillColor} intensity={LIGHTS.fillIntensity} position={FILL_POSITION} />
    </>
  )
}

export default Lighting
