'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CustomBlending,
  DataTexture,
  DoubleSide,
  Euler,
  FloatType,
  Matrix4,
  NearestFilter,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Plane,
  Quaternion,
  RGBAFormat,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector3,
  type Camera,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  type PerspectiveCamera as PerspectiveCameraImpl,
  type Points,
} from 'three';
import { damp } from 'maath/easing';
import { filmScene, filmStore, useFilmStore } from '@/lib/three/filmStore';
import { sceneStore } from '@/lib/three/sceneStore';
import { mixHex } from '@/lib/three/palette';
import { useAnimationFrames, usePrefersReducedMotion, useViewState } from '@/components/three/runtime';
import BillSheet from '@/components/three/kit/BillSheet';
import CapitolDome from '@/components/three/kit/CapitolDome';
import SampleDiorama from '@/components/three/kit/SampleDiorama';
import LightParticles from '@/components/three/kit/LightParticles';
import LedgerColumn from '@/components/three/kit/LedgerColumn';
import Plinth from '@/components/three/kit/Plinth';
import PostFX from '@/components/three/kit/PostFX';
import { DIORAMA } from '@/components/three/kit/dioramaLayout';
import { useKitTier, useScenePalette } from '@/components/three/kit/hooks';
import { useWarmup } from '@/components/three/kit/warmup';
import {
  BLEND_LIGHT,
  DUSK_TONES,
  FilmFog,
  FilmLights,
  Glint,
  LIGHT_OUTPUT,
  LightBeam,
  TWILIGHT_TONES,
  VIOLET_HOUR_TONES,
  moteCurves,
} from '@/components/three/scenes/filmParts';
import {
  CAPITOL_PLINTH,
  FILM_LEDGER_AMOUNTS,
  FILM_WIDE_PX,
  FILM_LEDGER_SCALE,
  HOME,
  LANTERN,
  LEDGER_WIDTH,
  PARTICLE_COUNT,
  RECORD_PX,
  SHEET,
  STILL_TIME,
  TIMELINE,
  aspectFit,
  billAt,
  cameraAt,
  cuesAt,
  flowCurves,
  homeToWorld,
  particleLayout,
  poseDistance,
  quadMatrix3d,
  recordShown,
  smoothstep,
  stillProgress,
  type BillPose,
  type CameraPose,
  type FilmCues,
} from '@/components/three/scenes/filmShots';

/*
 * The landing film, "From the Capitol to your kitchen table", as one scene
 * played by filmStore.progress (the DOM side measures the scroll and writes
 * the captions; components/three/scenes/filmShots.ts is the script). The
 * camera follows a single Catmull-Rom path, and the scroll position it
 * follows is damped, so jitter never jerks the frame.
 *
 *   quality 'full'   plays the film (reduced motion: no damping, drift or
 *                    parallax; each scroll step is a still)
 *   quality 'still'  one composed frame of `stillShot` (0–4), for reduced
 *                    motion and posters; it ignores the store
 *
 * Frames: the stage renders on demand. Every change to filmStore asks for
 * one, damping keeps asking until it settles, and while the film section is
 * active (and motion is allowed) the clock idles at 30–60 fps for the drift
 * and fireflies. The canvas is decorative; the meaning is in the captions.
 */

export interface LandingFilmProps {
  quality?: 'full' | 'still';
  /** The shot (0–4) a still frame shows. */
  stillShot?: number;
  /**
   * The bill's official record as DOM type (components/landing/film/BillRecord),
   * absolutely placed at the top left of the view's box: the scene pins it to
   * the glass sheet every frame while the sheet rests in shot 2, and keeps it
   * hidden otherwise. Without one, the sheet shows its embossed text lines.
   */
  record?: RefObject<HTMLElement | null>;
}

/** Everything a frame of the film needs, computed once per frame by the director. */
interface FilmFrame {
  /** Damped film progress. */
  p: number;
  /** Seconds of drift (frozen in stills and under reduced motion). */
  time: number;
  cues: FilmCues;
  bill: BillPose;
  camera: CameraPose;
  pointer: { x: number; y: number };
  /** How much further back than written the camera stands (narrow views). */
  fit: number;
}

const SMOOTH_TIME = 0.32;

/** How far a portrait view raises its picture (a share of its height): none from 4:5 up, 0.14 on a phone. */
function portraitLift(aspect: number): number {
  return Math.min(0.14, Math.max(0, (0.8 - aspect) * 0.42));
}
/** Fastest the film plays when the scroll jumps (progress per second): a jump to the end still travels. */
const MAX_SPEED = 0.9;

function useFilmFrame(initial: number): RefObject<FilmFrame> {
  return useRef<FilmFrame>({
    p: initial,
    time: STILL_TIME,
    cues: cuesAt(initial),
    bill: billAt(initial),
    camera: cameraAt(initial),
    pointer: { x: 0, y: 0 },
    fit: 1,
  });
}

// ---------------------------------------------------------------------------
// The director: damping, cues, the bill's pose and the camera, before anything else draws.

function Director({ frame, still, stillAt, live }: { frame: RefObject<FilmFrame>; still: boolean; stillAt: number; live: boolean }) {
  const camera = useRef<PerspectiveCameraImpl>(null);
  const invalidate = useThree((s) => s.invalidate);
  const reduced = usePrefersReducedMotion();
  const target = useMemo(() => new Vector3(), []);

  // Every step of the scroll draws a frame (the film may be idle otherwise).
  useEffect(() => (still ? undefined : filmStore.subscribe(() => invalidate())), [still, invalidate]);
  // The page around the film follows where the picture is (filmScene).
  useEffect(() => (still ? undefined : () => filmScene.set(null)), [still]);

  useFrame((state, rawDelta) => {
    const f = frame.current;
    const dt = Math.min(rawDelta, 1 / 20);
    const calm = still || reduced;
    let moving = false;

    const goal = still ? stillAt : filmStore.get().progress;
    if (calm) f.p = goal;
    else moving = damp(f, 'p', goal, SMOOTH_TIME, dt, MAX_SPEED, undefined, 1e-4);
    if (!still) filmScene.set(f.p);
    if (live) f.time += dt;
    else if (calm) f.time = STILL_TIME;

    // Parallax for a mouse only (sceneStore keeps touch at 0,0).
    const pointer = calm ? { x: 0, y: 0 } : sceneStore.get().pointer;
    moving = damp(f.pointer, 'x', pointer.x, 0.9, dt) || moving;
    moving = damp(f.pointer, 'y', pointer.y, 0.9, dt) || moving;

    f.cues = cuesAt(f.p);
    billAt(f.p, f.bill);
    // At rest, the sheet floats a little.
    const rest = smoothstep(TIMELINE.bill.arrive - 0.02, TIMELINE.bill.arrive + 0.03, f.p);
    const t = f.time;
    f.bill.position[1] += Math.sin(t * 0.6) * 0.02 * rest;
    f.bill.rotation[0] += Math.sin(t * 0.43) * 0.03 * rest;
    f.bill.rotation[1] += Math.sin(t * 0.31) * 0.07 * rest;

    const cam = camera.current;
    if (cam) {
      const pose = cameraAt(f.p, f.camera);
      const { width, height } = state.size;
      const fit = aspectFit(width / Math.max(1, height), pose.span, poseDistance(pose), pose.fov);
      f.fit = fit.distance;
      const [tx, ty, tz] = pose.target;
      let dx = (pose.position[0] - tx) * fit.distance;
      let dy = (pose.position[1] - ty) * fit.distance;
      let dz = (pose.position[2] - tz) * fit.distance;
      // Parallax and a slow breath: a small orbit around the target.
      const yaw = f.pointer.x * 0.07 + Math.sin(t * 0.21) * 0.012;
      const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
      [dx, dz] = [dx * c + dz * s, -dx * s + dz * c];
      dy += f.pointer.y * 0.18 + Math.sin(t * 0.33) * 0.03;
      cam.position.set(tx + dx, ty + dy, tz + dz);
      target.set(tx, ty, tz);
      cam.lookAt(target);
      cam.fov = pose.fov + fit.fov;
      // Lens shifts (verticals stay straight). Portrait screens: captions
      // take the lower part of the frame, so the picture is raised. The
      // pinned film on a wide screen: captions on the left and the rail on
      // the right, so each shot moves into the band between them.
      const lift = portraitLift(width / Math.max(1, height));
      const shift = !still && width >= FILM_WIDE_PX ? pose.shift : 0;
      if (lift > 0 || shift !== 0) cam.setViewOffset(width, height, -shift * width, lift * height, width, height);
      else if (cam.view?.enabled) cam.clearViewOffset();
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    }
    if (moving) invalidate();
  }, -1);

  return <PerspectiveCamera ref={camera} makeDefault near={0.1} far={80} fov={30} />;
}

// ---------------------------------------------------------------------------
// The dusk sky: a full-view gradient behind everything, faded in with dusk.

const SKY_VERTEX = /* glsl */ `
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
varying vec3 vDir;
void main() {
  vec4 v = uProjInv * vec4(position.xy, 1.0, 1.0);
  vDir = (uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz;
  gl_Position = vec4(position.xy, 0.99999, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uUpper;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uGround;
uniform vec3 uZenithT;
uniform vec3 uUpperT;
uniform vec3 uHorizonT;
uniform vec3 uGlowT;
uniform vec3 uGroundT;
uniform vec3 uZenithV;
uniform vec3 uUpperV;
uniform vec3 uHorizonV;
uniform vec3 uGlowV;
uniform vec3 uGroundV;
uniform float uNight;
uniform float uOpacity;
varying vec3 vDir;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Twilight → the violet hour → night: a quadratic blend through the middle tone.
vec3 tone(vec3 t, vec3 v, vec3 n, float k) {
  return mix(mix(t, v, k), mix(v, n, k), k);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float n = uNight;
  vec3 horizon = tone(uHorizonT, uHorizonV, uHorizon, n);
  vec3 sky = mix(horizon, tone(uUpperT, uUpperV, uUpper, n), smoothstep(0.0, 0.2, h));
  sky = mix(sky, tone(uZenithT, uZenithV, uZenith, n), smoothstep(0.18, 0.75, h));
  vec3 ground = mix(horizon, tone(uGroundT, uGroundV, uGround, n), smoothstep(0.0, 0.22, -h));
  vec3 col = mix(ground, sky, smoothstep(-0.015, 0.015, h));
  // A band of afterglow on the horizon.
  col += tone(uGlowT, uGlowV, uGlow, n) * exp(-abs(h - 0.01) * 26.0) * 0.32;
  // A few first stars, high up, once it's dark.
  vec2 cell = floor(vec2(atan(d.z, d.x) * 140.0, h * 220.0));
  float star = step(0.9965, hash(cell)) * smoothstep(0.12, 0.5, h) * (0.5 + 0.5 * hash(cell + 3.1));
  col += vec3(star * 0.55 * n);
  // Dither, so the gradient never bands.
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, uOpacity);
  #include <colorspace_fragment>
}
`;

function Sky({ frame }: { frame: RefObject<FilmFrame> }) {
  const p = useScenePalette();
  const mesh = useRef<Mesh>(null);
  const warmup = useWarmup();
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uProjInv: { value: new Matrix4() },
          uCamWorld: { value: new Matrix4() },
          uZenith: { value: new Color(DUSK_TONES.zenith) },
          uUpper: { value: new Color(DUSK_TONES.upper) },
          uHorizon: { value: new Color(DUSK_TONES.horizon) },
          uGlow: { value: new Color(DUSK_TONES.glow) },
          uGround: { value: new Color(DUSK_TONES.ground) },
          uZenithT: { value: new Color(TWILIGHT_TONES.zenith) },
          uUpperT: { value: new Color(TWILIGHT_TONES.upper) },
          uHorizonT: { value: new Color(TWILIGHT_TONES.horizon) },
          uGlowT: { value: new Color(TWILIGHT_TONES.glow) },
          uGroundT: { value: new Color(TWILIGHT_TONES.ground) },
          uZenithV: { value: new Color(VIOLET_HOUR_TONES.zenith) },
          uUpperV: { value: new Color(VIOLET_HOUR_TONES.upper) },
          uHorizonV: { value: new Color(VIOLET_HOUR_TONES.horizon) },
          uGlowV: { value: new Color(VIOLET_HOUR_TONES.glow) },
          uGroundV: { value: new Color(VIOLET_HOUR_TONES.ground) },
          uNight: { value: 0 },
          uOpacity: { value: 0 },
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        // Drawn first in the opaque pass (a transparent material would be
        // drawn after the scene, over it); custom blending still blends it
        // over the ambient field.
        transparent: false,
        blending: CustomBlending,
        blendSrc: SrcAlphaFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneMinusSrcAlphaFactor,
        depthTest: false,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera }) => {
    const d = frame.current.cues.dusk;
    // By day the sky comes in quickly as twilight and deepens to night; by
    // night the Chamber is already behind the view, and the sky only deepens it.
    const opacity = p.night ? d * 0.6 : Math.min(1, d / 0.35);
    material.uniforms.uOpacity.value = opacity;
    material.uniforms.uNight.value = p.night ? 1 : Math.min(1, Math.max(0, (d - 0.3) / 0.7));
    material.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
    material.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    if (mesh.current) mesh.current.visible = opacity > 0.002 || warmup();
  });

  return (
    <mesh ref={mesh} material={material} renderOrder={-100} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// The bill: lifted off the dome, then dissolved top first by a clipping plane
// that the light particles leave from.

const EDGE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const EDGE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uAdd;
varying vec2 vUv;
${LIGHT_OUTPUT}
void main() {
  float across = exp(-pow((vUv.y - 0.5) * 5.0, 2.0));
  float along = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  float a = across * along * uStrength;
  if (a < 0.003) discard;
  gl_FragColor = lightOut(uColor, a, uAdd);
}
`;

/** Sheet-local cut line: kept where (DISSOLVE_X·x + DISSOLVE_Y·y + 0.5 − cut) ≥ 0, matching particleLayout's release order. */
const DISSOLVE_X = 0.08 / SHEET.width;
const DISSOLVE_Y = -0.88;

/** The record's plane: just in front of the sheet's face (BillSheet's text lines sit at 0.0064). */
const RECORD_Z = 0.0072;
const RECORD_CORNERS: readonly (readonly [number, number])[] = [
  [-SHEET.width / 2, SHEET.height / 2],
  [SHEET.width / 2, SHEET.height / 2],
  [SHEET.width / 2, -SHEET.height / 2],
  [-SHEET.width / 2, -SHEET.height / 2],
];

/**
 * Pins the DOM record onto the sheet's face: its four corners projected
 * into the view's box, as one matrix3d(). Hidden whenever the record isn't
 * due, the view isn't on screen, or the sheet is edge-on or behind the camera.
 */
function useRecordPin(record: RefObject<HTMLElement | null> | undefined) {
  const { visible } = useViewState();
  const scratch = useMemo(() => ({ v: new Vector3(), px: [[0, 0], [0, 0], [0, 0], [0, 0]] as [number, number][], shown: false }), []);
  useEffect(
    () => () => {
      const el = record?.current;
      if (el) {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
      }
    },
    [record]
  );
  return (g: Group, camera: Camera, size: { width: number; height: number }, amount: number) => {
    const el = record?.current;
    if (!el) return;
    let transform: string | null = null;
    if (amount > 0.002 && visible) {
      let behind = false;
      RECORD_CORNERS.forEach(([x, y], i) => {
        const v = scratch.v.set(x, y, RECORD_Z).applyMatrix4(g.matrixWorld).project(camera);
        if (v.z > 1 || v.z < -1) behind = true;
        scratch.px[i][0] = ((v.x + 1) / 2) * size.width;
        scratch.px[i][1] = ((1 - v.y) / 2) * size.height;
      });
      const [tl, tr, br, bl] = scratch.px;
      if (!behind) transform = quadMatrix3d(SHEET.width * RECORD_PX, SHEET.height * RECORD_PX, tl, tr, br, bl);
    }
    if (transform) {
      el.style.transform = transform;
      el.style.opacity = amount.toFixed(3);
      if (!scratch.shown) el.style.visibility = 'visible';
      scratch.shown = true;
    } else if (scratch.shown) {
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
      scratch.shown = false;
    }
  };
}

function FilmBill({ frame, record }: { frame: RefObject<FilmFrame>; record?: RefObject<HTMLElement | null> }) {
  const p = useScenePalette();
  const gl = useThree((s) => s.gl);
  const pose = useRef<Group>(null);
  const sheet = useRef<Group>(null);
  const edge = useRef<Mesh>(null);
  const clip = useMemo(() => ({ local: new Plane(), world: new Plane(), tagged: new WeakSet<Material>(), shown: true }), []);
  const euler = useMemo(() => new Euler(0, 0, 0, 'YXZ'), []);
  const warmup = useWarmup();
  const veiled = useRef(true);
  const halo = useMemo(() => () => (veiled.current ? 0 : 0.55 * (1 - frame.current.bill.cut)), [frame]);
  const additive = useMemo(() => () => (p.night ? 1 : 0.3), [p]);
  const pin = useRecordPin(record);
  // The embossed lines give way to the record while it is printed on the sheet.
  const text = useMemo(() => (record ? () => 1 - recordShown(frame.current.p) : undefined), [record, frame]);

  useEffect(() => {
    const previous = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = previous;
    };
  }, [gl]);

  const edgeMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uStrength: { value: 0 }, uAdd: { value: 0 } },
        vertexShader: EDGE_VERTEX,
        fragmentShader: EDGE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        ...BLEND_LIGHT,
      }),
    []
  );
  useEffect(() => () => edgeMaterial.dispose(), [edgeMaterial]);
  useEffect(() => {
    edgeMaterial.uniforms.uColor.value.set(p.night ? p.violetLight : p.violet);
    edgeMaterial.uniforms.uAdd.value = p.night ? 1 : 0.35;
  }, [edgeMaterial, p]);

  useFrame(({ camera, size }) => {
    const g = pose.current;
    const s = sheet.current;
    if (!g || !s) return;
    const bill = frame.current.bill;
    // Until the view has drawn on screen, the sheet draws too (fully clipped),
    // so its glass compiles behind the poster rather than when it first appears.
    const warm = warmup();
    veiled.current = !bill.visible;
    const shown = bill.visible || warm;
    g.visible = shown;
    const each = (fn: (m: Material) => void) =>
      s.traverse((o: Object3D) => {
        const m = (o as Mesh).material as Material | Material[] | undefined;
        if (Array.isArray(m)) m.forEach(fn);
        else if (m) fn(m);
      });
    // Every material on the sheet is clipped by the cut (compiled into its shader once).
    each((m) => {
      if (clip.tagged.has(m)) return;
      clip.tagged.add(m);
      m.clippingPlanes = [clip.world];
      m.needsUpdate = true;
    });
    // Hidden materials skip their transmission passes too.
    if (shown !== clip.shown) {
      clip.shown = shown;
      each((m) => {
        m.visible = shown;
      });
    }
    if (!shown) {
      pin(g, camera, size, 0);
      return;
    }

    g.position.set(...bill.position);
    euler.set(bill.rotation[0], bill.rotation[1], bill.rotation[2], 'YXZ');
    g.rotation.copy(euler);
    g.scale.setScalar(bill.scale);
    g.updateMatrixWorld();
    pin(g, camera, size, bill.visible ? recordShown(frame.current.p) : 0);

    // The cut, from the top down (past the far corner while it only warms up).
    const cut = bill.visible ? bill.cut : 1.2;
    const n = Math.hypot(DISSOLVE_X, DISSOLVE_Y);
    clip.local.normal.set(DISSOLVE_X / n, DISSOLVE_Y / n, 0);
    clip.local.constant = (0.5 - cut + 0.02) / n;
    clip.world.copy(clip.local).applyMatrix4(g.matrixWorld);

    // A line of light along the cut while it travels.
    const e = edge.current;
    if (e) {
      const live = cut > 0.001 && cut < 0.999;
      e.visible = live || warm;
      edgeMaterial.uniforms.uStrength.value = 0;
      if (live) {
        // Where the cut line crosses the sheet's centre line, and its tilt.
        e.position.set(0, (0.5 - cut + 0.02) / -DISSOLVE_Y, 0.008);
        e.rotation.set(0, 0, Math.atan2(DISSOLVE_X, -DISSOLVE_Y));
        edgeMaterial.uniforms.uStrength.value = Math.sin(Math.PI * Math.min(1, cut * 1.1)) * 0.9;
      }
    }
  });

  return (
    <group ref={pose} visible={false}>
      {/* Light behind the glass: the sheet reads as lit from within. */}
      <Glint position={[0, 0, -0.06]} size={1.7} rays={0} strength={halo} additive={additive} />
      <group ref={sheet}>
        <BillSheet material="glass" float={false} text={text} />
      </group>
      <mesh ref={edge} material={edgeMaterial} visible={false} renderOrder={4}>
        <planeGeometry args={[SHEET.width * 1.04, 0.05]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// The light: one point cloud that leaves the sheet, streams into the house,
// rises into the ledger and, at dusk, partly comes back out as fireflies.

const SAMPLES = 128;

const PARTICLE_VERTEX = /* glsl */ `
uniform sampler2D uCurves;
uniform float uSamples;
uniform float uRows1;
uniform mat4 uSheet;
uniform float uStream;
uniform float uStagger1;
uniform float uSettle;
uniform float uStagger2;
uniform float uFlies;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uFlight;
uniform vec3 uGain;
uniform vec3 uLoss;
uniform vec3 uFirefly;
attribute vec2 aSheet;
attribute vec4 aOrder;
attribute vec3 aHome;
attribute vec3 aSlot;
attribute vec3 aFly;
attribute vec2 aRows;
attribute float aKind;
varying vec3 vColor;
varying float vAlpha;
varying float vFirefly;

vec3 curvePoint(float row, float t) {
  float x = clamp(t, 0.0, 1.0) * (uSamples - 1.0);
  int i0 = int(floor(x));
  int i1 = min(i0 + 1, int(uSamples) - 1);
  vec3 a = texelFetch(uCurves, ivec2(i0, int(row)), 0).xyz;
  vec3 b = texelFetch(uCurves, ivec2(i1, int(row)), 0).xyz;
  return mix(a, b, fract(x));
}

float ease(float t) {
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  // Shot 3: born when the cut passes it, then off along its stream into the house.
  float born = step(aOrder.x * uStagger1, uStream) * step(0.0001, uStream);
  float l1 = clamp((uStream - aOrder.x * uStagger1) / (1.0 - uStagger1), 0.0, 1.0);
  // Shot 4: up out of the house and into its slab, from the baseline out.
  float l2 = clamp((uSettle - aOrder.y * uStagger2) / (1.0 - uStagger2), 0.0, 1.0);
  float e1 = ease(l1);
  float e2 = ease(l2);

  vec3 sheetPoint = (uSheet * vec4(aSheet, 0.01, 1.0)).xyz;
  float r1 = aRows.x;
  float r2 = uRows1 + aRows.y;
  // Each particle leaves its own point and lands on its own point; in between it joins a stream.
  vec3 p1 = curvePoint(r1, e1)
    + (sheetPoint - curvePoint(r1, 0.0)) * (1.0 - smoothstep(0.0, 0.45, e1))
    + (aHome - curvePoint(r1, 1.0)) * smoothstep(0.55, 1.0, e1);
  vec3 p2 = curvePoint(r2, e2)
    + (aHome - curvePoint(r2, 0.0)) * (1.0 - smoothstep(0.0, 0.35, e2))
    + (aSlot - curvePoint(r2, 1.0)) * smoothstep(0.6, 1.0, e2);
  float second = step(0.00001, l2);
  vec3 p = mix(p1, p2, second);

  // Loose in flight, gathered at both ends.
  float seed = aOrder.w * 6.2831853;
  float flight = mix(sin(3.14159265 * e1), sin(3.14159265 * e2), second);
  vec3 jitter = vec3(fract(aOrder.w * 91.7), fract(aOrder.w * 53.3), fract(aOrder.w * 27.1)) - 0.5;
  vec3 drift = vec3(sin(uTime * 0.9 + seed * 7.0), cos(uTime * 0.7 + seed * 5.0), sin(uTime * 0.8 + seed * 3.0));
  p += (jitter * 0.2 + drift * 0.025) * flight;

  float alpha = born * (1.0 - smoothstep(0.86, 1.0, l2));
  vec3 color = mix(uFlight, aKind > 0.0 ? uGain : uLoss, smoothstep(0.35, 0.85, e2));
  // A spark as it lands.
  float size = 1.0 + 0.6 * exp(-pow((l2 - 0.93) * 14.0, 2.0));

  // Dusk: some come back out and roam, blinking.
  vFirefly = 0.0;
  if (aOrder.z >= 0.0) {
    float l5 = clamp((uFlies - aOrder.z * 0.5) / 0.5, 0.0, 1.0);
    float e5 = ease(l5);
    vec3 roam = aFly + vec3(sin(uTime * 0.31 + seed), 0.6 * sin(uTime * 0.47 + seed * 2.0), cos(uTime * 0.27 + seed * 3.0)) * 0.12;
    p = mix(p, roam, e5);
    float blink = 0.55 + 0.45 * sin(uTime * (1.1 + aOrder.w) + seed * 4.0);
    alpha = max(alpha, smoothstep(0.0, 0.3, l5) * blink);
    color = mix(color, uFirefly, smoothstep(0.0, 0.5, l5));
    size *= mix(1.0, 4.0, e5);
    vFirefly = e5;
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float scale = 0.45 + aOrder.w * aOrder.w * aOrder.w * 1.1;
  gl_PointSize = clamp(uSize * scale * size * uPixelRatio / max(-mv.z, 0.1), 1.0, 40.0 * uPixelRatio);
  vColor = color;
  vAlpha = alpha;
}
`;

const PARTICLE_FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform float uAdd;
varying vec3 vColor;
varying float vAlpha;
varying float vFirefly;
${LIGHT_OUTPUT}
void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  // Fireflies: a bright centre in a soft halo.
  float glow = mix(core * core, core * core * core * 0.55 + exp(-d * d * 90.0), vFirefly);
  float a = glow * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = lightOut(vColor, a, uAdd);
}
`;

function FilmParticles({ frame }: { frame: RefObject<FilmFrame> }) {
  const tier = useKitTier();
  const p = useScenePalette();
  const gl = useThree((s) => s.gl);
  const points = useRef<Points>(null);
  const warmup = useWarmup();
  const scratch = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), e: new Euler(0, 0, 0, 'YXZ'), v: new Vector3(), s: new Vector3() }), []);

  const { texture, rows1 } = useMemo(() => {
    const { leg1, leg2 } = flowCurves();
    const all = [...leg1, ...leg2];
    const data = new Float32Array(SAMPLES * all.length * 4);
    const v = new Vector3();
    all.forEach((pts, row) => {
      const curve = new CatmullRomCurve3(
        pts.map(([x, y, z]) => new Vector3(x, y, z)),
        false,
        'centripetal'
      );
      for (let i = 0; i < SAMPLES; i++) {
        curve.getPointAt(i / (SAMPLES - 1), v);
        data.set([v.x, v.y, v.z, 1], (row * SAMPLES + i) * 4);
      }
    });
    const tex = new DataTexture(data, SAMPLES, all.length, RGBAFormat, FloatType);
    // Float textures can't be filtered everywhere; the shader interpolates itself.
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return { texture: tex, rows1: leg1.length };
  }, []);

  const geometry = useMemo(() => {
    const layout = particleLayout(PARTICLE_COUNT[tier]);
    const g = new BufferGeometry();
    // Positions come from the shader; this only sizes the draw.
    g.setAttribute('position', new BufferAttribute(new Float32Array(layout.count * 3), 3));
    g.setAttribute('aSheet', new BufferAttribute(layout.sheet, 2));
    g.setAttribute('aOrder', new BufferAttribute(layout.order, 4));
    g.setAttribute('aHome', new BufferAttribute(layout.home, 3));
    g.setAttribute('aSlot', new BufferAttribute(layout.slot, 3));
    g.setAttribute('aFly', new BufferAttribute(layout.fly, 3));
    g.setAttribute('aRows', new BufferAttribute(layout.rows, 2));
    g.setAttribute('aKind', new BufferAttribute(layout.kind, 1));
    return g;
  }, [tier]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uCurves: { value: null },
          uSamples: { value: SAMPLES },
          uRows1: { value: 0 },
          uSheet: { value: new Matrix4() },
          uStream: { value: 0 },
          uStagger1: { value: TIMELINE.stream.stagger },
          uSettle: { value: 0 },
          uStagger2: { value: TIMELINE.settle.stagger },
          uFlies: { value: 0 },
          uTime: { value: 0 },
          uSize: { value: 20 },
          uPixelRatio: { value: 1 },
          uFlight: { value: new Color() },
          uGain: { value: new Color() },
          uLoss: { value: new Color() },
          uFirefly: { value: new Color() },
          uOpacity: { value: 0.9 },
          uAdd: { value: 0 },
        },
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        ...BLEND_LIGHT,
      }),
    []
  );

  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const u = material.uniforms;
    u.uCurves.value = texture;
    u.uRows1.value = rows1;
    u.uFlight.value.set(p.particle);
    u.uGain.value.set(p.gain);
    u.uLoss.value.set(p.loss);
    u.uFirefly.value.set(mixHex(p.violetLight, mixHex(p.paper, p.gold, 0.5), 0.35));
    u.uSize.value = p.night ? 18 : 20;
  }, [material, texture, rows1, p]);

  useFrame(() => {
    const f = frame.current;
    const { cues, bill } = f;
    const u = material.uniforms;
    // Drawn (every particle discarded) until the view is on screen, so it compiles early.
    const on = cues.stream > 0 || warmup();
    if (points.current) points.current.visible = on;
    if (!on) return;
    scratch.e.set(bill.rotation[0], bill.rotation[1], bill.rotation[2], 'YXZ');
    scratch.q.setFromEuler(scratch.e);
    u.uSheet.value.compose(scratch.v.set(...bill.position), scratch.q, scratch.s.setScalar(bill.scale));
    u.uStream.value = cues.stream;
    u.uSettle.value = cues.settle;
    u.uFlies.value = cues.fireflies;
    u.uTime.value = f.time;
    u.uPixelRatio.value = gl.getPixelRatio();
    u.uAdd.value = p.night ? 1 : cues.dusk;
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} visible={false} />;
}

// ---------------------------------------------------------------------------

const HOUSE = DIORAMA.house;
/** Lamplight spills out of the front door at dusk. */
const PORCH: [number, number, number] = homeToWorld([HOUSE.center[0], 0.28, HOUSE.center[2] + HOUSE.depth / 2 + 0.35]);

export default function LandingFilm({ quality = 'full', stillShot = 0, record }: LandingFilmProps) {
  const still = quality === 'still';
  const stillAt = stillProgress(stillShot);
  const tier = useKitTier();
  const reduced = usePrefersReducedMotion();
  const { visible } = useViewState();
  const active = useFilmStore((s) => s.active);
  const palette = useScenePalette();
  const frame = useFilmFrame(still ? stillAt : filmStore.get().progress);
  // Drift and fireflies move whenever the film is on screen and motion is
  // allowed; while its section is active the clock runs to show them (a
  // still frame never needs it).
  const live = !still && !reduced && visible;
  useAnimationFrames(live && active, tier === 2 ? 60 : 30);

  const motes = useMemo(moteCurves, []);
  const cue = useMemo(
    () => ({
      dusk: () => frame.current.cues.dusk,
      beam: () => frame.current.cues.beam,
      lantern: () => Math.max(frame.current.cues.beam * 0.85, frame.current.cues.dusk),
      windows: () => frame.current.cues.windows,
      fill: () => frame.current.cues.fill,
      mark: () => frame.current.cues.mark,
      time: () => frame.current.time,
      fit: () => frame.current.fit,
      // Light adds up by night (and as dusk falls); by day it is violet on the paper.
      additive: () => (palette.night ? 1 : frame.current.cues.dusk),
    }),
    [frame, palette]
  );

  return (
    <>
      <Director frame={frame} still={still} stillAt={stillAt} live={live} />
      <Sky frame={frame} />
      <FilmLights dusk={cue.dusk} warmAt={PORCH} />
      <FilmFog dusk={cue.dusk} scale={cue.fit} />

      {/* The Capitol on its plinth, with the beam and glint at the lantern. */}
      <Plinth radius={CAPITOL_PLINTH.radius} height={CAPITOL_PLINTH.height} />
      <CapitolDome />
      <LightBeam position={[LANTERN[0], LANTERN[1] + 0.1, LANTERN[2]]} strength={cue.beam} additive={cue.additive} />
      <Glint position={[LANTERN[0], LANTERN[1] + 0.02, LANTERN[2]]} size={0.9} strength={cue.lantern} time={cue.time} additive={cue.additive} />
      <LightParticles curves={motes} count={tier === 2 ? 900 : 380} speed={0.025} spread={0.55} size={13} opacity={0.55} />

      <FilmBill frame={frame} record={record} />

      {/* The household, and its ledger. */}
      <group position={[...HOME.position]} rotation={[0, HOME.rotationY, 0]}>
        <SampleDiorama glow={cue.windows} dusk={cue.dusk} />
        <LedgerColumn
          amounts={FILM_LEDGER_AMOUNTS}
          unitsPerDollar={FILM_LEDGER_SCALE}
          width={LEDGER_WIDTH}
          position={[...DIORAMA.ledger]}
          fill={cue.fill}
          mark={cue.mark}
          glow={cue.dusk}
        />
      </group>

      <FilmParticles frame={frame} />
      <PostFX />
    </>
  );
}
