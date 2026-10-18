'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Lightformer, MeshTransmissionMaterial, PerspectiveCamera } from '@react-three/drei';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  CylinderGeometry,
  ExtrudeGeometry,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Shape,
  Vector2,
  type Mesh,
  type PerspectiveCamera as PerspectiveCameraImpl,
  type PointLight,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { damp } from 'maath/easing';
import { CATEGORY_COLORS } from '@/lib/design/tokens';
import { mixHex, type ScenePalette } from '@/lib/three/palette';
import { usePrefersReducedMotion, useViewState } from '@/components/three/runtime';
import GlassMaterial from '@/components/three/kit/GlassMaterial';
import { ContactBlob, occlude } from '@/components/three/kit/Plinth';
import PostFX from '@/components/three/kit/PostFX';
import { useAnimated, useKitTier, useScenePalette } from '@/components/three/kit/hooks';
import {
  CITY,
  CITY_VIEW,
  cityBounds,
  cityLayout,
  districtEmphasis,
  frameCity,
  labelAnchor,
  plinthOutline,
  projectPoint,
  towerEmphasis,
  type CityFocus,
  type CityHit,
  type CityLabelSink,
  type CityLayout,
  type CityPlinth,
  type ExplorerCityData,
} from '@/components/three/scenes/bracketCityData';

/*
 * "Brackets as a city" (/explorer): the illustrative dataset as a miniature
 * architectural model under studio light. Five districts, one per income
 * bracket, stand along a gentle arc on a curved plinth: a sheet of paper
 * (the street, the zero line) over a block of clear acrylic on a porcelain
 * foot. Each district has a glass tower per category. Gains rise from the
 * street in ledger teal; costs hang from its underside into the acrylic in
 * ember amber; every height is linear in its dollars on one scale
 * (bracketCityData.ts), with a band in the category's colour at the
 * tower's far end.
 *
 * The page's focus (a bracket, a category, or both) lights its towers and
 * brings a violet lamp over the picked district; the rest dims. The camera
 * sways slowly while idle and turns under a drag (a sideways swipe on
 * touch, so the page still scrolls); under reduced motion it holds the
 * composed frame and the focus changes at once. By night the glass holds a
 * low glow of its own colour under the studio's rim light, never neon.
 *
 * Tier 2 refracts through the acrylic (one transmission pass) and blooms;
 * tier 1 uses the kit's rim-lit stand-in glass and skips the lamp's beam.
 *
 * Decorative: the page states every figure in text. Hover and click report
 * through `onHover` / `onPick`, and `labels` gets the district labels'
 * positions whenever the camera moves, so the page can keep DOM text on it.
 */

export interface BracketCityProps {
  data: ExplorerCityData;
  focus?: CityFocus;
  /** A 2 × 2 block per district on a tighter arc, for narrow boxes. */
  compact?: boolean;
  /** The tower under the pointer (null when it leaves), with the pointer's client position. */
  onHover?: (hit: CityHit | null, at?: { x: number; y: number }) => void;
  /** A tower clicked (or tapped) without dragging. */
  onPick?: (hit: CityHit) => void;
  labels?: CityLabelSink;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** No drag for this long, and the camera starts to sway. */
const IDLE_MS = 2600;

// ---------------------------------------------------------------------------
// Geometry

/** The plinth's outline extruded between two heights (the paper, the acrylic, the foot). */
function plinthSlab(p: CityPlinth, y0: number, y1: number, inset: number, bevel: number) {
  const pts = plinthOutline(p, 64).map(([x, z]) => new Vector2(x, -z));
  // Inset toward the band's middle line so stacked slabs nest inside each other.
  if (inset) {
    const mid = (p.inner + p.outer) / 2;
    for (const v of pts) {
      const dx = v.x - p.cx;
      const dz = -v.y - p.cz;
      const r = Math.hypot(dx, dz) || 1;
      const k = (r - mid > 0 ? -inset : inset) / r;
      v.x += dx * k;
      v.y -= dz * k;
    }
  }
  const height = Math.max(0.001, y1 - y0 - 2 * bevel);
  const g = new ExtrudeGeometry(new Shape(pts), {
    depth: height,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  return g;
}

/** A flat ribbon on the street following an arc (a hairline inlay). */
function arcRibbon(p: CityPlinth, r: number, from: number, to: number, width: number, y: number) {
  const steps = 96;
  const pos: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    for (const rr of [r - width / 2, r + width / 2]) pos.push(p.cx + rr * Math.sin(a), y, p.cz - rr * Math.cos(a));
    if (i < steps) {
      const k = i * 2;
      index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A rounded prism from y0 to y1, its footprint `width` square. */
function prism(width: number, y0: number, y1: number, radius: number) {
  const h = Math.abs(y1 - y0);
  const g = new RoundedBoxGeometry(width, h, width, 2, Math.min(radius, h * 0.3, width * 0.3));
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
}

// ---------------------------------------------------------------------------
// Materials

const TOWER_VERTEX_PARS = /* glsl */ `
varying float vStreetY;
`;

const TOWER_VERTEX = /* glsl */ `
#include <project_vertex>
vStreetY = (modelMatrix * vec4(transformed, 1.0)).y;
`;

const TOWER_PARS = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uFloor;
uniform float uFloorLine;
varying float vStreetY;
`;

// A fresnel rim in the tower's own colour, so it reads as lit glass at every
// angle, and a floor line every uFloor of height ($100 a year): the scale,
// drawn into the glass.
const TOWER_LIGHT = /* glsl */ `
float rimFacing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
float rimLight = pow(1.0 - rimFacing, 2.2);
outgoingLight += uRimColor * rimLight * uRimStrength;
diffuseColor.a = clamp(diffuseColor.a + rimLight * 0.35, 0.0, 1.0);
float floorY = abs(vStreetY) / uFloor;
float floorD = abs(fract(floorY + 0.5) - 0.5);
float floorW = fwidth(floorY);
float floorLine = (1.0 - smoothstep(uFloorLine, uFloorLine + floorW * 1.5, floorD)) * step(0.5, floorY);
// Etched into the glass: a fine line of its own lit colour, not a painted stripe.
outgoingLight = mix(outgoingLight, uRimColor, floorLine * 0.32);
diffuseColor.a = max(diffuseColor.a, floorLine * 0.55);
#include <opaque_fragment>
`;

/** `floor`: the height of one floor (CITY.floorDollars), in world units. */
function towerGlass(floor: number) {
  const m = new MeshPhysicalMaterial({
    transparent: true,
    metalness: 0,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    // Glass is mostly what it reflects: the studio's softboxes slide over it as the city turns.
    envMapIntensity: 1.9,
    specularIntensity: 1,
    emissive: new Color(),
    vertexColors: true,
  });
  const uniforms = {
    uRimColor: { value: new Color() },
    uRimStrength: { value: 1 },
    uFloor: { value: floor },
    // Half the line's width, as a share of a floor.
    uFloorLine: { value: 0.0035 / floor },
  };
  m.userData.rim = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TOWER_VERTEX_PARS}`)
      .replace('#include <project_vertex>', TOWER_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TOWER_PARS}`)
      .replace('#include <opaque_fragment>', TOWER_LIGHT);
  };
  m.customProgramCacheKey = () => 'politicon-city-tower';
  return m;
}

// Light that reads as violet haze on paper by day and as glow by night:
// premultiplied colour whose darkening alpha fades out as uAdd rises.
const LIGHT_BLEND = {
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
} as const;

const LIGHT_OUT = /* glsl */ `
vec4 lightOut(vec3 c, float a, float add) {
  vec4 o = linearToOutputTexel(vec4(c, 1.0));
  return vec4(o.rgb * a, a * (1.0 - add));
}
`;

const POOL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const POOL_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uAdd;
varying vec2 vUv;
${LIGHT_OUT}
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float a = exp(-dot(d, d) * 2.8) * uStrength;
  if (a < 0.002) discard;
  gl_FragColor = lightOut(uColor, a, uAdd);
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
${LIGHT_OUT}
void main() {
  // Strongest where it lands on the street, gone toward the lamp; soft at its edges.
  float a = pow(vFacing, 2.4) * pow(1.0 - vH, 1.5) * smoothstep(0.0, 0.1, vH) * uStrength;
  if (a < 0.002) discard;
  gl_FragColor = lightOut(uColor, a, uAdd);
}
`;

function lightMaterial(vertexShader: string, fragmentShader: string) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color() }, uStrength: { value: 0 }, uAdd: { value: 0 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    ...LIGHT_BLEND,
  });
}

// ---------------------------------------------------------------------------
// The camera: a composed three-quarter view that frames the city in any box,
// a slow idle sway, a damped drag, and the district labels' positions.

interface RigProps {
  layout: CityLayout;
  focus: CityFocus;
  animated: boolean;
  reduced: boolean;
  labels?: CityLabelSink;
}

function CityRig({ layout, focus, animated, reduced, labels }: RigProps) {
  const camera = useRef<PerspectiveCameraImpl>(null);
  const { element } = useViewState();
  const view = layout.compact ? CITY_VIEW.compact : CITY_VIEW.full;
  const state = useMemo(
    () => ({
      yaw: view.yaw,
      pitch: view.pitch,
      dragYaw: 0,
      dragPitch: 0,
      tx: 0,
      dragging: false,
      lastInput: -Infinity,
      lastX: 0,
      lastY: 0,
      pointer: -1,
      t: 0,
      placed: new Map<string, string>(),
    }),
    [view]
  );
  const bounds = useMemo(() => cityBounds(layout), [layout]);

  // Drag to turn: a mouse or pen turns and tilts; a finger only turns (a
  // sideways swipe; the box is touch-action: pan-y), so a vertical swipe
  // still scrolls the page. Off under reduced motion: the frame holds.
  useEffect(() => {
    const el = element;
    if (!el || reduced) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      state.dragging = true;
      state.pointer = e.pointerId;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.lastInput = performance.now();
      if (e.pointerType !== 'touch') el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!state.dragging || e.pointerId !== state.pointer) return;
      const width = Math.max(240, el.clientWidth);
      const dx = e.clientX - state.lastX;
      const dy = e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.lastInput = performance.now();
      if (Math.abs(dx) + Math.abs(dy) > 0) el.style.cursor = 'grabbing';
      state.dragYaw = clamp(state.dragYaw - (dx / width) * 2.2, -view.yawRange, view.yawRange);
      if (e.pointerType !== 'touch') {
        const [lo, hi] = view.pitchRange;
        state.dragPitch = clamp(state.dragPitch + (dy / width) * 1.6, lo - view.pitch, hi - view.pitch);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== state.pointer) return;
      state.dragging = false;
      state.pointer = -1;
      state.lastInput = performance.now();
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.style.cursor = '';
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.style.cursor = '';
    };
  }, [element, reduced, state, view]);

  const focused = focus.bracket ? layout.districts.find((d) => d.bracket === focus.bracket) : undefined;

  useFrame((_, delta) => {
    const cam = camera.current;
    if (!cam) return;
    const dt = Math.min(delta, 1 / 20);
    const live = animated && !reduced;
    // The sway's own clock, from this view's first frame: it starts at the poster's angle.
    if (live) state.t += dt;

    // The composed view leans a little toward the picked district.
    const lean = focused && !layout.compact ? focused.x / Math.max(1, layout.footprint.halfWidth) : 0;
    const idle = live && !state.dragging && performance.now() - state.lastInput > IDLE_MS;
    if (idle) {
      // Hand the drag back gently, then sway to and fro.
      damp(state, 'dragYaw', 0, 2.6, dt);
      damp(state, 'dragPitch', 0, 2.6, dt);
    }
    const sway = live ? Math.sin(state.t * 0.11) * 0.14 + Math.sin(state.t * 0.043) * 0.05 : 0;
    const yawGoal = view.yaw - lean * 0.12 + state.dragYaw + sway;
    const pitchGoal = view.pitch + state.dragPitch;
    const txGoal = focused && !layout.compact ? focused.x * 0.18 : 0;
    if (live) {
      damp(state, 'yaw', yawGoal, 0.3, dt);
      damp(state, 'pitch', pitchGoal, 0.3, dt);
      damp(state, 'tx', txGoal, 0.6, dt);
    } else {
      state.yaw = yawGoal;
      state.pitch = pitchGoal;
      state.tx = txGoal;
    }

    // Frame the city in the box, whatever its shape (the poster uses the same framing).
    const w = Math.max(1, element?.clientWidth ?? 1);
    const h = Math.max(1, element?.clientHeight ?? 1);
    const frame = frameCity(layout, { yaw: state.yaw, pitch: state.pitch, fov: view.fov, tx: state.tx }, w / h, bounds);
    cam.position.set(...frame.position);
    cam.aspect = frame.aspect;
    cam.fov = frame.fov;
    cam.updateProjectionMatrix();
    cam.lookAt(...frame.target);
    cam.updateMatrixWorld();

    // District labels: on the page under the plinth's front edge, below each district.
    if (!labels) return;
    for (const d of layout.districts) {
      const [nx, ny, depth] = projectPoint(frame, labelAnchor(layout, d));
      const x = Math.round(((nx + 1) / 2) * w);
      const y = Math.round(((1 - ny) / 2) * h);
      const visible = depth > 0 && x >= 0 && x <= w && y >= 0 && y <= h;
      const key = `${x},${y},${visible}`;
      if (state.placed.get(d.bracket) === key) continue;
      state.placed.set(d.bracket, key);
      labels.place(d.bracket, x, y, visible);
    }
  });

  return <PerspectiveCamera ref={camera} makeDefault near={0.1} far={80} fov={view.fov} position={[0, 4, 14]} />;
}

// ---------------------------------------------------------------------------
// Studio light for a paper model: a Lightformer room (nothing fetched,
// rendered once) soft enough that the paper reads as paper, not as a
// white-out, with the violet rim that edges every Politicon object.

function CityLights() {
  const p = useScenePalette();
  const tier = useKitTier();
  return (
    <>
      <Environment resolution={tier === 2 ? 256 : 128} frames={1} environmentIntensity={p.night ? 0.85 : 0.42}>
        <color attach="background" args={[p.env]} />
        <Lightformer form="rect" intensity={2.2} color={p.key} position={[0, 6, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[14, 4, 1]} />
        <Lightformer form="ring" intensity={p.night ? 6 : 4} color={p.rim} position={[-7, 2.5, -5]} scale={4.5} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={p.night ? 3.2 : 2.2} color={p.glow} position={[7, 1, -3]} scale={[1.6, 6, 1]} target={[0, 0, 0]} />
        {/* A low warm bounce in the key's own white (never archive gold: nothing here is an official record). */}
        <Lightformer form="rect" intensity={p.night ? 0.4 : 0.8} color={p.key} position={[2, -3, 6]} scale={[6, 1, 1]} target={[0, 0, 0]} />
        <Lightformer form="circle" intensity={p.night ? 0.5 : 1.3} color={p.key} position={[0, 1.5, 10]} scale={6} target={[0, 0, 0]} />
      </Environment>
      {/* By day a warm, near-neutral fill (the palette's lilac mist would tint the paper). */}
      <ambientLight intensity={p.night ? 0.3 : 0.95} color={p.night ? p.fill : mixHex(p.key, p.fill, 0.3)} />
      {/* Key: high over the right shoulder. */}
      <directionalLight position={[4, 7, 5]} intensity={p.night ? 0.8 : 1.65} color={p.key} />
      {/* Rim: low behind the left, the Politicon violet edge. Low, so it edges the glass without tinting the paper. */}
      <directionalLight position={[-6, 0.8, -6]} intensity={p.night ? 3.4 : 2.4} color={p.rim} />
      <directionalLight position={[6, 0.2, -5]} intensity={p.night ? 1.1 : 0.7} color={p.accent} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The acrylic under the street: clearer than the kit's violet glass (the
// costs inside must keep their amber), refracting on tier 2 and a faint
// rim-lit pane on tier 1.

function Acrylic() {
  const p = useScenePalette();
  const tier = useKitTier();
  const background = useMemo(() => new Color(p.canvas), [p.canvas]);
  if (tier === 2) {
    return (
      <MeshTransmissionMaterial
        samples={6}
        resolution={512}
        transmission={1}
        thickness={0.18}
        roughness={0.06}
        ior={1.25}
        chromaticAberration={0.01}
        anisotropicBlur={0}
        distortion={0}
        temporalDistortion={0}
        color={mixHex(p.glassTint, '#FFFFFF', p.night ? 0.5 : 0.8)}
        attenuationColor={mixHex(p.glassDepth, '#FFFFFF', p.night ? 0.3 : 0.7)}
        attenuationDistance={p.night ? 4 : 12}
        clearcoat={1}
        clearcoatRoughness={0.06}
        envMapIntensity={p.night ? 1.4 : 1}
        background={background}
        backside={false}
      />
    );
  }
  return (
    <GlassMaterial
      tint={mixHex(p.glassTint, '#FFFFFF', p.night ? 0.3 : 0.5)}
      roughness={0.08}
      opacity={p.night ? 0.2 : 0.13}
    />
  );
}

// ---------------------------------------------------------------------------
// The plinth: paper over acrylic over porcelain, a violet hairline set into
// the paper along its front edge, and a soft shadow on the page.

function PlinthBand({ layout }: { layout: CityLayout }) {
  const p = useScenePalette();
  const pl = layout.plinth;

  const geo = useMemo(() => {
    const paper = plinthSlab(pl, -CITY.paper, 0, 0, 0.008);
    const body = plinthSlab(pl, pl.floor, -CITY.paper - 0.002, 0.012, 0.012);
    const foot = plinthSlab(pl, pl.bottom, pl.floor + 0.004, 0.004, 0.014);
    const inlay = arcRibbon(pl, pl.inner + 0.07, -pl.span, pl.span, 0.007, 0.0015);
    return { paper, body, foot, inlay };
  }, [pl]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const mats = useMemo(
    () => ({
      // Vellum rather than card: the costs just below glimmer through where the street hides them.
      paper: new MeshStandardMaterial({ roughness: 0.92, metalness: 0, envMapIntensity: 0.7, transparent: true, opacity: 0.9 }),
      foot: new MeshPhysicalMaterial({ roughness: 0.55, metalness: 0, clearcoat: 0.4 }),
      inlay: new MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => {
    mats.paper.color.set(p.night ? mixHex(p.surface, p.violet, 0.1) : mixHex(p.paper, '#EFE6D6', 0.3));
    mats.foot.color.set(p.night ? mixHex(p.surface, p.ink, 0.12) : mixHex(p.porcelain, p.ink, 0.06));
    mats.inlay.color.set(p.night ? p.violetLight : p.violet);
    mats.inlay.opacity = p.night ? 0.7 : 0.55;
  }, [mats, p]);

  const { halfWidth, halfDepth } = layout.footprint;
  return (
    <>
      <ContactBlob width={halfWidth * 2.5} depth={halfDepth * 3.4} position={[0, pl.bottom - 0.004, 0.1]} strength={1.1} />
      <mesh geometry={geo.foot} material={mats.foot} />
      <mesh geometry={geo.body} renderOrder={2}>
        <Acrylic />
      </mesh>
      <mesh geometry={geo.paper} material={mats.paper} renderOrder={3} />
      <mesh geometry={geo.inlay} material={mats.inlay} renderOrder={4} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Lots: each district's footprint drawn into the paper as a violet hairline,
// brighter when its bracket is picked.

function Lots({ layout, focus, animated }: { layout: CityLayout; focus: CityFocus; animated: boolean }) {
  const p = useScenePalette();
  const first = layout.districts[0];
  const bar = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(() => () => bar.dispose(), [bar]);
  const mats = useMemo(
    () => layout.districts.map(() => new MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false })),
    [layout]
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useEffect(() => mats.forEach((m) => m.color.set(p.night ? p.violetLight : p.violet)), [mats, p]);

  const lit = useRef(layout.districts.map(() => 0));
  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    layout.districts.forEach((d, i) => {
      const goal = focus.bracket === d.bracket ? 1 : 0.35 * districtEmphasis(focus, d.bracket);
      lit.current[i] = animated ? lit.current[i] + (goal - lit.current[i]) * (1 - Math.exp(-dt * 6)) : goal;
      mats[i].opacity = 0.12 + 0.78 * lit.current[i];
    });
  });

  const w = (first?.width ?? 1) - 0.04;
  const d = (first?.depth ?? 0.5) - 0.04;
  const frame: [number, number, number, number][] = [
    [0, d / 2, w, 0.006],
    [0, -d / 2, w, 0.006],
    [w / 2, 0, 0.006, d],
    [-w / 2, 0, 0.006, d],
  ];
  return (
    <>
      {layout.districts.map((dist, i) => (
        <group key={dist.bracket} position={[dist.x, 0.0018, dist.z]} rotation={[0, dist.yaw, 0]}>
          {frame.map(([x, z, sx, sz], j) => (
            <mesh key={j} geometry={bar} material={mats[i]} position={[x, 0, z]} scale={[sx, 0.002, sz]} renderOrder={4} />
          ))}
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Towers: coloured glass, a band in the category's colour at the far end,
// and an invisible box for the pointer.

interface TowersProps {
  layout: CityLayout;
  focus: CityFocus;
  animated: boolean;
  onHover?: BracketCityProps['onHover'];
  onPick?: BracketCityProps['onPick'];
}

/** The category band at each tower's far end: a thin band, not a cap. */
const CAP = 0.013;

interface Tones {
  gain: Color;
  loss: Color;
  gainRim: Color;
  lossRim: Color;
  /** The light inside the glass (its emissive), in the direction's own tone. */
  glowGain: Color;
  glowLoss: Color;
  /** What a dimmed tower fades toward: paper by day, the night room by night. */
  rest: Color;
  cap: Record<string, Color>;
}

function useTones(p: ScenePalette): Tones {
  return useMemo(() => {
    const cats = CATEGORY_COLORS[p.night ? 'dark' : 'light'];
    return {
      // Tinted glass: the direction's colour, lightened as clear glass is.
      gain: new Color(mixHex(p.gain, '#FFFFFF', p.night ? 0.16 : 0.3)),
      loss: new Color(mixHex(p.loss, '#FFFFFF', p.night ? 0.16 : 0.3)),
      gainRim: new Color(mixHex(p.gain, '#FFFFFF', 0.5)),
      lossRim: new Color(mixHex(p.loss, '#FFFFFF', 0.5)),
      glowGain: new Color(p.gain),
      glowLoss: new Color(p.loss),
      rest: new Color(p.night ? mixHex(p.surface, p.ink, 0.3) : mixHex(p.paper, p.ink, 0.22)),
      cap: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, new Color(v)])),
    };
  }, [p]);
}

function Towers({ layout, focus, animated, onHover, onPick }: TowersProps) {
  const p = useScenePalette();
  const tones = useTones(p);
  const { element } = useViewState();
  const towers = useMemo(() => layout.towers.filter((t) => t.dir !== 0), [layout]);
  const hovered = useRef(-1);

  const geo = useMemo(
    () => ({
      // Darker where each tower meets the street: cheap occlusion in vertex colours.
      bodies: towers.map((t) => {
        const g = prism(t.width, t.y0, t.y1, 0.018);
        const reach = Math.min(0.3, t.height);
        return t.dir > 0 ? occlude(g, t.y0, t.y0 + reach, 0.32) : occlude(g, t.y1, t.y1 - reach, 0.3);
      }),
      caps: towers.map((t) => {
        const h = Math.min(CAP, t.height * 0.4);
        const w = t.width + 0.012;
        const g = new BoxGeometry(w, h, w);
        g.translate(0, t.dir > 0 ? t.y1 - h / 2 - 0.008 : t.y0 + h / 2 + 0.008, 0);
        return g;
      }),
      hits: towers.map((t) => {
        const g = new BoxGeometry(t.width + 0.05, t.height + 0.05, t.width + 0.05);
        g.translate(0, (t.y0 + t.y1) / 2, 0);
        return g;
      }),
    }),
    [towers]
  );
  useEffect(() => () => [...geo.bodies, ...geo.caps, ...geo.hits].forEach((g) => g.dispose()), [geo]);

  const mats = useMemo(
    () => ({
      bodies: towers.map(() => towerGlass(CITY.floorDollars * layout.unitsPerDollar)),
      caps: towers.map(() => new MeshStandardMaterial({ roughness: 0.4, metalness: 0, emissive: new Color() })),
    }),
    [towers, layout]
  );
  useEffect(() => () => [...mats.bodies, ...mats.caps].forEach((m) => m.dispose()), [mats]);

  const lit = useRef<number[]>([]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    towers.forEach((t, i) => {
      const goal = towerEmphasis(focus, t.bracket, t.category) + (hovered.current === i ? 0.2 : 0);
      const prev = lit.current[i] ?? goal;
      const e = animated ? prev + (goal - prev) * (1 - Math.exp(-dt * 7)) : goal;
      lit.current[i] = e;
      const full = Math.min(1, e);
      const gain = t.dir > 0;
      const body = mats.bodies[i];
      // A dimmed tower keeps a trace of its direction's colour.
      body.color.lerpColors(tones.rest, gain ? tones.gain : tones.loss, 0.3 + 0.7 * full);
      // A low inner glow, never a neon tube: by night the rim light and the
      // studio's reflections carry the glass, by day the paper shows through.
      body.emissive.copy(gain ? tones.glowGain : tones.glowLoss);
      body.emissiveIntensity = (p.night ? 0.3 : 0.08) * (0.15 + 0.85 * e * e) * (gain ? 1 : 1.2);
      // Costs sit behind the acrylic, so they start a little more solid.
      body.opacity = (gain ? 0.32 : 0.48) + (p.night ? 0.2 : 0.26) * full;
      const rim = body.userData.rim as { uRimColor: { value: Color }; uRimStrength: { value: number } };
      rim.uRimColor.value.copy(gain ? tones.gainRim : tones.lossRim);
      rim.uRimStrength.value = (p.night ? 1.05 : 1.1) * (0.3 + 0.7 * full);
      const cap = mats.caps[i];
      const capTone = tones.cap[t.category] ?? tones.rest;
      // The category band, muted: a quiet key to the legend, not a light.
      cap.color.lerpColors(tones.rest, capTone, (0.25 + 0.75 * full) * 0.7);
      cap.emissive.copy(capTone);
      cap.emissiveIntensity = (p.night ? 0.12 : 0.04) * full;
    });
  });

  const hitOf = (i: number): CityHit => ({ bracket: towers[i].bracket, category: towers[i].category });
  const setCursor = (c: string) => {
    if (element && element.style.cursor !== 'grabbing') element.style.cursor = c;
  };

  // The pointer can leave the box straight from a tower (the stage then stops
  // raycasting this view, so no pointer-out arrives): let go of the hover.
  useEffect(() => {
    if (!element) return;
    const leave = () => {
      if (hovered.current === -1) return;
      hovered.current = -1;
      if (element.style.cursor === 'pointer') element.style.cursor = '';
      onHover?.(null);
    };
    element.addEventListener('pointerleave', leave);
    return () => element.removeEventListener('pointerleave', leave);
  }, [element, onHover]);

  return (
    <>
      {towers.map((t, i) => (
        <group key={`${t.bracket}-${t.category}`} position={[t.x, 0, t.z]} rotation={[0, t.yaw, 0]}>
          {t.dir > 0 && <ContactBlob width={t.width * 2.8} depth={t.width * 2.8} position={[-0.035, 0.0016, -0.03]} strength={0.75} />}
          <mesh geometry={geo.bodies[i]} material={mats.bodies[i]} renderOrder={t.dir < 0 ? 1 : 5} />
          <mesh geometry={geo.caps[i]} material={mats.caps[i]} />
          <mesh
            geometry={geo.hits[i]}
            visible={false}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              hovered.current = i;
              setCursor('pointer');
              onHover?.(hitOf(i), { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            }}
            onPointerMove={(e: ThreeEvent<PointerEvent>) => {
              if (hovered.current === i) onHover?.(hitOf(i), { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            }}
            onPointerOut={() => {
              if (hovered.current !== i) return;
              hovered.current = -1;
              setCursor('');
              onHover?.(null);
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              // A drag that ends over a tower isn't a pick.
              if (e.delta > 6) return;
              e.stopPropagation();
              onPick?.(hitOf(i));
            }}
          />
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The violet lamp: a light over the picked district, a pool of violet on the
// paper beneath it and (tier 2) a faint beam between them. With no bracket
// picked it rests, dim, over the middle of the city.

function FocusLamp({ layout, focus, animated }: { layout: CityLayout; focus: CityFocus; animated: boolean }) {
  const p = useScenePalette();
  const tier = useKitTier();
  const light = useRef<PointLight>(null);
  const pool = useRef<Mesh>(null);
  const beam = useRef<Mesh>(null);
  const state = useMemo(() => ({ x: 0, z: 0, yaw: 0, on: 0 }), []);

  const pick = focus.bracket ? layout.districts.find((d) => d.bracket === focus.bracket) : undefined;
  const middle = layout.districts[Math.floor(layout.districts.length / 2)];
  const lot = layout.districts[0];
  const beamHeight = layout.top + 1.2;

  const mats = useMemo(() => ({ pool: lightMaterial(POOL_VERTEX, POOL_FRAGMENT), beam: lightMaterial(BEAM_VERTEX, BEAM_FRAGMENT) }), []);
  const beamGeo = useMemo(() => {
    const g = new CylinderGeometry(0.3, (lot?.width ?? 1) * 0.62, 1, 48, 1, true);
    g.translate(0, 0.5, 0);
    return g;
  }, [lot]);
  useEffect(
    () => () => {
      mats.pool.dispose();
      mats.beam.dispose();
      beamGeo.dispose();
    },
    [mats, beamGeo]
  );
  useEffect(() => {
    const color = p.night ? p.violetLight : p.glow;
    mats.pool.uniforms.uColor.value.set(color);
    mats.beam.uniforms.uColor.value.set(color);
    mats.pool.uniforms.uAdd.value = p.night ? 0.85 : 0.15;
    mats.beam.uniforms.uAdd.value = p.night ? 1 : 0.6;
  }, [mats, p]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const at = pick ?? middle;
    const goalOn = pick ? 1 : 0;
    if (animated) {
      damp(state, 'x', at?.x ?? 0, 0.4, dt);
      damp(state, 'z', at?.z ?? 0, 0.4, dt);
      damp(state, 'yaw', at?.yaw ?? 0, 0.4, dt);
      damp(state, 'on', goalOn, 0.3, dt);
    } else {
      state.x = at?.x ?? 0;
      state.z = at?.z ?? 0;
      state.yaw = at?.yaw ?? 0;
      state.on = goalOn;
    }
    if (light.current) {
      light.current.position.set(state.x, layout.top * 0.9 + 0.8, state.z + 0.4);
      light.current.intensity = (p.night ? 6 : 3.5) * state.on;
    }
    if (pool.current) {
      pool.current.position.set(state.x, 0.0012, state.z);
      pool.current.rotation.set(-Math.PI / 2, 0, state.yaw);
    }
    mats.pool.uniforms.uStrength.value = (p.night ? 0.6 : 0.42) * state.on;
    if (beam.current) {
      beam.current.position.set(state.x, 0, state.z);
      beam.current.visible = state.on > 0.01;
    }
    mats.beam.uniforms.uStrength.value = (p.night ? 0.2 : 0.12) * state.on;
  });

  return (
    <>
      <pointLight ref={light} intensity={0} distance={4} decay={1.5} color={p.night ? p.violetLight : p.glow} />
      <mesh ref={pool} material={mats.pool} renderOrder={4}>
        <planeGeometry args={[(lot?.width ?? 1) * 1.9, (lot?.depth ?? 0.6) * 2.6]} />
      </mesh>
      {tier === 2 && <mesh ref={beam} geometry={beamGeo} material={mats.beam} scale={[1, beamHeight, 1]} renderOrder={6} />}
    </>
  );
}

// ---------------------------------------------------------------------------

export default function BracketCity({ data, focus, compact = false, onHover, onPick, labels }: BracketCityProps) {
  const tier = useKitTier();
  const animated = useAnimated(tier === 2 ? 60 : 30);
  const reduced = usePrefersReducedMotion();
  const invalidate = useThree((s) => s.invalidate);
  const layout = useMemo(() => cityLayout(data, { compact }), [data, compact]);

  const bracket = focus?.bracket ?? null;
  const category = focus?.category ?? null;
  const stable = useMemo<CityFocus>(() => ({ bracket, category }), [bracket, category]);
  // Without the animation clock (reduced motion, or off screen) a new focus still needs a frame.
  useEffect(() => invalidate(), [stable, invalidate]);

  return (
    <>
      <CityRig layout={layout} focus={stable} animated={animated} reduced={reduced} labels={labels} />
      <CityLights />
      <PlinthBand layout={layout} />
      <Lots layout={layout} focus={stable} animated={animated} />
      <FocusLamp layout={layout} focus={stable} animated={animated} />
      <Towers layout={layout} focus={stable} animated={animated} onHover={onHover} onPick={onPick} />
      <PostFX />
    </>
  );
}
