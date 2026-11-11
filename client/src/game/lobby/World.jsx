import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { useQuality } from '../../state/quality'
import Instances from '../lib/Instances'
import { D2R, mulberry32, polar } from '../lib/kit'
import { MATERIALS, useDisposable } from '../lib/resources'
import { curtainMaterial, halosMaterial, waterMaterial } from '../lib/shaders'
import { cobbleTexture, flagstoneTexture, grassTexture } from '../lib/textures'
import { CANOPY_COLORS, FLOWER_COLORS, PALETTE, ROOF_COLORS } from '../sceneStyle'
import {
  BENCHES,
  BUSHES,
  CASTLE_POSITION,
  FOUNTAIN_RADIUS,
  HOUSES,
  LAMPS,
  PINES,
  PLANTERS,
  PLAZA_RADIUS,
  ROUND_TREES,
  SLOT_BAND,
} from './layout'
import { FOUNTAIN_COIN_Y } from './models/props'

/** Flat disc with UVs in world units / tile, so textures keep a fixed real-world size. */
function worldDisc(radius, segments, tile) {
  const g = new CircleGeometry(radius, segments)
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i) / tile, -pos.getZ(i) / tile)
  return g
}

const _pathColor = new Color()

/** Non-indexed copy with world-space UVs and a flat vertex colour. */
function decorate(geometry, color, tile) {
  const g = geometry.toNonIndexed()
  geometry.dispose()
  const pos = g.attributes.position
  const uv = g.attributes.uv
  const colors = new Float32Array(pos.count * 3)
  _pathColor.set(color)
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(i, pos.getX(i) / tile, -pos.getZ(i) / tile)
    colors.set([_pathColor.r, _pathColor.g, _pathColor.b], i * 3)
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  return g
}

/**
 * Flagstone ring round the fountain and four paths out to the portals, leaderboards,
 * stalls and spawn, each with a darker kerb. One mesh, one texture.
 */
function buildPlazaPaths() {
  const tile = 3.2
  const kerb = '#8a7a6c'
  const parts = []
  const ring = (inner, outer, color, y) => {
    const g = new RingGeometry(inner, outer, 64)
    g.rotateX(-Math.PI / 2)
    g.translate(0, y, 0)
    parts.push(decorate(g, color, tile))
  }
  ring(FOUNTAIN_RADIUS + 0.6, 7.4, '#ffffff', 0)
  ring(7.4, 7.85, kerb, 0)
  const path = (deg, from, to, width) => {
    for (const [w, color, y] of [
      [width + 0.7, kerb, 0.01],
      [width, '#ffffff', 0.03], // above the slot band so the path flows into it
    ]) {
      const g = new PlaneGeometry(w, to - from)
      g.rotateX(-Math.PI / 2)
      g.rotateY(-deg * D2R)
      const [x, z] = polar((from + to) / 2, deg)
      g.translate(x, y, z)
      parts.push(decorate(g, color, tile))
    }
  }
  // Arc-shaped "party plaza" band under the slots (RingGeometry angle 90 deg = north).
  const band = (inner, outer, color, y) => {
    const span = SLOT_BAND.halfDeg * 2 * D2R
    const g = new RingGeometry(inner, outer, 48, 1, (90 - SLOT_BAND.halfDeg) * D2R, span)
    g.rotateX(-Math.PI / 2)
    g.translate(0, y, 0)
    parts.push(decorate(g, color, tile))
  }
  band(SLOT_BAND.inner - 0.45, SLOT_BAND.outer + 0.45, kerb, 0.02)
  band(SLOT_BAND.inner, SLOT_BAND.outer, '#ffffff', 0.025)
  path(0, 7.0, SLOT_BAND.inner + 0.2, 3.2)
  path(180, 7.0, 25.2, 3.2)
  path(-90, 7.0, 16.6, 3.0)
  path(90, 7.0, 15.8, 3.0)
  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  return merged
}

/** Grass field, the cobbled plaza, flagstone paths and the plaza wall. */
export function Ground({ models }) {
  const texSize = useQuality((s) => s.settings.texSize)

  const grass = useDisposable(() => {
    const map = grassTexture(texSize <= 512 ? 256 : 512)
    return {
      map,
      geometry: worldDisc(420, 48, 7),
      material: new MeshLambertMaterial({ map }),
    }
  }, [texSize])

  const plaza = useDisposable(() => {
    const map = cobbleTexture(texSize)
    return {
      map,
      geometry: worldDisc(PLAZA_RADIUS + 1.3, 72, 3.4),
      material: new MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2 }),
    }
  }, [texSize])

  const paths = useDisposable(() => {
    const map = flagstoneTexture(Math.min(512, texSize))
    return {
      map,
      geometry: buildPlazaPaths(),
      material: new MeshLambertMaterial({ map, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4 }),
    }
  }, [texSize])

  return (
    <>
      <mesh geometry={grass.geometry} material={grass.material} receiveShadow />
      <mesh geometry={plaza.geometry} material={plaza.material} position={[0, 0.02, 0]} receiveShadow />
      <mesh geometry={paths.geometry} material={paths.material} position={[0, 0.03, 0]} receiveShadow />
      {models.wall && <mesh geometry={models.wall} material={MATERIALS.scenery} castShadow receiveShadow />}
    </>
  )
}

const GREENS = ['#6fae5a', '#5d9a4f', '#7cb862', '#4f8f4a']
/** LOW draws only the nearer forest; the far ring sits in fog anyway. */
const NEAR_PINES = PINES.filter((p) => p.r < 72)

/** Houses, trees, bushes, flowers, hills and the castle outside the wall. */
export function Village({ models }) {
  const details = useQuality((s) => s.settings.details)

  const houseSets = useMemo(
    () =>
      [0, 1].map((variant) => {
        const items = HOUSES.filter((h) => h.variant === variant)
        return {
          items,
          roofs: items.map((h) => ROOF_COLORS[h.roof % ROOF_COLORS.length]),
          // A couple of houses with their lights turned down.
          lights: items.map((h) => (h.roof % 5 === 3 ? '#5a4a3a' : '#ffffff')),
        }
      }),
    [],
  )
  const canopy = useMemo(() => ROUND_TREES.map((t) => CANOPY_COLORS[Math.floor(t.k * CANOPY_COLORS.length)]), [])
  const bushColors = useMemo(() => BUSHES.map((b) => GREENS[Math.floor(b.k * GREENS.length)]), [])

  const flowers = useMemo(() => {
    const rand = mulberry32(3)
    const items = []
    for (const pl of PLANTERS) {
      for (let i = 0; i < 9; i += 1) {
        const lx = -1.25 + i * 0.31
        const lz = (rand() - 0.5) * 0.5
        const c = Math.cos(pl.ry)
        const s = Math.sin(pl.ry)
        items.push({ x: pl.x + lx * c + lz * s, y: 0.62, z: pl.z - lx * s + lz * c, ry: rand() * 6, scale: 1.2 + rand() * 0.4 })
      }
    }
    for (let i = 0; i < 90; i += 1) {
      const [x, z] = polar(28.7 + rand() * 4.5, rand() * 360)
      items.push({ x, z, ry: rand() * 6, scale: 0.9 + rand() * 0.6 })
    }
    return { items, colors: items.map((_, i) => FLOWER_COLORS[i % FLOWER_COLORS.length]) }
  }, [])

  return (
    <>
      <mesh geometry={models.mountains} material={MATERIALS.scenery} />
      <mesh geometry={models.castle} material={MATERIALS.scenery} position={CASTLE_POSITION} />

      {houseSets.map((set, variant) => (
        <group key={variant}>
          <Instances geometry={models.houses[variant].body} material={MATERIALS.scenery} items={set.items} />
          <Instances
            geometry={models.houses[variant].roof}
            material={MATERIALS.scenery}
            items={set.items}
            colors={set.roofs}
          />
          <Instances
            geometry={models.houses[variant].glow}
            material={MATERIALS.glow}
            items={set.items}
            colors={set.lights}
          />
        </group>
      ))}

      <Instances geometry={models.pine} material={MATERIALS.scenery} items={details ? PINES : NEAR_PINES} />
      <Instances geometry={models.roundTree} material={MATERIALS.scenery} items={ROUND_TREES} colors={canopy} />
      <Instances geometry={models.bush} material={MATERIALS.scenery} items={BUSHES} colors={bushColors} />
      {details && (
        <Instances geometry={models.flower} material={MATERIALS.scenery} items={flowers.items} colors={flowers.colors} />
      )}
    </>
  )
}

const ORBIT_COINS = 10
const _coin = new Object3D()

/** Fountain, coins circling it, lamps, benches, props and every glowing light. */
export function PlazaProps({ models }) {
  const settings = useQuality((s) => s.settings)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const bigCoinRef = useRef(null)
  const coinsRef = useRef(null)

  const water = useDisposable(() => waterMaterial(PALETTE.water), [])
  const curtain = useDisposable(() => (settings.particles ? curtainMaterial() : null), [settings.particles])
  const halos = useDisposable(() => {
    if (!settings.particles) return null
    const list = models.glow.halos
    const positions = new Float32Array(list.length * 3)
    const sizes = new Float32Array(list.length)
    list.forEach(([x, y, z, s], i) => {
      positions.set([x, y, z], i * 3)
      sizes[i] = s
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1))
    return { geometry, material: halosMaterial((size.height * dpr) / 2) }
  }, [settings.particles, models])

  useLayoutEffect(() => {
    if (halos) halos.material.uniforms.uScale.value = (size.height * dpr) / 2
  }, [halos, size.height, dpr])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    water.uniforms.uTime.value = t
    if (curtain) curtain.uniforms.uTime.value = t
    if (halos) halos.material.uniforms.uTime.value = t
    if (bigCoinRef.current) {
      bigCoinRef.current.rotation.y = t * 0.8
      bigCoinRef.current.position.y = FOUNTAIN_COIN_Y + Math.sin(t * 1.4) * 0.12
    }
    const coins = coinsRef.current
    if (coins) {
      for (let i = 0; i < ORBIT_COINS; i += 1) {
        const a = t * 0.35 + (i / ORBIT_COINS) * Math.PI * 2
        _coin.position.set(Math.cos(a) * 2.1, 3.9 + Math.sin(t * 1.6 + i) * 0.18, Math.sin(a) * 2.1)
        _coin.rotation.set(0, t * 2 + i, 0)
        _coin.updateMatrix()
        coins.setMatrixAt(i, _coin.matrix)
      }
      coins.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <mesh geometry={models.fountain} material={MATERIALS.scenery} castShadow receiveShadow />
      <mesh geometry={models.water} material={water} />
      {curtain && <mesh geometry={models.curtain} material={curtain} />}
      <mesh ref={bigCoinRef} geometry={models.bigCoin} material={MATERIALS.metal} position={[0, FOUNTAIN_COIN_Y, 0]} castShadow />
      <instancedMesh
        ref={coinsRef}
        args={[models.coin, MATERIALS.metal, ORBIT_COINS]}
        frustumCulled={false}
      />

      <Instances geometry={models.lamp} material={MATERIALS.scenery} items={LAMPS} castShadow />
      <Instances geometry={models.bench} material={MATERIALS.scenery} items={BENCHES} castShadow receiveShadow />
      <mesh geometry={models.props} material={MATERIALS.scenery} castShadow receiveShadow />

      <mesh geometry={models.glow.geometry} material={MATERIALS.glow} />
      {halos && <points geometry={halos.geometry} material={halos.material} frustumCulled={false} />}
    </>
  )
}
