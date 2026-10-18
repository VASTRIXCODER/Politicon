'use client';

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DataTexture,
  FloatType,
  NearestFilter,
  NormalBlending,
  RGBAFormat,
  ShaderMaterial,
  Vector3,
  type Curve,
} from 'three';
import { useAnimated, useKitTier, useScenePalette } from '@/components/three/kit/hooks';

/*
 * Light that flows: N particles streaming along a set of curves, all on the
 * GPU (one draw call). The curves are sampled into a small float texture;
 * each particle reads its position from it in the vertex shader, so moving
 * twenty-five thousand of them costs a uniform update per frame.
 *
 *   free flow (no `progress`)  every particle loops along its curve at `speed`
 *   scrubbed (`progress` 0..1) a staggered wave: at 0 the particles wait at
 *       the curves' starts (a bill about to dissolve), as progress rises they
 *       stream along, and at 1 they have settled at the ends (a ledger)
 *
 * Counts are capped by tier (4k on tier 1, 25k on tier 2). By day particles
 * are violet ink on the paper (normal blending); by night they are light
 * (additive). Under reduced motion free flow holds still.
 */

const SAMPLES = 128;
const CAP: Record<1 | 2, number> = { 1: 4_000, 2: 25_000 };

type CurveInput = Curve<Vector3> | [number, number, number][];

export interface LightParticlesProps {
  /** Paths to flow along (curves, or point lists that become Catmull-Rom splines). Default: a fan of streams. */
  curves?: CurveInput[];
  /** Particles across all curves (capped by tier). */
  count?: number;
  /** Default: the palette's particle colour. */
  color?: string;
  /** Loops per second in free flow. */
  speed?: number;
  /** 0..1 drives a scrubbed dissolve/settle; a function is read every frame (no re-render). */
  progress?: number | (() => number);
  /** How far each particle may stray from its curve. */
  spread?: number;
  /** Point size in px at one unit from the camera, before the device pixel ratio. */
  size?: number;
  opacity?: number;
}

/**
 * A fan of gentle arcs from one point on the left to a column on the right
 * (a bill becoming a ledger), about 2.3 × 1.4 units around the origin.
 */
export function defaultCurves(): CurveInput[] {
  return Array.from({ length: 7 }, (_, i) => {
    const t = i / 6 - 0.5;
    return [
      [-1.2, 0.08 * t, 0],
      [-0.5, 0.42 + t * 0.7, 0.2 - Math.abs(t) * 0.25],
      [0.35, -0.15 + t * 0.95, -0.12 + t * 0.16],
      [1.1, t * 0.75, 0],
    ] as [number, number, number][];
  });
}

const VERTEX = /* glsl */ `
uniform sampler2D uCurves;
uniform float uSamples;
uniform float uTime;
uniform float uSpeed;
uniform float uProgress;
uniform float uScrubbed;
uniform float uStagger;
uniform float uSize;
uniform float uPixelRatio;
attribute float aCurve;
attribute float aOffset;
attribute float aSpeed;
attribute vec3 aJitter;
attribute float aScale;
varying float vAlpha;

vec3 curvePoint(float curve, float t) {
  float x = clamp(t, 0.0, 1.0) * (uSamples - 1.0);
  int i0 = int(floor(x));
  int i1 = min(i0 + 1, int(uSamples) - 1);
  int row = int(curve);
  vec3 a = texelFetch(uCurves, ivec2(i0, row), 0).xyz;
  vec3 b = texelFetch(uCurves, ivec2(i1, row), 0).xyz;
  return mix(a, b, fract(x));
}

void main() {
  float t;
  float alpha = 1.0;
  if (uScrubbed > 0.5) {
    // A wave: particle k leaves when progress passes its offset.
    t = clamp(uProgress * (1.0 + uStagger) - aOffset * uStagger, 0.0, 1.0);
  } else {
    t = fract(aOffset + uTime * uSpeed * aSpeed);
    alpha = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.86, 1.0, t));
  }
  vec3 p = curvePoint(aCurve, t);
  // Loose in flight, gathered at both ends.
  float loose = sin(3.14159265 * t);
  vec3 drift = vec3(
    sin(uTime * 0.9 + aOffset * 40.0),
    cos(uTime * 0.7 + aOffset * 31.0),
    sin(uTime * 0.8 + aOffset * 17.0)
  );
  p += aJitter * (0.2 + 0.8 * loose) + drift * 0.03 * loose;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * aScale * uPixelRatio / max(-mv.z, 0.1), 1.0, 48.0 * uPixelRatio);
  vAlpha = alpha;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  float a = core * core * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

function toCurve(c: CurveInput): Curve<Vector3> {
  return Array.isArray(c) ? new CatmullRomCurve3(c.map(([x, y, z]) => new Vector3(x, y, z)), false, 'centripetal') : c;
}

/** A tiny deterministic random, so every load looks the same (and still frames are composed). */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function LightParticles({
  curves,
  count = 6_000,
  color,
  speed = 0.08,
  progress,
  spread = 0.06,
  size = 22,
  opacity = 0.85,
}: LightParticlesProps) {
  const tier = useKitTier();
  const palette = useScenePalette();
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const scrubbed = progress !== undefined;
  // Free flow animates on its own; scrubbed particles move when progress does.
  const animated = useAnimated(scrubbed ? 30 : undefined);
  const n = Math.max(1, Math.min(Math.round(count), CAP[tier]));

  const curveList = useMemo(() => (curves && curves.length ? curves : defaultCurves()).map(toCurve), [curves]);

  // The curves, sampled into a float texture: one row per curve.
  const curveTexture = useMemo(() => {
    const rows = curveList.length;
    const data = new Float32Array(SAMPLES * rows * 4);
    const v = new Vector3();
    curveList.forEach((curve, row) => {
      for (let i = 0; i < SAMPLES; i++) {
        curve.getPointAt(i / (SAMPLES - 1), v);
        data.set([v.x, v.y, v.z, 1], (row * SAMPLES + i) * 4);
      }
    });
    const tex = new DataTexture(data, SAMPLES, rows, RGBAFormat, FloatType);
    // Float textures can't be filtered everywhere; the shader interpolates itself.
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, [curveList]);

  const geometry = useMemo(() => {
    const rand = seeded(n * 7919 + curveList.length);
    const position = new Float32Array(n * 3);
    const curve = new Float32Array(n);
    const offset = new Float32Array(n);
    const pace = new Float32Array(n);
    const jitter = new Float32Array(n * 3);
    const scale = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      curve[i] = i % curveList.length;
      offset[i] = rand();
      pace[i] = 0.7 + rand() * 0.6;
      // A soft, roughly round cloud around the curve.
      const r = spread * Math.sqrt(rand());
      const a = rand() * Math.PI * 2;
      const b = (rand() - 0.5) * Math.PI;
      jitter.set([r * Math.cos(a) * Math.cos(b), r * Math.sin(b), r * Math.sin(a) * Math.cos(b)], i * 3);
      scale[i] = 0.45 + rand() ** 3 * 1.1;
    }
    const g = new BufferGeometry();
    // Positions come from the curve texture; this only sizes the draw.
    g.setAttribute('position', new BufferAttribute(position, 3));
    g.setAttribute('aCurve', new BufferAttribute(curve, 1));
    g.setAttribute('aOffset', new BufferAttribute(offset, 1));
    g.setAttribute('aSpeed', new BufferAttribute(pace, 1));
    g.setAttribute('aJitter', new BufferAttribute(jitter, 3));
    g.setAttribute('aScale', new BufferAttribute(scale, 1));
    return g;
  }, [n, curveList.length, spread]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uCurves: { value: null },
          uSamples: { value: SAMPLES },
          uTime: { value: 0 },
          uSpeed: { value: 0.08 },
          uProgress: { value: 0 },
          uScrubbed: { value: 0 },
          uStagger: { value: 0.6 },
          uSize: { value: 22 },
          uPixelRatio: { value: 1 },
          uColor: { value: new Color() },
          uOpacity: { value: 0.85 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    []
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => curveTexture.dispose(), [curveTexture]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const u = material.uniforms;
    u.uCurves.value = curveTexture;
    u.uSpeed.value = speed;
    u.uScrubbed.value = scrubbed ? 1 : 0;
    u.uSize.value = size;
    u.uOpacity.value = opacity;
    u.uColor.value.set(color ?? palette.particle);
    // Ink on paper by day, light in the dark by night.
    const blending = palette.night ? AdditiveBlending : NormalBlending;
    if (material.blending !== blending) {
      material.blending = blending;
      material.needsUpdate = true;
    }
    if (typeof progress === 'number') u.uProgress.value = progress;
    invalidate();
  }, [material, curveTexture, speed, scrubbed, size, opacity, color, palette, progress, invalidate]);

  useFrame((_, delta) => {
    const u = material.uniforms;
    u.uPixelRatio.value = gl.getPixelRatio();
    if (animated) u.uTime.value += Math.min(delta, 1 / 15);
    if (typeof progress === 'function') u.uProgress.value = Math.min(1, Math.max(0, progress()));
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
