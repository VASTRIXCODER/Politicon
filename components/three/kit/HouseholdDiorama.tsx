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
  type InstancedMesh,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mixHex } from '@/lib/three/palette';
import { DIORAMA } from '@/components/three/kit/dioramaLayout';
import Plinth, { ContactBlob, occlude } from '@/components/three/kit/Plinth';
import { useScenePalette } from '@/components/three/kit/hooks';

/*
 * A household in miniature, the way an architect's model shows one: a
 * gabled porcelain house with a violet front door and windows that light
 * up, two figures by the path (a grown-up and a child), a car on its pad and
 * a faceted tree, all on a paper plinth. Everything is a primitive; the only
 * colour is the door and the lamplight, so it reads as a crafted object
 * rather than a toy.
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
}

type Driven = number | (() => number);

const read = (v: Driven) => Math.min(1, Math.max(0, typeof v === 'function' ? v() : v));

const { house: H, car: CAR, tree: TREE, figures: FIGURES } = DIORAMA;

/** The walls' bevel: anything set on a wall stands this far proud of the shape. */
const FACE = 0.004 + 0.002;

/** Windows on the house: [x, y, z, rotationY, width, height] in house-local units (centre at ground). */
const WINDOWS: [number, number, number, number, number, number][] = [
  // Front, either side of the door.
  [-0.19, 0.2, H.depth / 2 + FACE, 0, 0.1, 0.11],
  [0.19, 0.2, H.depth / 2 + FACE, 0, 0.1, 0.11],
  // Left side.
  [-H.width / 2 - FACE, 0.2, 0.11, -Math.PI / 2, 0.11, 0.11],
  [-H.width / 2 - FACE, 0.2, -0.11, -Math.PI / 2, 0.11, 0.11],
  // Right side.
  [H.width / 2 + FACE, 0.2, 0, Math.PI / 2, 0.13, 0.11],
];

/** The front gable: a pentagon (walls plus the triangle under the roof), extruded to the house's depth. */
function bodyGeometry() {
  const w = H.width / 2;
  const s = new Shape();
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  s.lineTo(w, H.wall);
  s.lineTo(0, H.wall + H.gable);
  s.lineTo(-w, H.wall);
  s.lineTo(-w, 0);
  const g = new ExtrudeGeometry(s, { depth: H.depth, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
  g.translate(0, 0, -H.depth / 2);
  return occlude(g, 0, H.wall * 0.7, 0.18);
}

/**
 * A roof panel on the left (side -1) or right (+1) slope: it runs from the
 * ridge down past the eave by an overhang, resting on the slope.
 */
function roofPanel(side: -1 | 1) {
  const run = H.width / 2;
  const angle = Math.atan2(H.gable, run);
  const thickness = 0.03;
  const overhang = 0.06;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return {
    // The slope's midpoint, slid toward the eave by half the overhang and lifted by half the thickness.
    position: [side * (run / 2 + (c * overhang) / 2 + (s * thickness) / 2), H.wall + H.gable / 2 - (s * overhang) / 2 + (c * thickness) / 2, 0] as [
      number,
      number,
      number,
    ],
    rotationZ: -side * angle,
    size: [Math.hypot(run, H.gable) + overhang, thickness, H.depth + 0.1] as [number, number, number],
  };
}

export default function HouseholdDiorama({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  glow = 0,
  dusk = 0,
  plinth = true,
}: HouseholdDioramaProps) {
  const palette = useScenePalette();
  const panes = useRef<InstancedMesh>(null);
  const mullions = useRef<InstancedMesh>(null);
  const wheels = useRef<InstancedMesh>(null);
  const stones = useRef<InstancedMesh>(null);
  const roofs = useMemo(() => [roofPanel(-1), roofPanel(1)], []);

  const geo = useMemo(() => {
    const body = bodyGeometry();
    const roof = new BoxGeometry(...roofs[0].size);
    const chimney = occlude(new BoxGeometry(0.06, 0.2, 0.06), -0.1, 0.1, 0.2);
    const door = new RoundedBoxGeometry(0.11, 0.2, 0.014, 2, 0.006);
    const pane = new PlaneGeometry(1, 1);
    const bar = new BoxGeometry(1, 1, 1);
    const oculus = new CircleGeometry(0.042, 32);
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
    return { body, roof, chimney, door, pane, bar, oculus, stone, carBody, carCabin, wheel, lamp, trunk, crown, crownTop, torso, head };
  }, [roofs]);

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
    },
    [geo]
  );

  // Instances: window panes and their mullions, wheels, path stones.
  useLayoutEffect(() => {
    const o = new Object3D();
    const m = new Matrix4();
    WINDOWS.forEach(([x, y, z, ry, w, h], i) => {
      o.position.set(x, y, z);
      o.rotation.set(0, ry, 0);
      o.scale.set(w, h, 1);
      o.updateMatrix();
      panes.current?.setMatrixAt(i, o.matrix);
      // A cross and a sill, just proud of the pane.
      const bars: [number, number, number, number, number][] = [
        [0, 0, w, 0.008, 0.006],
        [0, 0, 0.008, h, 0.006],
        [0, -h / 2 - 0.006, w + 0.03, 0.012, 0.02],
      ];
      bars.forEach(([bx, by, sx, sy, sz], j) => {
        o.position.set(x, y, z);
        o.rotation.set(0, ry, 0);
        o.scale.set(1, 1, 1);
        o.updateMatrix();
        m.makeTranslation(bx, by, sz / 2).multiply(new Matrix4().makeScale(sx, sy, sz));
        mullions.current?.setMatrixAt(i * 3 + j, o.matrix.clone().multiply(m));
      });
    });
    [
      [-0.085, 0.032, 0.062],
      [0.085, 0.032, 0.062],
      [-0.085, 0.032, -0.062],
      [0.085, 0.032, -0.062],
    ].forEach(([x, y, z], i) => {
      m.makeTranslation(x, y, z);
      wheels.current?.setMatrixAt(i, m);
    });
    // Stepping stones from the door toward the plinth's edge.
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
    for (const ref of [panes, mullions, wheels, stones]) if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, []);

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
  }, [mats, palette, tones]);

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
      {plinth && <Plinth radius={DIORAMA.plinth.radius} height={DIORAMA.plinth.height} />}

      {/* Soft contact shadows, drawn before what stands on them. */}
      <ContactBlob width={0.95} depth={0.8} position={[hx, 0.002, hz]} strength={1.3} />
      <ContactBlob width={0.42} depth={0.26} position={[CAR.position[0], 0.002, CAR.position[2]]} rotationY={-CAR.rotationY} strength={1.2} />
      <ContactBlob width={0.38} depth={0.38} position={[TREE[0], 0.002, TREE[2]]} strength={0.9} />
      {FIGURES.map((f, i) => (
        <ContactBlob key={i} width={0.1} depth={0.1} position={[f.position[0], 0.002, f.position[2]]} strength={1.1} />
      ))}

      {/* The house. */}
      <group position={[hx, 0, hz]}>
        <mesh geometry={geo.body} material={mats.porcelain} />
        {roofs.map((r, i) => (
          <mesh key={i} geometry={geo.roof} material={mats.roof} position={r.position} rotation={[0, 0, r.rotationZ]} />
        ))}
        <mesh geometry={geo.chimney} material={mats.porcelain} position={[0.16, H.wall + H.gable * 0.62, -0.12]} />
        <mesh geometry={geo.door} material={mats.door} position={[0, 0.1, H.depth / 2 + FACE]} />
        <instancedMesh ref={panes} args={[geo.pane, mats.pane, WINDOWS.length]} />
        <instancedMesh ref={mullions} args={[geo.bar, mats.plain, WINDOWS.length * 3]} />
        {/* A round window in the gable. */}
        <mesh geometry={geo.oculus} material={mats.pane} position={[0, H.wall + H.gable * 0.38, H.depth / 2 + FACE]} />
      </group>
      <instancedMesh ref={stones} args={[geo.stone, mats.plain, 4]} />

      {/* The car, parked on its pad. */}
      <group position={CAR.position} rotation={[0, CAR.rotationY, 0]}>
        <mesh geometry={geo.carBody} material={mats.porcelain} position={[0, 0.062, 0]} />
        <mesh geometry={geo.carCabin} material={mats.roof} position={[-0.02, 0.118, 0]} />
        <instancedMesh ref={wheels} args={[geo.wheel, mats.wheel, 4]} />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={geo.lamp} material={mats.lamp} position={[0.141, 0.066, s * 0.042]} rotation={[0, Math.PI / 2, 0]} />
        ))}
      </group>

      {/* The tree: a faceted crown on a slim trunk. */}
      <group position={TREE}>
        <mesh geometry={geo.trunk} material={mats.porcelain} position={[0, 0.08, 0]} />
        <mesh geometry={geo.crown} material={mats.crown} position={[0, 0.25, 0]} />
        <mesh geometry={geo.crownTop} material={mats.crown} position={[0.02, 0.38, 0.01]} rotation={[0.4, 0.6, 0]} />
      </group>

      {/* Two figures: a body and a head each, no faces (an architect's people). */}
      {FIGURES.map((f, i) => {
        // The capsule is 3 units tall (a unit long between unit caps); squeezed to the body's height.
        const r = f.height * 0.15;
        const body = f.height * 0.64;
        return (
          <group key={i} position={f.position} rotation={[0, f.rotationY, 0]}>
            <mesh geometry={geo.torso} material={mats.plain} position={[0, body / 2, 0]} scale={[r, body / 3, r * 0.82]} />
            <mesh geometry={geo.head} material={mats.plain} position={[0, f.height - r, 0]} scale={r} />
          </group>
        );
      })}
    </group>
  );
}
