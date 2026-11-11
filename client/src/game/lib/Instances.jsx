import { useLayoutEffect, useRef } from 'react'
import { Color, Object3D } from 'three'

const _dummy = new Object3D()
const _color = new Color()

/**
 * One InstancedMesh for a list of placements `{ x, y?, z, ry?, scale? }`.
 * Matrices (and optional per-instance colours) are written once, before first render.
 *
 * @param {{ geometry, material, items: object[], colors?: string[] }} props
 */
export function Instances({ geometry, material, items, colors, ...props }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((item, i) => {
      _dummy.position.set(item.x, item.y ?? 0, item.z)
      _dummy.rotation.set(0, item.ry ?? 0, 0)
      _dummy.scale.setScalar(item.scale ?? 1)
      _dummy.updateMatrix()
      mesh.setMatrixAt(i, _dummy.matrix)
      if (colors) mesh.setColorAt(i, _color.set(colors[i % colors.length]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.computeBoundingBox()
  }, [items, colors])

  return <instancedMesh ref={ref} args={[geometry, material, items.length]} {...props} />
}

export default Instances
