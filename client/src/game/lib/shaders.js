import { AdditiveBlending, BackSide, Color, DoubleSide, ShaderMaterial } from 'three'

/**
 * Small custom shaders. Each takes `uTime` as a uniform, advanced from the frame loop
 * by mutating `.value` (no allocations, no React state).
 *
 * Colours are linear (three converts '#hex' when building a Color) and every fragment
 * shader ends in <colorspace_fragment> so output matches the rest of the scene.
 */

const INSTANCED_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vActive;
  attribute float aActive;
  uniform float uTime;

  void main() {
    vUv = uv;
    vColor = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #endif
    vActive = aActive;
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * p;
  }
`

/** Glowing disc of a party slot. */
export function padDiscMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: INSTANCED_VERTEX,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vActive;

      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.78, 0.86, r) * (1.0 - smoothstep(0.94, 1.0, r));
        float pulse = fract(r * 1.5 - uTime * (0.5 + vActive * 0.7));
        float waves = smoothstep(0.0, 0.08, pulse) * (1.0 - smoothstep(0.08, 0.3, pulse)) * (1.0 - r);
        float fill = (1.0 - r) * 0.18;
        float a = ring * (0.85 + vActive * 0.15) + waves * (0.35 + vActive * 0.4) + fill * (1.0 + vActive);
        gl_FragColor = vec4(vColor * (1.2 + vActive * 0.6), clamp(a, 0.0, 1.0));
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

/** Soft light column rising from each party slot. */
export function padBeamMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: INSTANCED_VERTEX,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vActive;

      void main() {
        float fade = pow(1.0 - vUv.y, 2.2);
        float shimmer = 0.75 + 0.25 * sin(uTime * 2.0 + vUv.x * 40.0 + vUv.y * 6.0);
        float a = fade * shimmer * (0.32 + vActive * 0.38);
        gl_FragColor = vec4(vColor * 1.3, a);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  })
}

/** Fountain water: drifting ripples with a bright sparkle. */
export function waterMaterial(color) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(color) } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vWorld;
      void main() {
        float d = length(vWorld.xz);
        float rip = sin(d * 7.0 - uTime * 2.2) * 0.5 + 0.5;
        float cross = sin(vWorld.x * 3.1 + uTime * 0.9) * sin(vWorld.z * 2.7 - uTime * 1.1);
        vec3 col = uColor * (0.8 + rip * 0.25 + cross * 0.1);
        float sparkle = smoothstep(0.92, 1.0, rip * (0.6 + 0.4 * cross));
        col += vec3(0.8, 0.9, 1.0) * sparkle * 0.5;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
}

/** Falling-water curtain: streaks moving downwards, fading at the bottom. */
export function curtainMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float streak = sin(vUv.x * 120.0) * 0.5 + 0.5;
        float flow = fract(vUv.y * 3.0 + uTime * 1.6);
        float a = (0.18 + streak * 0.22) * (0.6 + 0.4 * flow) * smoothstep(0.0, 0.25, vUv.y);
        gl_FragColor = vec4(vec3(0.75, 0.9, 1.0), a);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
}

/** Three-stop dusk gradient dome. */
export function skyMaterial({ top, mid, horizon, bottom }) {
  return new ShaderMaterial({
    uniforms: {
      uTop: { value: new Color(top) },
      uMid: { value: new Color(mid) },
      uHorizon: { value: new Color(horizon) },
      uBottom: { value: new Color(bottom) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 col;
        if (h < 0.0) {
          col = mix(uHorizon, uBottom, smoothstep(0.0, 0.06, -h));
        } else {
          col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, h));
          col = mix(col, uTop, smoothstep(0.15, 0.7, h));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    depthWrite: false,
    fog: false,
  })
}

const POINTS_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <colorspace_fragment>
  }
`

/** Twinkling stars. Position attribute holds directions on the sky sphere. */
export function starsMaterial(pixelRatio) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: pixelRatio } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float tw = 0.65 + 0.35 * sin(uTime * (0.8 + aSeed * 2.0) + aSeed * 40.0);
        float height = normalize(position).y;
        vAlpha = tw * smoothstep(0.02, 0.25, height);
        vColor = mix(vec3(1.0, 0.92, 0.8), vec3(0.8, 0.88, 1.0), aSeed);
        gl_PointSize = (1.5 + aSeed * 2.5) * uScale;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: POINTS_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  })
}

/** Fireflies drifting around the wall and gardens. `pxScale` = canvas half-height in px. */
export function firefliesMaterial(pxScale) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: pxScale } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * (0.25 + aSeed * 0.35) + aSeed * 30.0;
        p.x += sin(t * 1.3) * 0.9;
        p.y += sin(t * 2.1) * 0.35;
        p.z += cos(t * 1.1) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vAlpha = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.5 + aSeed) + aSeed * 20.0), 3.0);
        vColor = vec3(1.0, 0.85, 0.4);
        gl_PointSize = 0.3 * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: POINTS_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

/** Soft warm halos around lanterns and torches. aSize is world metres; `pxScale` = canvas half-height in px. */
/** Falling snow: points drift down and wrap, swaying a little. One draw call. */
export function snowMaterial(pxScale, height) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: pxScale }, uHeight: { value: height } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uScale;
      uniform float uHeight;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - uTime * (0.7 + aSeed * 0.9), uHeight);
        p.x += sin(uTime * 0.7 + aSeed * 12.0) * 0.6;
        p.z += cos(uTime * 0.5 + aSeed * 9.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vAlpha = 0.9;
        gl_PointSize = (0.06 + aSeed * 0.08) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        if (d > 0.25) discard;
        gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha * (1.0 - d * 4.0));
      }
    `,
    transparent: true,
    depthWrite: false,
  })
}

export function halosMaterial(pxScale, color = new Color(1.0, 0.72, 0.38)) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: pxScale }, uColor: { value: color } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uTime;
      uniform float uScale;
      uniform vec3 uColor;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float flicker = 0.85 + 0.15 * sin(uTime * 7.0 + position.x * 3.0) * sin(uTime * 4.3 + position.z);
        vAlpha = 0.4 * flicker;
        vColor = uColor;
        gl_PointSize = aSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: POINTS_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}
