import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'

import { useQuality } from '../../state/quality'
import { Kit, mulberry32, polar } from '../lib/kit'
import { useDisposable } from '../lib/resources'
import { firefliesMaterial, skyMaterial, starsMaterial } from '../lib/shaders'
import { SKY } from '../sceneStyle'

const MOON_DIRECTION = new Vector3(0.42, 0.34, -0.84).normalize()
const _worldPos = new Vector3()

function moonMaterial() {
  return new ShaderMaterial({
    uniforms: { uMoon: { value: new Color('#fff3d6') }, uGlow: { value: new Color('#c9b8ff') } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoon;
      uniform vec3 uGlow;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float d = length(p) * 2.0;
        float disc = smoothstep(0.255, 0.245, d);
        float craters = 0.06 * (sin(p.x * 60.0) * sin(p.y * 50.0 + 1.3) + sin((p.x + p.y) * 35.0));
        vec3 moon = uMoon * (0.93 + craters);
        float glow = exp(-d * 4.5) * 0.55;
        vec3 col = mix(uGlow * glow, moon, disc);
        gl_FragColor = vec4(col, max(disc, glow));
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
  })
}

function buildStars(count, radius) {
  const rand = mulberry32(5)
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    // Uniform on the upper hemisphere, biased away from the horizon.
    const y = 0.05 + Math.pow(rand(), 0.8) * 0.95
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(1 - y * y)
    positions[i * 3] = Math.cos(a) * r * radius
    positions[i * 3 + 1] = y * radius
    positions[i * 3 + 2] = Math.sin(a) * r * radius
    seeds[i] = rand()
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(positions, 3))
  g.setAttribute('aSeed', new BufferAttribute(seeds, 1))
  return g
}

function buildClouds(radius) {
  const k = new Kit(31)
  for (let i = 0; i < 9; i += 1) {
    const deg = i * 40 + k.rand() * 20
    const [x, z] = polar(radius * (0.75 + k.rand() * 0.15), deg)
    const y = radius * (0.2 + k.rand() * 0.14)
    const size = 12 + k.rand() * 10
    k.group({ p: [x, y, z], r: [0, -deg * (Math.PI / 180), 0] }, (g) => {
      for (let p = 0; p < 5; p += 1) {
        const along = (p - 2) * size * 0.75
        const s = size * (1 - Math.abs(p - 2) * 0.18)
        g.ico(1, (c) => (c.y > y ? '#a79ccc' : '#6d6699'), {
          p: [along, (k.rand() - 0.3) * size * 0.2, 0],
          s: [s, s * 0.32, s * 0.55],
        }, 0.06, 1)
      }
    })
  }
  return k.build()
}

/**
 * Sky dome, moon, stars and clouds all live in one group that follows the camera, so
 * the horizon always sits at eye level and nothing can be walked out of.
 */
export function Atmosphere() {
  const settings = useQuality((s) => s.settings)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const radius = Math.min(300, settings.viewDistance * 0.85)
  const groupRef = useRef(null)
  const moonRef = useRef(null)
  const cloudsRef = useRef(null)

  const sky = useDisposable(
    () => ({ geometry: new SphereGeometry(radius, 32, 16), material: skyMaterial(SKY) }),
    [radius],
  )
  const moon = useDisposable(() => ({ geometry: new PlaneGeometry(1, 1), material: moonMaterial() }), [])
  const stars = useDisposable(
    () =>
      settings.particles
        ? { geometry: buildStars(settings.name === 'high' ? 900 : 550, radius * 0.95), material: starsMaterial(dpr) }
        : null,
    [settings.particles, settings.name, radius, dpr],
  )
  const clouds = useDisposable(
    () =>
      settings.details
        ? { geometry: buildClouds(radius), material: new MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.85 }) }
        : null,
    [settings.details, radius],
  )
  const fireflies = useDisposable(() => {
    if (!settings.particles) return null
    const count = settings.name === 'high' ? 120 : 70
    const rand = mulberry32(17)
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i += 1) {
      const [x, z] = polar(21 + rand() * 24, rand() * 360)
      positions.set([x, 0.6 + rand() * 3.2, z], i * 3)
      seeds[i] = rand()
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1))
    return { geometry, material: firefliesMaterial((size.height * dpr) / 2) }
  }, [settings.particles, settings.name])

  useLayoutEffect(() => {
    if (fireflies) fireflies.material.uniforms.uScale.value = (size.height * dpr) / 2
  }, [fireflies, size.height, dpr])

  useLayoutEffect(() => {
    const moonMesh = moonRef.current
    const group = groupRef.current
    if (!moonMesh || !group) return
    moonMesh.position.copy(MOON_DIRECTION).multiplyScalar(radius * 0.88)
    moonMesh.scale.setScalar(radius * 0.22)
    group.updateMatrixWorld(true)
    moonMesh.lookAt(group.getWorldPosition(_worldPos))
  }, [radius])

  useFrame((state, delta) => {
    groupRef.current?.position.copy(camera.position)
    const t = state.clock.elapsedTime
    if (stars) stars.material.uniforms.uTime.value = t
    if (fireflies) fireflies.material.uniforms.uTime.value = t
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.004
  })

  return (
    <>
      <group ref={groupRef}>
        <mesh geometry={sky.geometry} material={sky.material} renderOrder={-10} frustumCulled={false} />
        <mesh ref={moonRef} geometry={moon.geometry} material={moon.material} renderOrder={-9} />
        {stars && (
          <points geometry={stars.geometry} material={stars.material} renderOrder={-8} frustumCulled={false} />
        )}
        {clouds && (
          <mesh ref={cloudsRef} geometry={clouds.geometry} material={clouds.material} renderOrder={-7} />
        )}
      </group>
      {fireflies && (
        <points geometry={fireflies.geometry} material={fireflies.material} frustumCulled={false} />
      )}
    </>
  )
}

export default Atmosphere

