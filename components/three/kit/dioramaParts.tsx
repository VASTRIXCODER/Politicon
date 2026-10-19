'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  type BufferGeometry,
  type Material,
  type InstancedMesh,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mixHex } from '@/lib/three/palette';
import { DIORAMA, DWELLINGS, WALL_FACE, dwellingWindows, type DwellingSpec, type DwellingWindow } from '@/components/three/kit/dioramaLayout';
import Plinth, { ContactBlob, occlude } from '@/components/three/kit/Plinth';
import { useScenePalette } from '@/components/three/kit/hooks';

/*
 * The household diorama's shared parts: its materials and geometry, the
 * gabled house, the path, the car, the tree and the figures, and the film's
 * sample household made from them (SampleHousehold). The landing film draws
 * only that (components/three/kit/SampleDiorama.tsx); a person's own
 * household, with its other buildings, its debts, pieces rising in and the
 * pulse of light, is HouseholdDiorama.tsx, so the film never ships it.
 */

export type Driven = number | (() => number);

export const read = (v: Driven) => Math.min(1, Math.max(0, typeof v === 'function' ? v() : v));

const { house: H, car: CAR, tree: TREE, figures: FIGURES } = DIORAMA;

/** The walls' bevel: anything set on a wall stands this far proud of the shape. */
export const FACE = WALL_FACE;

/** A window: [x, y, z, rotationY, width, height] in building-local units (centre at ground). */
export type Win = DwellingWindow;

/** Windows on the house: [x, y, z, rotationY, width, height] in house-local units (centre at ground). */
export const WINDOWS: Win[] = dwellingWindows('house');

export type GabledSpec = Extract<DwellingSpec, { kind: 'gabled' }>;

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

export function useDioramaMaterials() {
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
      // A person's own household: its people in a soft violet slate, so they read on the porcelain plinth.
      person: new MeshStandardMaterial({ roughness: 0.75, metalness: 0 }),
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
    // The debts' heavier objects (book covers, the cap, the case): a violet slate, a step darker than the
    // people and lighter than ink, so they read on the plinth without outweighing the home. (Ink is the
    // light colour at night, so that palette mixes from the surface instead.)
    mats.ink.color.set(palette.night ? mixHex(palette.surface, palette.violet, 0.6) : mixHex(mixHex(palette.ink, palette.violet, 0.35), base, 0.25));
    mats.person.color.set(palette.night ? mixHex(palette.paper, palette.violet, 0.5) : mixHex(mixHex(palette.ink, palette.violet, 0.4), base, 0.3));
  }, [mats, palette, tones]);

  return { mats, tones, palette };
}

export type Mats = ReturnType<typeof useDioramaMaterials>['mats'];

/** Geometries shared by the car, the tree, the figures and the path. */
export function useSharedGeometry() {
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

export type Geo = ReturnType<typeof useSharedGeometry>;

/** Disposes geometries made for one piece when it goes. */
export function useOwnGeometry<T extends Record<string, BufferGeometry>>(make: () => T, deps: readonly unknown[]): T {
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
export function Windows({ list, mats, cross = true }: { list: Win[]; mats: Mats; cross?: boolean }) {
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
export function Gabled({ spec, windows, mats }: { spec: GabledSpec; windows: Win[]; mats: Mats }) {
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

/** Stepping stones from the door toward the plinth's edge. */
export function Path({ geo, mats }: { geo: Geo; mats: Mats }) {
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
export function Car({ geo, mats }: { geo: Geo; mats: Mats }) {
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
export function Tree({ geo, mats }: { geo: Geo; mats: Mats }) {
  return (
    <>
      <mesh geometry={geo.trunk} material={mats.porcelain} position={[0, 0.08, 0]} />
      <mesh geometry={geo.crown} material={mats.crown} position={[0, 0.25, 0]} />
      <mesh geometry={geo.crownTop} material={mats.crown} position={[0.02, 0.38, 0.01]} rotation={[0.4, 0.6, 0]} />
    </>
  );
}

/** A figure: a body and a head, no face (an architect's people). */
export function Figure({ height, geo, material }: { height: number; geo: Geo; material: Material }) {
  // The capsule is 3 units tall (a unit long between unit caps); squeezed to the body's height.
  const r = height * 0.15;
  const body = height * 0.64;
  return (
    <>
      <mesh geometry={geo.torso} material={material} position={[0, body / 2, 0]} scale={[r, body / 3, r * 0.82]} />
      <mesh geometry={geo.head} material={material} position={[0, height - r, 0]} scale={r} />
    </>
  );
}

/**
 * Lamplight and daylight, every frame: `glow` lights the panes (and the
 * car's lamps), `dusk` takes the porcelain's own light down toward evening.
 */
export function useDioramaLight({ mats, tones, palette }: ReturnType<typeof useDioramaMaterials>, glow: Driven, dusk: Driven) {
  useFrame(() => {
    const g = read(glow);
    const lift = palette.night ? 0.04 : 0.2 * (1 - read(dusk));
    for (const m of [mats.porcelain, mats.plain, mats.roof]) m.emissiveIntensity = lift;
    mats.pane.color.lerpColors(tones.glass, tones.lamp, Math.min(1, g * 1.4));
    mats.pane.emissiveIntensity = 0.05 + g * g * 2.4;
    mats.lamp.emissiveIntensity = g * g * 2.2;
  });
}

/** The paper plinth under a diorama. `tight` keeps its pool of shadow inside a small box (onboarding, the avatar). */
export function DioramaPlinth({ tight = false }: { tight?: boolean }) {
  return <Plinth radius={DIORAMA.plinth.radius} height={DIORAMA.plinth.height} shadowSpread={tight ? 2.15 : undefined} />;
}

/** The film's sample household: the gabled house and its path, the car, the tree, a grown-up and a child. */
export function SampleHousehold({ mats, geo }: { mats: Mats; geo: Geo }) {
  const [hx, , hz] = H.center;
  return (
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
          <Figure height={f.height} geo={geo} material={mats.plain} />
        </group>
      ))}
    </>
  );
}
