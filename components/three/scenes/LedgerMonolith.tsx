'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  type InstancedMesh,
  type Mesh,
  type PerspectiveCamera as PerspectiveCameraImpl,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { damp } from 'maath/easing';
import { sceneStore } from '@/lib/three/sceneStore';
import { mixHex, type ScenePalette } from '@/lib/three/palette';
import { LEDGER_VIEW, LEDGER_WORLD, ledgerGeometry, ledgerViewBounds, unprojectLedger, type LedgerGeometry, type LedgerModel } from '@/lib/ledger';
import { useViewState } from '@/components/three/runtime';
import Plinth, { ContactBlob } from '@/components/three/kit/Plinth';
import StudioLights from '@/components/three/kit/StudioLights';
import { useAnimated, useScenePalette } from '@/components/three/kit/hooks';

/*
 * "Your Ledger" (the dashboard): a tall glass monolith on the porcelain
 * plinth, built from the real ledger (lib/ledger.ts, which also lays it
 * out): a porcelain foot, amber cost slabs hanging from a lit violet
 * baseline, teal gain slabs stacked on it, every slab as tall as its
 * dollars on one linear scale, and a clear glass case above them, up to
 * the scale's top (clear glass with a fresnel rim, a lit top edge and one
 * sheen down its front, as the poster draws it: it holds no money, so it
 * must never read as a slab). The slabs are lit glass in the legend's own
 * teal and amber. A ring of light belts the column at the net's height; a slim staff beside it carries
 * a mark per scale step (the page says what a step is worth). Empty, it is a
 * clear column with a dashed baseline. The household isn't drawn here: in
 * miniature beside a column this tall it read as a scale oddity, and the
 * page's greeting shows the user's avatar.
 *
 * Pointing at a slab (or tapping it) slides it out a little and lights it,
 * and reports its id through `onFocus`, so the page's readout can light the
 * same category; the page's `focus` lights a slab the same way. The camera
 * leans after a mouse with some inertia and breathes slowly while idle;
 * under reduced motion (or paused motion) it holds the composed frame and
 * changes land at once. Decorative: every figure is in the DOM.
 */

export interface LedgerMonolithProps {
  model: LedgerModel;
  /** The slab to light (a LedgerSlab id), from the page. */
  focus?: string | null;
  /** A slab pointed at (its id) or let go (null). */
  onFocus?: (id: string | null) => void;
}

const W = LEDGER_WORLD;
const ZERO = { x: 0, y: 0 };
const dt20 = (delta: number) => Math.min(delta, 1 / 20);

// ---------------------------------------------------------------------------
// The camera: the composed three-quarter view, framed for any box.

/** What the camera frames: the plinth and the column, with a little air around them and room for the lean. */
const FRAME = (() => {
  const b = ledgerViewBounds();
  const pad = 1.1;
  return {
    target: unprojectLedger([(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0]),
    halfW: ((b.maxX - b.minX) / 2) * pad,
    halfH: ((b.maxY - b.minY) / 2) * pad,
  };
})();

function LedgerRig({ animated }: { animated: boolean }) {
  const camera = useRef<PerspectiveCameraImpl>(null);
  const { element } = useViewState();
  const state = useMemo(() => ({ x: 0, y: 0, t: 0 }), []);
  const frame = FRAME;

  useFrame((_, delta) => {
    const cam = camera.current;
    if (!cam) return;
    const dt = dt20(delta);
    const pointer = animated ? sceneStore.get().pointer : ZERO;
    if (animated) {
      // Inertial: the lean trails the mouse.
      damp(state, 'x', pointer.x, 0.55, dt);
      damp(state, 'y', pointer.y, 0.55, dt);
      state.t += dt;
    } else {
      state.x = 0;
      state.y = 0;
      state.t = 0;
    }
    const w = Math.max(1, element?.clientWidth ?? 1);
    const h = Math.max(1, element?.clientHeight ?? 1);
    const aspect = w / h;
    const tan = Math.tan(((LEDGER_VIEW.fov * Math.PI) / 180) / 2);
    const distance = Math.max(frame.halfH / tan, frame.halfW / (tan * aspect)) + W.plinth.radius;
    const yaw = LEDGER_VIEW.yaw + state.x * 0.16 + Math.sin(state.t * 0.12) * 0.03;
    const pitch = LEDGER_VIEW.pitch - state.y * 0.05;
    const [tx, ty, tz] = frame.target;
    cam.position.set(tx + Math.sin(yaw) * Math.cos(pitch) * distance, ty + Math.sin(pitch) * distance, tz + Math.cos(yaw) * Math.cos(pitch) * distance);
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.lookAt(tx, ty, tz);
  });

  return <PerspectiveCamera ref={camera} makeDefault near={0.1} far={60} fov={LEDGER_VIEW.fov} position={[3, 2, 7]} />;
}

// ---------------------------------------------------------------------------
// Materials

const RIM_PARS = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRimStrength;
`;

// A fresnel rim in the slab's own colour, so it reads as lit glass at every angle.
const RIM_LIGHT = /* glsl */ `
float rimFacing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
float rimLight = pow(1.0 - rimFacing, 2.4);
outgoingLight += uRimColor * rimLight * uRimStrength;
diffuseColor.a = clamp(diffuseColor.a + rimLight * 0.3, 0.0, 1.0);
#include <opaque_fragment>
`;

function slabGlass() {
  const m = new MeshPhysicalMaterial({
    transparent: true,
    metalness: 0,
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.35,
    emissive: new Color(),
  });
  const uniforms = { uRimColor: { value: new Color() }, uRimStrength: { value: 1.3 } };
  m.userData.rim = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${RIM_PARS}`)
      .replace('#include <opaque_fragment>', RIM_LIGHT);
  };
  m.customProgramCacheKey = () => 'politicon-ledger-slab';
  return m;
}

/** The empty case: the slabs' glass (its fresnel rim lights the rounded edges), without their clearcoat sparkle. */
function caseGlass() {
  const m = slabGlass();
  m.clearcoat = 0;
  m.envMapIntensity = 0.6;
  m.depthWrite = false;
  m.customProgramCacheKey = () => 'politicon-ledger-case';
  return m;
}

/** Brand violet, the baseline's inner light in both palettes. */
const BRAND_VIOLET = '#6D4AFF';

const RING_VERTEX = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// The net's ring: light pooled on a level plane around the column, brightest
// at its faces and fading out, with no corners (a rounded-box distance).
// Premultiplied: violet haze on paper by day (uAdd < 1), added light by night.
const RING_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec2 uHalf;
uniform float uWidth;
uniform float uStrength;
uniform float uAdd;
varying vec2 vP;
void main() {
  vec2 q = abs(vP) - uHalf + 0.03;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.03;
  if (d < 0.0) discard;
  float x = d / uWidth;
  float a = (exp(-x * x * 2.0) * 0.75 + exp(-x * 0.7) * 0.25) * uStrength;
  if (a < 0.003) discard;
  vec4 o = linearToOutputTexel(vec4(uColor, 1.0));
  gl_FragColor = vec4(o.rgb * a, a * (1.0 - uAdd));
}
`;

interface SlabTones {
  gain: Color;
  loss: Color;
  gainRim: Color;
  lossRim: Color;
  glowGain: Color;
  glowLoss: Color;
  /** What a slab dims toward while another is lit. */
  rest: Color;
}

function useSlabTones(p: ScenePalette): SlabTones {
  return useMemo(
    () => ({
      gain: new Color(mixHex(p.gain, '#FFFFFF', p.night ? 0.12 : 0.2)),
      loss: new Color(mixHex(p.loss, '#FFFFFF', p.night ? 0.12 : 0.2)),
      gainRim: new Color(mixHex(p.gain, '#FFFFFF', 0.45)),
      lossRim: new Color(mixHex(p.loss, '#FFFFFF', 0.45)),
      glowGain: new Color(p.gain),
      glowLoss: new Color(p.loss),
      rest: new Color(p.night ? mixHex(p.surface, p.ink, 0.3) : mixHex(p.paper, p.ink, 0.2)),
    }),
    [p]
  );
}

// ---------------------------------------------------------------------------
// The slabs: one mesh each, sliding out and lighting up when focused.

interface SlabsProps {
  geo: LedgerGeometry;
  focus: string | null;
  onFocus?: (id: string | null) => void;
  animated: boolean;
}

function Slabs({ geo, focus, onFocus, animated }: SlabsProps) {
  const p = useScenePalette();
  const tones = useSlabTones(p);
  const { element } = useViewState();
  const slabs = geo.slabs;
  const meshes = useRef<(Mesh | null)[]>([]);
  const lit = useRef<number[]>([]);
  const hovered = useRef<string | null>(null);

  const geos = useMemo(
    () =>
      slabs.map((s) => {
        const h = s.y1 - s.y0;
        const g = new RoundedBoxGeometry(W.width, h, W.depth, 2, Math.min(0.014, h * 0.45));
        g.translate(0, (s.y0 + s.y1) / 2, 0);
        return g;
      }),
    [slabs]
  );
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  const mats = useMemo(() => slabs.map(() => slabGlass()), [slabs]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  const active = slabs.some((s) => s.id === focus) ? focus : null;

  useFrame((_, delta) => {
    const dt = dt20(delta);
    slabs.forEach((s, i) => {
      const goal = s.id === active ? 1 : 0;
      const prev = lit.current[i] ?? goal;
      const e = animated ? prev + (goal - prev) * (1 - Math.exp(-dt * 9)) : goal;
      lit.current[i] = e;
      const dim = active && s.id !== active ? 1 : 0;
      const gain = s.tone === 'gain';
      const m = mats[i];
      m.color.lerpColors(tones.rest, gain ? tones.gain : tones.loss, 1 - dim * 0.45);
      m.emissive.copy(gain ? tones.glowGain : tones.glowLoss);
      // Lit glass at rest (the film's ledger at full light): the front face reads as the legend's teal or amber.
      m.emissiveIntensity = (p.night ? 0.85 : 0.55) + e * 0.3 - dim * 0.45;
      m.opacity = 0.9 + e * 0.08 - dim * 0.32;
      const rim = m.userData.rim as { uRimColor: { value: Color }; uRimStrength: { value: number } };
      rim.uRimColor.value.copy(gain ? tones.gainRim : tones.lossRim);
      rim.uRimStrength.value = 1.1 + e * 0.9 - dim * 0.5;
      const mesh = meshes.current[i];
      if (mesh) mesh.position.z = e * W.slideOut;
    });
  });

  const setCursor = (c: string) => {
    if (element) element.style.cursor = c;
  };
  // The pointer can leave the box straight from a slab (the stage then stops
  // raycasting this view, so no pointer-out arrives): let go of the hover.
  useEffect(() => {
    if (!element) return;
    const leave = (e: PointerEvent) => {
      // A finger lifting "leaves" too; a tap's highlight is the click's to set.
      if (e.pointerType === 'touch' || hovered.current === null) return;
      hovered.current = null;
      element.style.cursor = '';
      onFocus?.(null);
    };
    element.addEventListener('pointerleave', leave);
    return () => element.removeEventListener('pointerleave', leave);
  }, [element, onFocus]);

  return (
    <>
      {slabs.map((s, i) => (
        <mesh
          key={s.id}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={geos[i]}
          material={mats[i]}
          renderOrder={2}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            hovered.current = s.id;
            setCursor('pointer');
            onFocus?.(s.id);
          }}
          onPointerOut={() => {
            if (hovered.current !== s.id) return;
            hovered.current = null;
            setCursor('');
            onFocus?.(null);
          }}
          // A tap on a touch screen lights it (and a second tap lets go).
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch';
            onFocus?.(touch && focus === s.id ? null : s.id);
          }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The column around the slabs: foot, baseline, glass, the net's ring, the staff.

function Column({ geo, animated }: { geo: LedgerGeometry; animated: boolean }) {
  const p = useScenePalette();
  const dashes = useRef<InstancedMesh>(null);
  const ticks = useRef<InstancedMesh>(null);
  const clock = useRef(0);

  const shapes = useMemo(() => {
    const foot = new RoundedBoxGeometry(W.width + 0.012, geo.footTop, W.depth + 0.012, 2, 0.01);
    foot.translate(0, geo.footTop / 2, 0);
    const h = geo.glass.y1 - geo.glass.y0;
    const glass = new RoundedBoxGeometry(W.width, h, W.depth, 3, Math.min(0.02, h * 0.3));
    glass.translate(0, (geo.glass.y0 + geo.glass.y1) / 2, 0);
    // The case's lit edges: its top rim, and faint verticals down the front (the fresnel rim draws the rest),
    // so it reads as clear glass rather than a wire box.
    const [x, z, y0, y1] = [W.width / 2 + 0.001, W.depth / 2 + 0.001, geo.glass.y0, geo.glass.y1];
    const rim = new BufferGeometry();
    rim.setAttribute('position', new Float32BufferAttribute([-x, y1, z, x, y1, z, x, y1, z, x, y1, -z, x, y1, -z, -x, y1, -z, -x, y1, -z, -x, y1, z], 3));
    const verticals = new BufferGeometry();
    verticals.setAttribute('position', new Float32BufferAttribute([-x, y0, z, -x, y1, z, x, y0, z, x, y1, z], 3));
    // One sheen down the front-left edge, as the poster draws it.
    const sheen = new PlaneGeometry(0.02, h * 0.92);
    sheen.translate(-W.width / 2 + 0.03, (y0 + y1) / 2, W.depth / 2 + 0.003);
    const o = W.plate.overhang * 2;
    const plate = new RoundedBoxGeometry(W.width + o, W.plate.thickness, W.depth + o, 2, 0.008);
    // The baseline's violet line: a lit strip along the plate's front and right edges.
    const t = W.plate.thickness * 0.5;
    const lipFront = new BoxGeometry(W.width + o, t, 0.003);
    lipFront.translate(0, 0, (W.depth + o) / 2 + 0.0015);
    const lipSide = new BoxGeometry(0.003, t, W.depth + o);
    lipSide.translate((W.width + o) / 2 + 0.0015, 0, 0);
    const belt = new BoxGeometry(W.width + 0.016, 0.012, W.depth + 0.016);
    // A short pool of light, so the ring seen almost edge-on doesn't streak far past the column.
    const pad = 0.2;
    const ring = new PlaneGeometry(W.width + pad * 2, W.depth + pad * 2);
    ring.rotateX(-Math.PI / 2);
    const staffTop = (1 - W.head) * W.height;
    const staff = new CylinderGeometry(W.staff.radius, W.staff.radius, staffTop, 10);
    staff.translate(0, staffTop / 2, 0);
    const bar = new BoxGeometry(1, 1, 1);
    return { foot, glass, rim, verticals, sheen, plate, lipFront, lipSide, belt, ring, staff, bar };
  }, [geo]);
  useEffect(() => () => Object.values(shapes).forEach((g) => g.dispose()), [shapes]);

  const mats = useMemo(
    () => ({
      porcelain: new MeshStandardMaterial({ roughness: 0.7, metalness: 0, emissive: new Color() }),
      plate: new MeshPhysicalMaterial({ roughness: 0.4, metalness: 0, clearcoat: 0.7, emissive: new Color() }),
      dash: new MeshStandardMaterial({ roughness: 0.6, metalness: 0 }),
      tick: new MeshStandardMaterial({ roughness: 0.6, metalness: 0 }),
      belt: new MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }),
      lip: new MeshBasicMaterial({ toneMapped: false }),
      edge: new LineBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }),
      faint: new LineBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }),
      sheen: new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, toneMapped: false, depthWrite: false }),
      // The empty case: clear glass, its body barely there; the slabs' fresnel rim lights its rounded edges.
      room: caseGlass(),
      ring: new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color() },
          uHalf: { value: new Vector2(W.width / 2 + 0.008, W.depth / 2 + 0.008) },
          uWidth: { value: 0.1 },
          uStrength: { value: 1 },
          uAdd: { value: 0 },
        },
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneMinusSrcAlphaFactor,
      }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useEffect(() => {
    const base = p.night ? p.paper : p.porcelain;
    mats.porcelain.color.set(base);
    mats.porcelain.emissive.set(base);
    mats.porcelain.emissiveIntensity = p.night ? 0.03 : 0.12;
    // The baseline: a plate lit violet from within, its front edge a violet line (the legend's).
    mats.plate.color.set(mixHex(base, p.violet, p.night ? 0.62 : 0.5));
    mats.plate.emissive.set(BRAND_VIOLET);
    mats.plate.emissiveIntensity = p.night ? 0.5 : 0.3;
    mats.lip.color.set(p.violet);
    mats.dash.color.set(mixHex(base, p.ink, p.night ? 0.45 : 0.4));
    mats.tick.color.set(mixHex(base, p.ink, p.night ? 0.35 : 0.45));
    mats.belt.color.set(p.night ? p.violetLight : p.violet);
    mats.edge.color.set(p.night ? p.violetLight : p.violet);
    mats.edge.opacity = p.night ? 0.7 : 0.55;
    mats.faint.color.set(p.night ? p.violetLight : p.violet);
    mats.faint.opacity = p.night ? 0.2 : 0.16;
    mats.sheen.opacity = p.night ? 0.22 : 0.3;
    mats.room.color.set(p.night ? p.violetLight : p.violet);
    mats.room.opacity = p.night ? 0.07 : 0.05;
    const rimLight = mats.room.userData.rim as { uRimColor: { value: Color }; uRimStrength: { value: number } };
    rimLight.uRimColor.value.set(p.night ? p.violetLight : p.glow);
    rimLight.uRimStrength.value = p.night ? 0.85 : 0.5;
    const ring = mats.ring.uniforms;
    ring.uColor.value.set(p.night ? p.violetLight : p.glow);
    ring.uAdd.value = p.night ? 1 : 0.35;
  }, [mats, p]);

  // The empty ledger's dashed baseline, and the staff's marks.
  useLayoutEffect(() => {
    const o = new Object3D();
    const ox = W.width / 2 + W.plate.overhang;
    const oz = W.depth / 2 + W.plate.overhang;
    if (dashes.current) {
      let n = 0;
      const sides: [number, number, number, number][] = [
        [-ox, oz, ox, oz],
        [ox, oz, ox, -oz],
        [ox, -oz, -ox, -oz],
        [-ox, -oz, -ox, oz],
      ];
      for (const [x0, z0, x1, z1] of sides) {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const count = Math.max(2, Math.round(len / 0.09));
        for (let i = 0; i < count && n < DASHES; i++, n++) {
          const t = (i + 0.5) / count;
          o.position.set(x0 + (x1 - x0) * t, geo.baseline, z0 + (z1 - z0) * t);
          o.scale.set(x1 !== x0 ? 0.05 : 0.012, 0.012, z1 !== z0 ? 0.05 : 0.012);
          o.updateMatrix();
          dashes.current.setMatrixAt(n, o.matrix);
        }
      }
      dashes.current.count = n;
      dashes.current.instanceMatrix.needsUpdate = true;
    }
    if (ticks.current) {
      const marks = [geo.baseline, ...geo.ticks].slice(0, TICKS);
      marks.forEach((y, i) => {
        const long = i === 0;
        o.position.set(W.staff.x, y, W.staff.z);
        o.scale.set(long ? W.staff.tick * 1.6 : W.staff.tick, long ? 0.007 : 0.005, 0.012);
        o.updateMatrix();
        ticks.current?.setMatrixAt(i, o.matrix);
      });
      ticks.current.count = marks.length;
      ticks.current.instanceMatrix.needsUpdate = true;
    }
  }, [geo]);

  useFrame((_, delta) => {
    if (animated) clock.current += dt20(delta);
    // The ring breathes, slowly, while motion is allowed.
    const breathe = animated ? 0.9 + 0.1 * Math.sin(clock.current * 1.1) : 1;
    mats.ring.uniforms.uStrength.value = (p.night ? 0.5 : 0.7) * breathe;
    mats.belt.opacity = (p.night ? 0.9 : 0.75) * breathe;
  });

  return (
    <>
      <ContactBlob width={W.width * 2.6} depth={W.depth * 3.4} strength={1.25} />
      <mesh geometry={shapes.foot} material={mats.porcelain} />
      {/* Clear: the room up to the scale's top holds no money, so it mustn't read as a slab. */}
      <mesh geometry={shapes.glass} material={mats.room} renderOrder={3} />
      <lineSegments geometry={shapes.rim} material={mats.edge} renderOrder={4} />
      <lineSegments geometry={shapes.verticals} material={mats.faint} renderOrder={4} />
      <mesh geometry={shapes.sheen} material={mats.sheen} renderOrder={5} />
      {geo.empty ? (
        <instancedMesh ref={dashes} args={[shapes.bar, mats.dash, DASHES]} />
      ) : (
        <group position={[0, geo.baseline, 0]}>
          <mesh geometry={shapes.plate} material={mats.plate} />
          <mesh geometry={shapes.lipFront} material={mats.lip} />
          <mesh geometry={shapes.lipSide} material={mats.lip} />
        </group>
      )}
      {geo.net !== null && (
        <group position={[0, geo.net, 0]}>
          <mesh geometry={shapes.belt} material={mats.belt} renderOrder={7} />
          <mesh geometry={shapes.ring} material={mats.ring} renderOrder={8} />
        </group>
      )}
      {geo.scale && (
        <>
          <ContactBlob width={0.12} depth={0.12} position={[W.staff.x, 0.002, W.staff.z]} strength={0.9} />
          <mesh geometry={shapes.staff} material={mats.tick} position={[W.staff.x, 0, W.staff.z]} />
          <instancedMesh ref={ticks} args={[shapes.bar, mats.tick, TICKS]} />
        </>
      )}
    </>
  );
}

/** Most dashes around the empty baseline, and most marks on the staff (the scale has at most 6 steps). */
const DASHES = 40;
const TICKS = 12;

// ---------------------------------------------------------------------------

export default function LedgerMonolith({ model, focus = null, onFocus }: LedgerMonolithProps) {
  // 30 fps on every tier: the motion is slow, and the dashboard is a page people stay on.
  const animated = useAnimated(30);
  const palette = useScenePalette();
  const invalidate = useThree((s) => s.invalidate);
  // Keyed on the ledger's content, so a page that rebuilds an equal model each render doesn't rebuild the slabs.
  const key = `${model.net}|${model.analysed}|${model.slabs.map((s) => `${s.id}:${s.value}`).join(',')}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geo = useMemo(() => ledgerGeometry(model), [key]);
  // Without the animation clock (reduced motion), a new focus, ledger or theme still needs a frame.
  useEffect(() => invalidate(), [focus, geo, palette, invalidate]);

  return (
    <>
      <LedgerRig animated={animated} />
      <StudioLights />
      <Plinth radius={W.plinth.radius} height={W.plinth.height} />
      <Column geo={geo} animated={animated} />
      <Slabs geo={geo} focus={focus} onFocus={onFocus} animated={animated} />
      {/* No tier-2 effect pass: scissored to this box inside the vitrine, the stage's pass shifts the
          night field's colour behind the column, which shows as an inner rectangle. The ring is emissive. */}
    </>
  );
}
