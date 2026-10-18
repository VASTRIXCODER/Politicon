'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Fog,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector3,
  type AmbientLight,
  type DirectionalLight,
  type Mesh,
  type PointLight,
} from 'three';
import { SCENE_PALETTES, mixHex } from '@/lib/three/palette';
import { useKitTier, useScenePalette } from '@/components/three/kit/hooks';
import { clamp01, mix } from '@/components/three/scenes/filmShots';

/*
 * Pieces the hero vignette and the landing film share, so the film's first
 * shot continues the hero: the morning-light rig that turns to dusk, the
 * paper fog, the violet beam from the lantern and the glint of light at
 * its top. Everything that changes over the film takes a function read
 * every frame, never a prop that re-renders.
 */

type Driven = () => number;

const DAY = SCENE_PALETTES.light;
const NIGHT = SCENE_PALETTES.dark;

/**
 * Twilight, on the way from day to dusk: lilac and orchid light over the
 * paper, so the sky never passes through grey.
 */
export const TWILIGHT_TONES = {
  horizon: mixHex(DAY.canvas, DAY.accent, 0.22),
  zenith: mixHex(DAY.violetLight, DAY.violet, 0.4),
  upper: mixHex(DAY.canvas, DAY.violetLight, 0.6),
  glow: mixHex(DAY.canvas, '#FFFFFF', 0.6),
  ground: mixHex(DAY.canvas, DAY.violet, 0.22),
};

/** Between the two: the violet hour, saturated so the change of light never greys. */
export const VIOLET_HOUR_TONES = {
  horizon: mixHex(mixHex(DAY.glow, DAY.accent, 0.35), NIGHT.canvas, 0.3),
  zenith: mixHex(DAY.violet, NIGHT.canvas, 0.6),
  upper: mixHex(DAY.violet, NIGHT.canvas, 0.38),
  glow: mixHex(NIGHT.violetLight, '#FFFFFF', 0.3),
  ground: mixHex(DAY.violet, NIGHT.canvas, 0.62),
};

/** Dusk colours, from the night palette: the sky low down, and the lamplit evening. */
export const DUSK_TONES = {
  horizon: mixHex(NIGHT.canvas, NIGHT.violet, 0.3),
  zenith: mixHex(NIGHT.canvas, NIGHT.violet, 0.12),
  upper: mixHex(NIGHT.surface, NIGHT.violet, 0.32),
  glow: mixHex(NIGHT.violet, NIGHT.accent, 0.45),
  ground: mixHex(NIGHT.canvas, NIGHT.violet, 0.08),
  /** The key light at dusk: cool, violet-white moonlight. */
  moon: mixHex(NIGHT.violetLight, '#FFFFFF', 0.35),
};

/** What the lights do at full dusk: a moon high behind the left, a stronger violet rim, a dim room. */
const DUSK_LIGHT = { ambient: 0.12, key: 0.75, rim: 3.0, accent: 0.9, env: 0.3, warm: 0.85 };
const KEY_DAY = new Vector3(5, 4.2, 5.2);
const KEY_DUSK = new Vector3(-3.5, 6, -3);

export interface FilmLightsProps {
  /** 0 (morning) … 1 (dusk). */
  dusk?: Driven;
  /** Lamplight spilling from the house at dusk, at this world point. */
  warmAt?: [number, number, number];
}

/**
 * The studio as morning light: a Lightformer environment (no HDR, nothing
 * fetched; rendered once) with a warm overhead softbox, the violet rim ring
 * behind the left and a soft front panel; a low key from the front right
 * like early sun; the violet rim. Toward dusk the key cools to moonlight, the
 * room dims and the rim takes over.
 */
export function FilmLights({ dusk, warmAt }: FilmLightsProps) {
  const p = useScenePalette();
  const tier = useKitTier();
  const scene = useThree((s) => s.scene);
  const L = p.light;
  const ambient = useRef<AmbientLight>(null);
  const key = useRef<DirectionalLight>(null);
  const rim = useRef<DirectionalLight>(null);
  const accent = useRef<DirectionalLight>(null);
  const warm = useRef<PointLight>(null);

  const tones = useMemo(
    () => ({
      fill: [new Color(p.fill), new Color(NIGHT.fill)],
      key: [new Color(mixHex(p.key, p.gold, p.night ? 0 : 0.12)), new Color(DUSK_TONES.moon)],
      rim: [new Color(p.rim), new Color(NIGHT.rim)],
    }),
    [p]
  );

  useFrame(() => {
    const d = dusk ? clamp01(dusk()) : 0;
    if (ambient.current) {
      ambient.current.intensity = mix(L.ambient, DUSK_LIGHT.ambient, d);
      ambient.current.color.lerpColors(tones.fill[0], tones.fill[1], d);
    }
    if (key.current) {
      key.current.intensity = mix(L.key, DUSK_LIGHT.key, d);
      key.current.color.lerpColors(tones.key[0], tones.key[1], d);
      key.current.position.lerpVectors(KEY_DAY, KEY_DUSK, d);
    }
    if (rim.current) {
      rim.current.intensity = mix(L.rim, DUSK_LIGHT.rim, d);
      rim.current.color.lerpColors(tones.rim[0], tones.rim[1], d);
    }
    if (accent.current) accent.current.intensity = mix(L.rim * 0.35, DUSK_LIGHT.accent, d);
    if (warm.current) warm.current.intensity = DUSK_LIGHT.warm * d * d;
    scene.environmentIntensity = mix(L.env, DUSK_LIGHT.env, d);
  });

  return (
    <>
      <Environment resolution={tier === 2 ? 256 : 128} frames={1} environmentIntensity={L.env}>
        <color attach="background" args={[p.env]} />
        <Lightformer form="rect" intensity={2.4} color={p.key} position={[0, 5, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[9, 3, 1]} />
        <Lightformer form="ring" intensity={p.night ? 6 : 4} color={p.rim} position={[-5, 1.5, -4]} scale={3.5} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={p.night ? 3 : 2} color={p.glow} position={[5, 0.5, -2]} scale={[1.2, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={p.night ? 0.5 : 0.8} color={p.gold} position={[2, -3.5, 4]} scale={[4, 1, 1]} target={[0, 0, 0]} />
        <Lightformer form="circle" intensity={p.night ? 0.4 : 1} color={p.key} position={[0, 0.5, 7]} scale={4} target={[0, 0, 0]} />
      </Environment>
      <ambientLight ref={ambient} intensity={L.ambient} color={p.fill} />
      {/* Key: low from the front right, like early sun (by dusk, a moon behind the left). */}
      <directionalLight ref={key} position={KEY_DAY.toArray()} intensity={L.key} color={p.key} />
      {/* Rim: from behind the left, the Politicon violet edge. */}
      <directionalLight ref={rim} position={[-4.5, 2.5, -5]} intensity={L.rim} color={p.rim} />
      <directionalLight ref={accent} position={[4.5, -0.5, -4]} intensity={L.rim * 0.35} color={p.accent} />
      {warmAt && <pointLight ref={warm} position={warmAt} intensity={0} distance={2.6} decay={1.6} color={mixHex(p.paper, p.gold, 0.55)} />}
    </>
  );
}

export interface FilmFogProps {
  dusk?: Driven;
  near?: number;
  far?: number;
  /** How much further back than written the camera stands (a narrow view): the fog keeps its distance from the scene. */
  scale?: Driven;
}

/** Paper fog by day (the page's own colour, so distance fades into it), dusk haze by evening. */
export function FilmFog({ dusk, near = 11, far = 36, scale }: FilmFogProps) {
  const p = useScenePalette();
  const scene = useThree((s) => s.scene);
  const fog = useMemo(() => new Fog('#ffffff', near, far), [near, far]);
  const tones = useMemo(
    () => [new Color(p.canvas), new Color(TWILIGHT_TONES.horizon), new Color(VIOLET_HOUR_TONES.horizon), new Color(DUSK_TONES.horizon)],
    [p]
  );
  const scratch = useMemo(() => [new Color(), new Color()], []);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      if (scene.fog === fog) scene.fog = null;
    };
  }, [scene, fog]);

  useFrame(() => {
    const d = dusk ? clamp01(dusk()) : 0;
    if (p.night) fog.color.lerpColors(tones[0], tones[3], d);
    else {
      // Day → twilight → the violet hour → dusk, as the sky does.
      const n = clamp01((d - 0.3) / 0.7);
      fog.color.lerpColors(tones[0], tones[1], Math.min(1, d / 0.35));
      if (n > 0) fog.color.lerpColors(scratch[0].lerpColors(tones[1], tones[2], n), scratch[1].lerpColors(tones[2], tones[3], n), n);
    }
    const fit = scale ? Math.max(1, scale()) : 1;
    fog.near = mix(near, near * 0.75, d) * fit;
    fog.far = mix(far, far * 0.8, d) * fit;
  });
  return null;
}

// ---------------------------------------------------------------------------
// Light that reads by day as violet haze on the paper and by night as glow:
// premultiplied output where the alpha that darkens what's behind fades out
// as `uAdd` rises, so one material moves smoothly from normal to additive.

export const BLEND_LIGHT = {
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  // The canvas keeps its own alpha (the stage composites over the page).
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
} as const;

/** GLSL: write colour c (linear) with alpha a, normal (uAdd 0) through additive (uAdd 1). */
export const LIGHT_OUTPUT = /* glsl */ `
vec4 lightOut(vec3 c, float a, float add) {
  vec4 o = linearToOutputTexel(vec4(c, 1.0));
  return vec4(o.rgb * a, a * (1.0 - add));
}
`;

const BEAM_VERTEX = /* glsl */ `
varying float vH;
varying float vFacing;
void main() {
  vH = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`;

const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uAdd;
varying float vH;
varying float vFacing;
${LIGHT_OUTPUT}
void main() {
  // Brightest at the lantern and down the beam's core, gone by its top.
  float a = pow(vFacing, 2.2) * pow(1.0 - vH, 1.7) * smoothstep(0.0, 0.06, vH) * uStrength;
  if (a < 0.002) discard;
  gl_FragColor = lightOut(uColor, a, uAdd);
}
`;

/** Motes of light: slow spirals rising from around the Capitol's plinth to above the dome. */
export function moteCurves(): [number, number, number][][] {
  return Array.from({ length: 11 }, (_, j) => {
    const a = (j / 11) * Math.PI * 2;
    const r = 1.2 + ((j * 7) % 5) * 0.2;
    return Array.from({ length: 5 }, (_, k) => {
      const t = k / 4;
      const ang = a + t * 0.9;
      const rad = r * (1 - t * 0.45);
      return [Math.cos(ang) * rad, 0.05 + t * 3.3, Math.sin(ang) * rad * 0.8] as [number, number, number];
    });
  });
}

export interface LightBeamProps {
  position?: [number, number, number];
  height?: number;
  /** Radius at the foot and at the top. */
  radius?: [number, number];
  strength?: Driven;
  /** How additive (0 by day … 1 by night); default follows the palette. */
  additive?: Driven;
}

/** A soft cone of violet light rising from a point (the lantern). */
export function LightBeam({ position = [0, 0, 0], height = 2.8, radius = [0.05, 0.42], strength, additive }: LightBeamProps) {
  const p = useScenePalette();
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(radius[1], radius[0], height, 40, 1, true);
    g.translate(0, height / 2, 0);
    return g;
  }, [height, radius]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uStrength: { value: 0 }, uAdd: { value: 0 } },
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        ...BLEND_LIGHT,
      }),
    []
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.uniforms.uColor.value.set(p.night ? p.glow : p.violet);
  }, [material, p]);

  useFrame(() => {
    const s = strength ? clamp01(strength()) : 1;
    material.uniforms.uStrength.value = s * (p.night ? 0.55 : 0.32);
    material.uniforms.uAdd.value = additive ? clamp01(additive()) : p.night ? 1 : 0;
    if (mesh.current) mesh.current.visible = s > 0.003;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} position={position} renderOrder={2} />;
}

const GLINT_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // Billboard: keep the quad facing the camera, sized in world units.
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  mv.xy += position.xy * scale;
  gl_Position = projectionMatrix * mv;
}
`;

const GLINT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uStrength;
uniform float uAdd;
uniform float uTwinkle;
uniform float uRays;
varying vec2 vUv;
${LIGHT_OUTPUT}
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float r = length(d);
  float halo = exp(-r * r * 9.0);
  // Four thin rays (the aperture), a little longer on the horizontal.
  float rays = (exp(-abs(d.y) * 60.0) * exp(-abs(d.x) * 2.6) + exp(-abs(d.x) * 60.0) * exp(-abs(d.y) * 3.4) * 0.8) * uRays;
  float core = exp(-r * r * 140.0) * uRays;
  float a = (halo * 0.55 + rays * uTwinkle + core) * uStrength;
  if (a < 0.003) discard;
  vec3 c = mix(uColor, uCore, clamp(core + rays * 0.4, 0.0, 1.0));
  gl_FragColor = lightOut(c, clamp(a, 0.0, 1.0), uAdd);
}
`;

export interface GlintProps {
  position?: [number, number, number];
  size?: number;
  strength?: Driven;
  /** Seconds, for the slow twinkle (frozen under reduced motion by the caller). */
  time?: Driven;
  additive?: Driven;
  /** Default: the palette's violet. */
  color?: string;
  /** The four rays and the bright core (0: a soft halo only). */
  rays?: number;
}

/** A glint of light: a soft halo with four fine rays, always facing the camera. */
export function Glint({ position = [0, 0, 0], size = 0.6, strength, time, additive, color, rays = 1 }: GlintProps) {
  const p = useScenePalette();
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color() },
          uCore: { value: new Color() },
          uStrength: { value: 0 },
          uAdd: { value: 0 },
          uTwinkle: { value: 1 },
          uRays: { value: 1 },
        },
        vertexShader: GLINT_VERTEX,
        fragmentShader: GLINT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        ...BLEND_LIGHT,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.uniforms.uColor.value.set(color ?? (p.night ? p.glow : p.violet));
    material.uniforms.uCore.value.set(p.night ? '#FFFFFF' : mixHex(p.violetLight, '#FFFFFF', 0.5));
    material.uniforms.uRays.value = rays;
  }, [material, p, color, rays]);

  useFrame(() => {
    const s = strength ? clamp01(strength()) : 1;
    const t = time ? time() : 0;
    const u = material.uniforms;
    u.uStrength.value = s;
    u.uAdd.value = additive ? clamp01(additive()) : p.night ? 1 : 0;
    u.uTwinkle.value = 0.75 + 0.25 * Math.sin(t * 1.3) * Math.sin(t * 0.7 + 1.1);
    if (mesh.current) mesh.current.visible = s > 0.003;
  });

  return (
    <mesh ref={mesh} position={position} scale={size} material={material} renderOrder={3} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
