'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, ExtrudeGeometry, NormalBlending, ShaderMaterial, Shape, type Group } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { HouseholdModel } from '@/lib/household';
import { DIORAMA, DWELLINGS, PROP_SCALE, dwellingWindows, householdLayout, piecePosition, type DwellingSpec, type Vec3 } from '@/components/three/kit/dioramaLayout';
import { ContactBlob, occlude } from '@/components/three/kit/Plinth';
import HouseholdPropPiece from '@/components/three/kit/HouseholdProps';
import { useScenePalette } from '@/components/three/kit/hooks';
import {
  Car,
  DioramaPlinth,
  FACE,
  Figure,
  Gabled,
  Path,
  SampleHousehold,
  Tree,
  Windows,
  useDioramaLight,
  useDioramaMaterials,
  useOwnGeometry,
  useSharedGeometry,
  type Driven,
  type Geo,
  type Mats,
} from '@/components/three/kit/dioramaParts';
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
 *
 * The shared parts (materials, the house, the car, the tree, the figures)
 * and the sample household are dioramaParts.tsx; the landing film draws the
 * sample through SampleDiorama.tsx, so this module (a person's household)
 * never reaches its chunk.
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

const { house: H, tree: TREE } = DIORAMA;

/** An apartment block: four floors of stacked windows, a canopy over the door, a flat roof with a parapet. */
function Block({ spec, mats }: { spec: Extract<DwellingSpec, { kind: 'block' }>; mats: Mats }) {
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
function Hall({ spec, mats }: { spec: Extract<DwellingSpec, { kind: 'hall' }>; mats: Mats }) {
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
          <Figure height={f.height} geo={geo} material={mats.person} />
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
  const materials = useDioramaMaterials();
  const geo = useSharedGeometry();
  useDioramaLight(materials, glow, dusk);
  // Decided once: a diorama is either the film's sample household or a person's.
  const [own] = useState(() => !!household);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {/* A person's household is framed tight on its plinth (onboarding, the avatar): a pool that stays inside the box. */}
      {plinth && <DioramaPlinth tight={own} />}
      {own && household ? (
        <HouseholdPieces household={household} lastAdded={lastAdded} mats={materials.mats} geo={geo} />
      ) : (
        <SampleHousehold mats={materials.mats} geo={geo} />
      )}
    </group>
  );
}
