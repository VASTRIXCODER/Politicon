'use client';

import { useEffect, useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry, type Material } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { HouseholdProp } from '@/lib/household';
import { ContactBlob } from '@/components/three/kit/Plinth';

/*
 * A household's debts as small objects on its plinth (placed by
 * components/three/kit/dioramaLayout.ts, PROP_SPOTS): a house key at the
 * doorstep for a mortgage, a mortarboard on two books for student loans, a
 * card for credit card debt, a first-aid sign for medical debt, a closed
 * ledger with a ribbon for a personal loan and a briefcase for a business
 * loan. (An auto loan is the diorama's own car.) Only porcelain, ink and the
 * front door's violet: no red cross, no gold, nothing that reads as a party
 * colour or a price. The objects say what kinds of debt there are, never
 * how much.
 *
 * Each stands on y = 0 facing +z, 0.1 to 0.18 across, with its own soft
 * contact shadow.
 */

export interface PropMaterials {
  porcelain: Material;
  violet: Material;
  ink: Material;
}

type Tone = keyof PropMaterials;
type Part = [geometry: () => BufferGeometry, tone: Tone, position: [number, number, number], rotation?: [number, number, number]];

interface PropDef {
  parts: Part[];
  /** Footprint of the contact shadow, [width, depth]. */
  shadow: [number, number];
  /** Leans the whole object (the card is propped up). */
  lean?: [number, number, number];
  scale?: number;
}

const box = (w: number, h: number, d: number) => () => new BoxGeometry(w, h, d);
const rounded = (w: number, h: number, d: number, r: number) => () => new RoundedBoxGeometry(w, h, d, 2, r);
const cyl = (top: number, bottom: number, h: number, segments = 16) => () => new CylinderGeometry(top, bottom, h, segments);
const ball = (r: number) => () => new SphereGeometry(r, 12, 8);

const PROPS: Record<Exclude<HouseholdProp, 'car'>, PropDef> = {
  // A house key lying by the door: bow, shaft and bit.
  'mortgage-key': {
    scale: 1.25,
    shadow: [0.2, 0.09],
    parts: [
      [() => new TorusGeometry(0.028, 0.009, 8, 24), 'violet', [-0.05, 0.009, 0], [Math.PI / 2, 0, 0]],
      [box(0.09, 0.012, 0.014), 'violet', [0.02, 0.008, 0]],
      [box(0.014, 0.012, 0.026), 'violet', [0.056, 0.008, 0.016]],
      [box(0.01, 0.012, 0.018), 'violet', [0.036, 0.008, 0.012]],
    ],
  },
  // A mortarboard and its tassel, on two books.
  'grad-cap': {
    shadow: [0.2, 0.15],
    parts: [
      [rounded(0.15, 0.028, 0.1, 0.005), 'ink', [0, 0.014, 0]],
      [rounded(0.13, 0.026, 0.09, 0.005), 'violet', [0.006, 0.041, 0.002], [0, 0.18, 0]],
      [cyl(0.042, 0.046, 0.034, 20), 'ink', [0, 0.071, 0]],
      [box(0.12, 0.007, 0.12), 'ink', [0, 0.091, 0], [0, Math.PI / 4, 0]],
      [ball(0.007), 'violet', [0, 0.096, 0]],
      [cyl(0.0025, 0.0025, 0.05, 6), 'violet', [0.08, 0.07, 0]],
      [ball(0.008), 'violet', [0.08, 0.044, 0]],
    ],
  },
  // A card propped on its long edge: chip and an embossed number line.
  card: {
    shadow: [0.2, 0.1],
    lean: [-0.22, 0, 0],
    parts: [
      [rounded(0.15, 0.095, 0.01, 0.008), 'violet', [0, 0.0475, 0]],
      [box(0.026, 0.02, 0.003), 'porcelain', [-0.042, 0.055, 0.006]],
      [box(0.1, 0.006, 0.002), 'porcelain', [0.008, 0.026, 0.0058]],
    ],
  },
  // A first-aid sign: a porcelain tile with a violet plus, on a small foot.
  medical: {
    shadow: [0.14, 0.08],
    parts: [
      [box(0.07, 0.012, 0.04), 'ink', [0, 0.006, 0]],
      [rounded(0.11, 0.11, 0.022, 0.012), 'porcelain', [0, 0.067, 0]],
      [box(0.06, 0.018, 0.006), 'violet', [0, 0.067, 0.013]],
      [box(0.018, 0.06, 0.006), 'violet', [0, 0.067, 0.013]],
    ],
  },
  // A closed ledger lying flat: boards, spine, the page block and a ribbon.
  ledger: {
    shadow: [0.2, 0.15],
    parts: [
      [box(0.15, 0.005, 0.105), 'ink', [0, 0.0025, 0]],
      [box(0.142, 0.02, 0.097), 'porcelain', [0.003, 0.015, 0]],
      [box(0.15, 0.005, 0.105), 'ink', [0, 0.0275, 0]],
      [box(0.006, 0.03, 0.105), 'ink', [-0.075, 0.015, 0]],
      [box(0.05, 0.002, 0.032), 'violet', [0.005, 0.031, 0]],
      [box(0.01, 0.003, 0.034), 'violet', [0.03, 0.005, 0.066]],
    ],
  },
  // A briefcase: the case, a seam, two clasps and its handle.
  briefcase: {
    shadow: [0.2, 0.09],
    parts: [
      [() => new RoundedBoxGeometry(0.15, 0.1, 0.05, 3, 0.014), 'ink', [0, 0.05, 0]],
      [box(0.152, 0.006, 0.052), 'porcelain', [0, 0.072, 0]],
      [box(0.016, 0.012, 0.006), 'violet', [-0.04, 0.085, 0.026]],
      [box(0.016, 0.012, 0.006), 'violet', [0.04, 0.085, 0.026]],
      [() => new TorusGeometry(0.024, 0.0055, 8, 16, Math.PI), 'violet', [0, 0.1, 0]],
    ],
  },
};

export interface HouseholdPropPieceProps {
  kind: Exclude<HouseholdProp, 'car'>;
  materials: PropMaterials;
}

/** One debt's object, standing at the origin (its parent places and turns it). */
export default function HouseholdPropPiece({ kind, materials }: HouseholdPropPieceProps) {
  const def = PROPS[kind];
  const geometries = useMemo(() => def.parts.map(([make]) => make()), [def]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  return (
    <>
      <ContactBlob width={def.shadow[0]} depth={def.shadow[1]} position={[0, 0.002, 0]} strength={1.1} />
      <group rotation={def.lean} scale={def.scale ?? 1}>
        {def.parts.map(([, tone, position, rotation], i) => (
          <mesh key={i} geometry={geometries[i]} material={materials[tone]} position={position} rotation={rotation} />
        ))}
      </group>
    </>
  );
}
