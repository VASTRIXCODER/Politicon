'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mixHex } from '@/lib/three/palette';
import type { HouseholdModel } from '@/lib/household';
import {
  DIORAMA,
  DWELLINGS,
  PROP_SCALE,
  WALL_FACE,
  dwellingWindows,
  householdLayout,
  piecePosition,
  type DwellingSpec,
  type DwellingWindow,
  type Vec3,
} from '@/components/three/kit/dioramaLayout';
import Plinth, { ContactBlob, occlude } from '@/components/three/kit/Plinth';
import HouseholdPropPiece from '@/components/three/kit/HouseholdProps';
import { useScenePalette } from '@/components/three/kit/hooks';
import { usePrefersReducedMotion } from '@/components/three/runtime';

/*
 * A household in miniature, the way an architect's model shows one: a
 * gabled porcelain house with a violet front door and windows that light
 * up, two figures by the path (a grown-up and a child), a car on its pad and
 * a faceted tree, all on a paper plinth. Everything is a primitive; the only
 * colour is the door and the lamplight, so it reads as a crafted object
 * rather than a toy.
 *
 * Given a `household` (lib/household.ts), it shows that household instead:
 * the building for its housing (an apartment block with stacked windows, the
 * gabled house, a bigger two-storey family home, a campus hall, a cottage),
 * its grown-ups and dependents (children drawn smaller), and one object per
 * kind of debt (components/three/kit/HouseholdProps.tsx), each on its fixed
 * spot from dioramaLayout.ts. A piece that appears after the first frame
 * rises into place, and `lastAdded` sends a soft pulse of light across the
 * ground under it; under reduced motion every piece is simply there.
 *
 * Diorama units (components/three/kit/dioramaLayout.ts): about 2.6 across
 * with the plinth, the house 0.6 tall, standing on y = 0 and facing +z.
 * `glow` drives the lamplight (and the car's lamps) from day (0) to a warm
 * evening (1); pass a function to drive it every frame without re-rendering.
 */

export interface HouseholdDioramaProps {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
  /** Lamplight 0 (day: the panes are glass) … 1 (evening). A function is read every frame. */
  glow?: Driven;
  /** Daylight 0 … dusk 1: by day the porcelain carries a little of its own light, so it reads white under the flat stage. */
  dusk?: Driven;
  /** Stand on the paper plinth (default true). */
  plinth?: boolean;
  /**
   * A person's household (lib/household.ts) in place of the film's sample
   * one. Keep the ledger's spot (DIORAMA.ledger) for a column beside it.
   * Decide once per mount: switching between the two isn't supported.
   */
  household?: HouseholdModel;
  /** The piece just added (an id from householdPieces in dioramaLayout.ts): a pulse of light runs out under it. */
  lastAdded?: string | null;
}

type Driven = number | (() => number);

const read = (v: Driven) => Math.min(1, Math.max(0, typeof v === 'function' ? v() : v));

const { house: H, car: CAR, tree: TREE, figures: FIGURES } = DIORAMA;

/** The walls' bevel: anything set on a wall stands this far proud of the shape. */
const FACE = WALL_FACE;

/** A window: [x, y, z, rotationY, width, height] in building-local units (centre at ground). */
type Win = DwellingWindow;

/** Windows on the house: [x, y, z, rotationY, width, height] in house-local units (centre at ground). */
const WINDOWS: Win[] = dwellingWindows('house');

type GabledSpec = Extract<DwellingSpec, { kind: 'gabled' }>;
type BlockSpec = Extract<DwellingSpec, { kind: 'block' }>;
type HallSpec = Extract<DwellingSpec, { kind: 'hall' }>;

/** The front gable: a pentagon (walls plus the triangle under the roof), extruded to the house's depth. */
function bodyGeometry(s: GabledSpec = DWELLINGS.house) {
  const w = s.width / 2;
  const shape = new Shape();
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, s.wall);
  shape.lineTo(0, s.wall + s.gable);
  shape.lineTo(-w, s.wall);
  shape.lineTo(-w, 0);
  const g = new ExtrudeGeometry(shape, { depth: s.depth, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
  g.translate(0, 0, -s.depth / 2);
  return occlude(g, 0, s.wall * 0.7, 0.18);
}

/**
 * A roof panel on the left (side -1) or right (+1) slope: it runs from the
 * ridge down past the eave by an overhang, resting on the slope.
 */
function roofPanel(side: -1 | 1, s: GabledSpec = DWELLINGS.house) {
  const run = s.width / 2;
  const angle = Math.atan2(s.gable, run);
  const thickness = 0.03;
  const overhang = 0.06;
  const [c, sn] = [Math.cos(angle), Math.sin(angle)];
  return {
    // The slope's midpoint, slid toward the eave by half the overhang and lifted by half the thickness.
    position: [side * (run / 2 + (c * overhang) / 2 + (sn * thickness) / 2), s.wall + s.gable / 2 - (sn * overhang) / 2 + (c * thickness) / 2, 0] as [
      number,
      number,
      number,
    ],
    rotationZ: -side * angle,
    size: [Math.hypot(run, s.gable) + overhang, thickness, s.depth + 0.1] as [number, number, number],
  };
}

// ---------------------------------------------------------------------------
// Materials, shared by every piece (so a piece added later compiles nothing new).

function useDioramaMaterials() {
  const palette = useScenePalette();
  const mats = useMemo(
    () => ({
      porcelain: new MeshStandardMaterial({ roughness: 0.8, metalness: 0, vertexColors: true, emissive: new Color() }),
      plain: new MeshStandardMaterial({ roughness: 0.8, metalness: 0, emissive: new Color() }),
      roof: new MeshStandardMaterial({ roughness: 0.7, metalness: 0, emissive: new Color() }),
      door: new MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }),
      pane: new MeshStandardMaterial({ roughness: 0.15, metalness: 0, emissive: new Color() }),
      wheel: new MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 }),
      crown: new MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true }),
      lamp: new MeshStandardMaterial({ roughness: 0.4, metalness: 0, emissive: new Color() }),
      // The household's heavier objects (book covers, the cap, the case): ink, warmed with violet.
      ink: new MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }),
    }),
    []
  );
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats]
  );

  // Day glass and lamplight; the panes blend from one to the other with `glow`.
  const tones = useMemo(() => {
    const lamplight = mixHex(palette.paper, palette.gold, 0.55);
    return {
      glass: new Color(mixHex(palette.night ? palette.surface : palette.porcelain, palette.violet, palette.night ? 0.35 : 0.22)),
      lamp: new Color(lamplight),
    };
  }, [palette]);

  useEffect(() => {
    const base = palette.night ? palette.paper : palette.porcelain;
    mats.porcelain.color.set(base);
    mats.plain.color.set(base);
    mats.roof.color.set(mixHex(base, palette.violet, palette.night ? 0.2 : 0.1));
    for (const m of [mats.porcelain, mats.plain, mats.roof]) m.emissive.copy(m.color);
    mats.door.color.set(palette.violet);
    mats.wheel.color.set(mixHex(palette.ink, palette.violet, 0.15));
    mats.crown.color.set(mixHex(base, palette.violetLight, 0.12));
    mats.lamp.color.set(base);
    mats.pane.emissive.copy(tones.lamp);
    mats.lamp.emissive.copy(tones.lamp);
    // Ink is the light colour at night; the objects stay dark there too.
    mats.ink.color.set(palette.night ? mixHex(palette.surface, palette.violet, 0.45) : mixHex(palette.ink, palette.violet, 0.22));
  }, [mats, palette, tones]);

  return { mats, tones, palette };
}

type Mats = ReturnType<typeof useDioramaMaterials>['mats'];

/** Geometries shared by the car, the tree, the figures and the path. */
function useSharedGeometry() {
  const geo = useMemo(() => {
    const stone = new CylinderGeometry(1, 1, 1, 20);
    const carBody = occlude(new RoundedBoxGeometry(0.28, 0.07, 0.14, 3, 0.025), -0.035, 0.035, 0.25);
    const carCabin = new RoundedBoxGeometry(0.15, 0.065, 0.12, 3, 0.022);
    const wheel = new CylinderGeometry(0.032, 0.032, 0.026, 20);
    wheel.rotateX(Math.PI / 2);
    const lamp = new CircleGeometry(0.012, 16);
    const trunk = occlude(new CylinderGeometry(0.012, 0.016, 0.16, 8), -0.08, 0.08, 0.3);
    const crown = new IcosahedronGeometry(0.14, 1);
    const crownTop = new IcosahedronGeometry(0.1, 1);
    const torso = new CapsuleGeometry(1, 1, 6, 16);
    const head = new SphereGeometry(1, 20, 14);
    return { stone, carBody, carCabin, wheel, lamp, trunk, crown, crownTop, torso, head };
  }, []);
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
    },
    [geo]
  );
  return geo;
}

type Geo = ReturnType<typeof useSharedGeometry>;

/** Disposes geometries made for one piece when it goes. */
function useOwnGeometry<T extends Record<string, BufferGeometry>>(make: () => T, deps: readonly unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geo = useMemo(make, deps);
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
    },
    [geo]
  );
  return geo;
}

// ---------------------------------------------------------------------------
// Pieces

/**
 * Window panes and their bars (a cross and a sill, or just the sill), as two
 * instanced meshes. Set up on mount, so a building that appears later gets
 * its own.
 */
function Windows({ list, mats, cross = true }: { list: Win[]; mats: Mats; cross?: boolean }) {
  const panes = useRef<InstancedMesh>(null);
  const bars = useRef<InstancedMesh>(null);
  const geo = useOwnGeometry(() => ({ pane: new PlaneGeometry(1, 1), bar: new BoxGeometry(1, 1, 1) }), []);
  const perWindow = cross ? 3 : 1;

  useLayoutEffect(() => {
    const o = new Object3D();
    const m = new Matrix4();
    list.forEach(([x, y, z, ry, w, h], i) => {
      o.position.set(x, y, z);
      o.rotation.set(0, ry, 0);
      o.scale.set(w, h, 1);
      o.updateMatrix();
      panes.current?.setMatrixAt(i, o.matrix);
      // A cross and a sill, just proud of the pane.
      const parts: [number, number, number, number, number][] = [
        [0, 0, w, 0.008, 0.006],
        [0, 0, 0.008, h, 0.006],
        [0, -h / 2 - 0.006, w + 0.03, 0.012, 0.02],
      ];
      (cross ? parts : parts.slice(2)).forEach(([bx, by, sx, sy, sz], j) => {
        o.position.set(x, y, z);
        o.rotation.set(0, ry, 0);
        o.scale.set(1, 1, 1);
        o.updateMatrix();
        m.makeTranslation(bx, by, sz / 2).multiply(new Matrix4().makeScale(sx, sy, sz));
        bars.current?.setMatrixAt(i * perWindow + j, o.matrix.clone().multiply(m));
      });
    });
    for (const ref of [panes, bars]) if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [list, cross, perWindow]);

  return (
    <>
      <instancedMesh ref={panes} args={[geo.pane, mats.pane, list.length]} />
      <instancedMesh ref={bars} args={[geo.bar, mats.plain, list.length * perWindow]} />
    </>
  );
}

/** A gabled building: the film's house, or a cottage or two-storey family home at another size. */
function Gabled({ spec, windows, mats }: { spec: GabledSpec; windows: Win[]; mats: Mats }) {
  const roofs = useMemo(() => [roofPanel(-1, spec), roofPanel(1, spec)], [spec]);
  const geo = useOwnGeometry(
    () => ({
      body: bodyGeometry(spec),
      roof: new BoxGeometry(...roofs[0].size),
      chimney: occlude(new BoxGeometry(0.06, 0.2, 0.06), -0.1, 0.1, 0.2),
      door: new RoundedBoxGeometry(0.11, 0.2, 0.014, 2, 0.006),
      oculus: new CircleGeometry(0.042, 32),
    }),
    [spec, roofs]
  );
  return (
    <>
      <mesh geometry={geo.body} material={mats.porcelain} />
      {roofs.map((r, i) => (
        <mesh key={i} geometry={geo.roof} material={mats.roof} position={r.position} rotation={[0, 0, r.rotationZ]} />
      ))}
      <mesh geometry={geo.chimney} material={mats.porcelain} position={[spec.width * (0.16 / 0.62), spec.wall + spec.gable * 0.62, -spec.depth * (0.12 / 0.5)]} />
      <mesh geometry={geo.door} material={mats.door} position={[0, 0.1, spec.depth / 2 + FACE]} />
      <Windows list={windows} mats={mats} />
      {/* A round window in the gable. */}
      <mesh geometry={geo.oculus} material={mats.pane} position={[0, spec.wall + spec.gable * 0.38, spec.depth / 2 + FACE]} />
    </>
  );
}

/** An apartment block: four floors of stacked windows, a canopy over the door, a flat roof with a parapet. */
function Block({ spec, mats }: { spec: BlockSpec; mats: Mats }) {
  const { width: w, depth: d, height: h } = spec;
  const windows = useMemo(() => dwellingWindows('apartment'), []);
  const geo = useOwnGeometry(
    () => ({
      body: occlude(new RoundedBoxGeometry(w, h, d, 2, 0.01), -h / 2, -h / 2 + 0.3, 0.2),
      slab: new BoxGeometry(w + 0.03, 0.03, d + 0.03),
      plant: new BoxGeometry(0.14, 0.07, 0.12),
      door: new RoundedBoxGeometry(0.1, 0.17, 0.014, 2, 0.006),
      canopy: new BoxGeometry(0.16, 0.012, 0.06),
    }),
    [w, d, h]
  );
  return (
    <>
      <mesh geometry={geo.body} material={mats.porcelain} position={[0, h / 2, 0]} />
      <mesh geometry={geo.slab} material={mats.roof} position={[0, h + 0.015, 0]} />
      <mesh geometry={geo.plant} material={mats.plain} position={[w * 0.18, h + 0.065, -d * 0.15]} />
      <mesh geometry={geo.door} material={mats.door} position={[0, 0.085, d / 2 + FACE]} />
      <mesh geometry={geo.canopy} material={mats.roof} position={[0, 0.19, d / 2 + 0.03]} />
      <Windows list={windows} mats={mats} cross={false} />
    </>
  );
}

/** A campus hall: long and low, tall windows, a columned porch under a pediment, a lantern on the roof. */
function Hall({ spec, mats }: { spec: HallSpec; mats: Mats }) {
  const { width: w, depth: d, height: h } = spec;
  const windows = useMemo(() => dwellingWindows('campus'), []);
  const geo = useOwnGeometry(() => {
    const tri = new Shape();
    tri.moveTo(-0.2, 0);
    tri.lineTo(0.2, 0);
    tri.lineTo(0, 0.09);
    tri.lineTo(-0.2, 0);
    const pediment = new ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false });
    pediment.translate(0, 0, -0.06);
    return {
      body: occlude(new RoundedBoxGeometry(w, h, d, 2, 0.008), -h / 2, -h / 2 + 0.25, 0.2),
      cornice: new BoxGeometry(w + 0.03, 0.025, d + 0.03),
      step: new BoxGeometry(0.42, 0.03, 0.15),
      column: new CylinderGeometry(0.013, 0.016, h - 0.06, 12),
      beam: new BoxGeometry(0.4, 0.03, 0.12),
      pediment,
      door: new RoundedBoxGeometry(0.1, 0.18, 0.014, 2, 0.006),
      drum: new CylinderGeometry(0.04, 0.045, 0.07, 12),
      cap: new ConeGeometry(0.056, 0.08, 12),
    };
  }, [w, d, h]);
  const porch = d / 2 + 0.06;
  return (
    <>
      <mesh geometry={geo.body} material={mats.porcelain} position={[0, h / 2, 0]} />
      <mesh geometry={geo.cornice} material={mats.roof} position={[0, h + 0.0125, 0]} />
      <mesh geometry={geo.step} material={mats.plain} position={[0, 0.015, porch]} />
      {[-0.15, -0.06, 0.06, 0.15].map((x) => (
        <mesh key={x} geometry={geo.column} material={mats.plain} position={[x, 0.03 + (h - 0.06) / 2, porch + 0.03]} />
      ))}
      <mesh geometry={geo.beam} material={mats.roof} position={[0, h - 0.015, porch]} />
      <mesh geometry={geo.pediment} material={mats.roof} position={[0, h, porch]} />
      <mesh geometry={geo.door} material={mats.door} position={[0, 0.12, d / 2 + FACE]} />
      <mesh geometry={geo.drum} material={mats.plain} position={[0, h + 0.06, -0.02]} />
      <mesh geometry={geo.cap} material={mats.roof} position={[0, h + 0.135, -0.02]} />
      <Windows list={windows} mats={mats} cross={false} />
    </>
  );
}

/** Stepping stones from the door toward the plinth's edge. */
function Path({ geo, mats }: { geo: Geo; mats: Mats }) {
  const stones = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D();
    [
      [0.0, 0.3, 0.05],
      [0.03, 0.44, 0.045],
      [0.08, 0.58, 0.05],
      [0.14, 0.72, 0.042],
    ].forEach(([x, z, r], i) => {
      o.position.set(H.center[0] + x, 0.003, H.center[2] + z);
      o.rotation.set(0, 0, 0);
      o.scale.set(r, 0.006, r * 0.8);
      o.updateMatrix();
      stones.current?.setMatrixAt(i, o.matrix);
    });
    if (stones.current) stones.current.instanceMatrix.needsUpdate = true;
  }, []);
  return <instancedMesh ref={stones} args={[geo.stone, mats.plain, 4]} />;
}

/** The car, parked: porcelain body, a violet-tinted cabin, ink wheels and two lamps. */
function Car({ geo, mats }: { geo: Geo; mats: Mats }) {
  const wheels = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new Matrix4();
    [
      [-0.085, 0.032, 0.062],
      [0.085, 0.032, 0.062],
      [-0.085, 0.032, -0.062],
      [0.085, 0.032, -0.062],
    ].forEach(([x, y, z], i) => {
      m.makeTranslation(x, y, z);
      wheels.current?.setMatrixAt(i, m);
    });
    if (wheels.current) wheels.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <>
      <mesh geometry={geo.carBody} material={mats.porcelain} position={[0, 0.062, 0]} />
      <mesh geometry={geo.carCabin} material={mats.roof} position={[-0.02, 0.118, 0]} />
      <instancedMesh ref={wheels} args={[geo.wheel, mats.wheel, 4]} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.lamp} material={mats.lamp} position={[0.141, 0.066, s * 0.042]} rotation={[0, Math.PI / 2, 0]} />
      ))}
    </>
  );
}

/** The tree: a faceted crown on a slim trunk. */
function Tree({ geo, mats }: { geo: Geo; mats: Mats }) {
  return (
    <>
      <mesh geometry={geo.trunk} material={mats.porcelain} position={[0, 0.08, 0]} />
      <mesh geometry={geo.crown} material={mats.crown} position={[0, 0.25, 0]} />
      <mesh geometry={geo.crownTop} material={mats.crown} position={[0.02, 0.38, 0.01]} rotation={[0.4, 0.6, 0]} />
    </>
  );
}

/** A figure: a body and a head, no face (an architect's people). */
function Figure({ height, geo, mats }: { height: number; geo: Geo; mats: Mats }) {
  // The capsule is 3 units tall (a unit long between unit caps); squeezed to the body's height.
  const r = height * 0.15;
  const body = height * 0.64;
  return (
    <>
      <mesh geometry={geo.torso} material={mats.plain} position={[0, body / 2, 0]} scale={[r, body / 3, r * 0.82]} />
      <mesh geometry={geo.head} material={mats.plain} position={[0, height - r, 0]} scale={r} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The household's own pieces: rising in, and the pulse of light.

/** How long a new piece takes to rise into place. */
const RISE_SECONDS = 0.75;

/** Whether pieces that mount now should rise in (only after the diorama's first frame, and with motion allowed). */
const RiseContext = createContext<{ ready: { current: boolean }; still: boolean }>({ ready: { current: false }, still: true });

/** Ease out with a touch of overshoot, so a piece settles rather than stops. */
function settle(t: number) {
  const c1 = 1.1;
  const u = t - 1;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
}

/** Scale and sink for a piece `k` (0..1) of the way into place. */
function applyRise(g: Group | null, k: number) {
  if (!g) return;
  g.scale.setScalar(Math.max(0.001, settle(k)));
  g.position.y = -0.06 * (1 - k) * (1 - k);
}

/** A piece on its spot, rising out of the plinth when it arrives after the first frame. */
function Rise({ position, rotationY = 0, children }: { position: Vec3; rotationY?: number; children: ReactNode }) {
  const { ready, still } = useContext(RiseContext);
  const invalidate = useThree((s) => s.invalidate);
  const inner = useRef<Group>(null);
  const t = useRef(ready.current && !still ? 0 : 1);

  useLayoutEffect(() => applyRise(inner.current, t.current), []);
  // Motion paused mid-rise: straight to the end.
  useEffect(() => {
    if (!still || t.current >= 1) return;
    t.current = 1;
    applyRise(inner.current, 1);
    invalidate();
  }, [still, invalidate]);

  useFrame((state, delta) => {
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + Math.min(delta, 1 / 30) / RISE_SECONDS);
    applyRise(inner.current, t.current);
    state.invalidate();
  });

  return (
    <group position={[position[0], position[1], position[2]]} rotation={[0, rotationY, 0]}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

const PULSE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A ring of light running outward over a soft core, gone at the edge.
const PULSE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRing;
varying vec2 vUv;
void main() {
  float d = length((vUv - 0.5) * 2.0);
  float q = (d - uRing) / 0.14;
  float ring = exp(-q * q);
  float core = exp(-d * d * 5.0) * (1.0 - uRing);
  float a = (ring * 0.75 + core * 0.6) * uOpacity * (1.0 - smoothstep(0.85, 1.0, d));
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

const PULSE_SECONDS = 1.3;

/** A soft pulse of violet light across the ground under the newest piece. Always mounted (so it is compiled up front), and invisible at rest. */
function Pulse({ at, size, token, still }: { at: Vec3 | null; size: number; token: string | null; still: boolean }) {
  const palette = useScenePalette();
  const t = useRef(1);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uOpacity: { value: 0 }, uRing: { value: 0 } },
        vertexShader: PULSE_VERTEX,
        fragmentShader: PULSE_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.uniforms.uColor.value.set(palette.night ? palette.violetLight : palette.glow);
    const blending = palette.night ? AdditiveBlending : NormalBlending;
    if (material.blending !== blending) {
      material.blending = blending;
      material.needsUpdate = true;
    }
  }, [material, palette]);

  const invalidate = useThree((s) => s.invalidate);
  // A new token starts a pulse (the one there at mount was added before this view existed).
  const seen = useRef(token);
  useEffect(() => {
    if (token === seen.current) return;
    seen.current = token;
    if (!token || still) return;
    t.current = 0;
    invalidate();
  }, [token, still, invalidate]);

  useFrame((state, delta) => {
    if (t.current >= 1) {
      material.uniforms.uOpacity.value = 0;
      return;
    }
    t.current = still ? 1 : Math.min(1, t.current + Math.min(delta, 1 / 30) / PULSE_SECONDS);
    const k = t.current;
    material.uniforms.uRing.value = 0.15 + 0.75 * (1 - (1 - k) * (1 - k));
    material.uniforms.uOpacity.value = Math.min(1, k * 8) * (1 - k) * (palette.night ? 0.9 : 0.75);
    state.invalidate();
  });

  return (
    <group position={at ? [at[0], 0.004, at[2]] : [0, -DIORAMA.plinth.height / 2, 0]} scale={size}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}

/**
 * One tiny mesh per material (and per instanced use), hidden inside the
 * plinth's drum: the view compiles every program before its first frame, so
 * a building or a figure that arrives later never stalls a frame compiling.
 */
function WarmMaterials({ mats }: { mats: Mats }) {
  const geo = useOwnGeometry(() => ({ box: new BoxGeometry(0.01, 0.01, 0.01) }), []);
  const list = Object.values(mats);
  return (
    <group position={[0, -DIORAMA.plinth.height / 2, 0]}>
      {list.map((m, i) => (
        <mesh key={i} geometry={geo.box} material={m} />
      ))}
      {[mats.pane, mats.plain, mats.wheel].map((m, i) => (
        <instancedMesh key={`i${i}`} args={[geo.box, m, 1]} />
      ))}
    </group>
  );
}

/** The building on the house's spot. */
function Dwelling({ kind, mats }: { kind: NonNullable<HouseholdModel['dwelling']>; mats: Mats }) {
  const spec: DwellingSpec = DWELLINGS[kind];
  const windows = useMemo(() => dwellingWindows(kind), [kind]);
  if (spec.kind === 'block') return <Block spec={spec} mats={mats} />;
  if (spec.kind === 'hall') return <Hall spec={spec} mats={mats} />;
  return <Gabled spec={spec} windows={windows} mats={mats} />;
}

/** Contact shadow under each building, sized to its footprint. */
const DWELLING_SHADOW: Record<NonNullable<HouseholdModel['dwelling']>, [number, number]> = {
  house: [0.95, 0.8],
  cottage: [0.75, 0.66],
  'family-home': [1.08, 0.84],
  apartment: [0.82, 0.74],
  campus: [1.25, 0.72],
};

function HouseholdPieces({ household, lastAdded, mats, geo }: { household: HouseholdModel; lastAdded: string | null; mats: Mats; geo: Geo }) {
  const still = usePrefersReducedMotion();
  const layout = useMemo(() => householdLayout(household), [household]);
  // Pieces that are there at the first frame don't rise; only those added afterwards.
  const ready = useRef(false);
  useEffect(() => {
    ready.current = true;
  }, []);
  const rise = useMemo(() => ({ ready, still }), [still]);
  const [hx, , hz] = H.center;
  const { dwelling } = layout;
  const gabled = dwelling ? DWELLINGS[dwelling].kind === 'gabled' : false;
  const propMats = useMemo(() => ({ porcelain: mats.plain, violet: mats.door, ink: mats.ink }), [mats]);

  // The pulse follows the newest piece; the building gets a wider one.
  const pulse = lastAdded ? piecePosition(layout, lastAdded) : null;
  const pulseSize = lastAdded?.startsWith('dwelling:') ? 1.5 : lastAdded === 'state' ? 0.7 : 0.55;

  return (
    <RiseContext.Provider value={rise}>
      <WarmMaterials mats={mats} />
      <Pulse at={pulse} size={pulseSize} token={lastAdded} still={still} />

      {dwelling && (
        // Keyed by kind: a new building rises in place of the old one.
        <Rise key={dwelling} position={[hx, 0, hz]}>
          <ContactBlob width={DWELLING_SHADOW[dwelling][0]} depth={DWELLING_SHADOW[dwelling][1]} position={[0, 0.002, 0]} strength={1.3} />
          <Dwelling kind={dwelling} mats={mats} />
        </Rise>
      )}
      {gabled && (
        <Rise key={`path:${dwelling}`} position={[0, 0, 0]}>
          <Path geo={geo} mats={mats} />
        </Rise>
      )}
      {dwelling && (
        <Rise key="tree" position={TREE}>
          <ContactBlob width={0.38} depth={0.38} position={[0, 0.002, 0]} strength={0.9} />
          <Tree geo={geo} mats={mats} />
        </Rise>
      )}

      {layout.figures.map((f) => (
        <Rise key={f.id} position={f.position} rotationY={f.rotationY}>
          <ContactBlob width={f.adult ? 0.1 : 0.08} depth={f.adult ? 0.1 : 0.08} position={[0, 0.002, 0]} strength={1.1} />
          <Figure height={f.height} geo={geo} mats={mats} />
        </Rise>
      ))}

      {layout.props.map((p) =>
        p.kind === 'car' ? (
          <Rise key={p.id} position={p.position} rotationY={p.rotationY}>
            <ContactBlob width={0.42} depth={0.26} position={[0, 0.002, 0]} strength={1.2} />
            <Car geo={geo} mats={mats} />
          </Rise>
        ) : (
          <Rise key={p.id} position={p.position} rotationY={p.rotationY}>
            <group scale={PROP_SCALE}>
              <HouseholdPropPiece kind={p.kind} materials={propMats} />
            </group>
          </Rise>
        )
      )}
    </RiseContext.Provider>
  );
}

export default function HouseholdDiorama({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  glow = 0,
  dusk = 0,
  plinth = true,
  household,
  lastAdded = null,
}: HouseholdDioramaProps) {
  const { mats, tones, palette } = useDioramaMaterials();
  const geo = useSharedGeometry();
  // Decided once: a diorama is either the film's sample household or a person's.
  const [own] = useState(() => !!household);

  useFrame(() => {
    const g = read(glow);
    const lift = palette.night ? 0.04 : 0.2 * (1 - read(dusk));
    for (const m of [mats.porcelain, mats.plain, mats.roof]) m.emissiveIntensity = lift;
    mats.pane.color.lerpColors(tones.glass, tones.lamp, Math.min(1, g * 1.4));
    mats.pane.emissiveIntensity = 0.05 + g * g * 2.4;
    mats.lamp.emissiveIntensity = g * g * 2.2;
  });

  const [hx, , hz] = H.center;

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {/* A person's household is framed tight on its plinth (onboarding, the avatar): a pool that stays inside the box. */}
      {plinth && <Plinth radius={DIORAMA.plinth.radius} height={DIORAMA.plinth.height} shadowSpread={own ? 2.4 : undefined} />}

      {own && household ? (
        <HouseholdPieces household={household} lastAdded={lastAdded} mats={mats} geo={geo} />
      ) : (
        <>
          {/* Soft contact shadows, drawn before what stands on them. */}
          <ContactBlob width={0.95} depth={0.8} position={[hx, 0.002, hz]} strength={1.3} />
          <ContactBlob width={0.42} depth={0.26} position={[CAR.position[0], 0.002, CAR.position[2]]} rotationY={-CAR.rotationY} strength={1.2} />
          <ContactBlob width={0.38} depth={0.38} position={[TREE[0], 0.002, TREE[2]]} strength={0.9} />
          {FIGURES.map((f, i) => (
            <ContactBlob key={i} width={0.1} depth={0.1} position={[f.position[0], 0.002, f.position[2]]} strength={1.1} />
          ))}

          {/* The house. */}
          <group position={[hx, 0, hz]}>
            <Gabled spec={DWELLINGS.house} windows={WINDOWS} mats={mats} />
          </group>
          <Path geo={geo} mats={mats} />

          {/* The car, parked on its pad. */}
          <group position={CAR.position} rotation={[0, CAR.rotationY, 0]}>
            <Car geo={geo} mats={mats} />
          </group>

          {/* The tree: a faceted crown on a slim trunk. */}
          <group position={TREE}>
            <Tree geo={geo} mats={mats} />
          </group>

          {/* Two figures: a body and a head each, no faces (an architect's people). */}
          {FIGURES.map((f, i) => (
            <group key={i} position={f.position} rotation={[0, f.rotationY, 0]}>
              <Figure height={f.height} geo={geo} mats={mats} />
            </group>
          ))}
        </>
      )}
    </group>
  );
}
