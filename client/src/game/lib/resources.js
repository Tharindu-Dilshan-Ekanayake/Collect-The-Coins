import { useEffect, useMemo } from 'react'
import { MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial } from 'three'

import { PALETTE } from '../sceneStyle'

/**
 * Shared materials. Module-level so every mesh reuses the same few shader programs.
 * Lambert + flat shading is both the cheapest lit material and the low-poly look.
 */
export const MATERIALS = {
  /** Vertex-coloured scenery. With an instanceColor attribute it doubles as the tint material. */
  scenery: new MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  /** Unlit warm windows, lantern cores and flames. */
  glow: new MeshBasicMaterial({ vertexColors: true }),
  /** Trophies and coins: Phong gives a cheap specular glint without an env map. */
  metal: new MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 70,
    specular: '#fff3c4',
    emissive: '#3a2600',
  }),
  gold: new MeshPhongMaterial({
    color: PALETTE.gold,
    shininess: 80,
    specular: '#fff6d0',
    emissive: '#5a3a00',
  }),
}

/** Frees every shared material's GPU program. They re-upload on next use. */
export function disposeSharedMaterials() {
  for (const material of Object.values(MATERIALS)) material.dispose()
}

export function disposeDeep(value) {
  if (!value) return
  if (typeof value.dispose === 'function') {
    value.dispose()
    return
  }
  if (Array.isArray(value)) value.forEach(disposeDeep)
  else if (typeof value === 'object') Object.values(value).forEach(disposeDeep)
}

/**
 * `useMemo` for GPU resources (geometries, textures, materials, or an object/array of
 * them) that disposes the previous value when deps change and on unmount.
 */
export function useDisposable(factory, deps) {
  // Deps are forwarded from the caller, like any custom memo hook.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const value = useMemo(factory, deps)
  useEffect(() => () => disposeDeep(value), [value])
  return value
}
