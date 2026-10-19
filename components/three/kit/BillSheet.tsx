'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  MeshPhysicalMaterial,
  type MeshStandardMaterial,
  Shape,
  Vector2,
  type Group,
  type InstancedMesh,
} from 'three';
import { mixHex } from '@/lib/three/palette';
import GlassMaterial from '@/components/three/kit/GlassMaterial';
import { buildMarkGeometry } from '@/components/three/kit/markGeometry';
import { useAnimated, useScenePalette } from '@/components/three/kit/hooks';

/*
 * A bill as an object: a thin sheet with rounded corners, the shapes of its
 * title and text lines embossed on the face, and an archive-gold seal disc
 * (the official record) stamped with the Aperture Dome. Paper by default;
 * `material="glass"` makes it the sheet of light that travels in the landing
 * film. Letter proportions, 1 unit tall, centred on the origin, facing +z.
 */

export interface BillSheetProps {
  material?: 'paper' | 'glass';
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  /** A slow float and sway (when motion is allowed). */
  float?: boolean;
  /**
   * How much of the embossed title and text lines shows (0 … 1, read every
   * frame), for a sheet whose record is printed on it as DOM type instead
   * (the landing film's shot 2). Default 1.
   */
  text?: () => number;
  /**
   * Stamp the archive-gold seal (the official record). Default true; pass
   * false for a bill that isn't verified against an official record, since
   * gold is only ever an official-record accent.
   */
  seal?: boolean;
}

const WIDTH = 0.773; // 8.5 × 11
const HEIGHT = 1;
const THICKNESS = 0.008;
const RADIUS = 0.035;

/** Title, subtitle and body lines: [x, y, width, height] from the sheet's top-left. */
const LINES: [number, number, number, number][] = [
  [0.07, 0.1, 0.46, 0.034],
  [0.07, 0.16, 0.3, 0.018],
  ...Array.from({ length: 9 }, (_, i): [number, number, number, number] => [0.07, 0.25 + i * 0.05, i % 4 === 3 ? 0.42 : 0.63, 0.011]),
];

function sheetShape() {
  const w = WIDTH / 2;
  const h = HEIGHT / 2;
  const r = RADIUS;
  const s = new Shape();
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}

/** An embossed seal: a raised rim, a recessed field and an inner ridge, turned on a lathe. */
function sealGeometry(radius: number) {
  // Rim to centre: with the turn below, that order puts the front faces on the
  // seal's face (centre outward would face them into the sheet, culled).
  const p = [
    [0, 0.004],
    [radius * 0.62, 0.004],
    [radius * 0.66, 0.007],
    [radius * 0.7, 0.004],
    [radius * 0.86, 0.004],
    [radius * 0.92, 0.009],
    [radius, 0.006],
    [radius * 1.02, 0],
  ]
    .reverse()
    .map(([x, y]) => new Vector2(x, y));
  const g = new LatheGeometry(p, 64);
  // Lathe turns around y; the seal faces +z.
  g.rotateX(Math.PI / 2);
  return g;
}

export default function BillSheet({ material = 'paper', position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, float = true, text, seal = true }: BillSheetProps) {
  const palette = useScenePalette();
  const animated = useAnimated(30);
  const sway = useRef<Group>(null);
  const lines = useRef<InstancedMesh>(null);
  const linesMaterial = useRef<MeshStandardMaterial>(null);
  const glass = material === 'glass';
  const linesOpacity = glass ? 0.45 : palette.night ? 0.32 : 0.26;

  const geo = useMemo(() => {
    const sheet = new ExtrudeGeometry(sheetShape(), {
      depth: THICKNESS,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
      curveSegments: 6,
    });
    sheet.translate(0, 0, -THICKNESS / 2);
    const line = new BoxGeometry(1, 1, 0.0025);
    const seal = sealGeometry(0.1);
    const stamp = buildMarkGeometry({ depth: 3, bevel: 0.3, curveSegments: 12, bevelSegments: 2 });
    stamp.aperture.dispose();
    return { sheet, line, seal, stamp: stamp.shell };
  }, []);

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
    },
    [geo]
  );

  useLayoutEffect(() => {
    const m = new Matrix4();
    const scaleM = new Matrix4();
    LINES.forEach(([x, y, w, h], i) => {
      m.makeTranslation(-WIDTH / 2 + x + w / 2, HEIGHT / 2 - y - h / 2, THICKNESS / 2 + 0.0024);
      scaleM.makeScale(w, h, 1);
      lines.current?.setMatrixAt(i, m.multiply(scaleM));
    });
    if (lines.current) lines.current.instanceMatrix.needsUpdate = true;
  }, []);

  // Porcelain paper: under the flat (untone-mapped) stage a lit matte sheet
  // reads grey, so it glows a little with its own colour to sit at or above
  // the page's paper, and its sheen is warm rather than cool.
  const paper = useMemo(() => new MeshPhysicalMaterial({ roughness: 0.88, metalness: 0, sheen: 0.5 }), []);
  useEffect(() => () => paper.dispose(), [paper]);
  useEffect(() => {
    paper.color.set(palette.night ? palette.paper : palette.porcelain);
    paper.emissive.set(palette.paper);
    paper.emissiveIntensity = palette.night ? 0.12 : 0.32;
    paper.sheenColor.set(mixHex(palette.paper, palette.gold, 0.35));
  }, [paper, palette]);

  useFrame((state) => {
    if (text && linesMaterial.current) {
      const k = Math.min(1, Math.max(0, text()));
      linesMaterial.current.opacity = linesOpacity * k;
      if (lines.current) lines.current.visible = k > 0.002;
    }
    const g = sway.current;
    if (!g) return;
    if (!float || !animated) {
      g.position.y = 0;
      g.rotation.set(0, 0, 0);
      return;
    }
    const t = state.clock.elapsedTime;
    g.position.y = Math.sin(t * 0.6) * 0.025;
    g.rotation.set(Math.sin(t * 0.43) * 0.04, Math.sin(t * 0.31) * 0.12, Math.sin(t * 0.5) * 0.015);
  });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group ref={sway}>
        {glass ? (
          <mesh geometry={geo.sheet}>
            <GlassMaterial thickness={0.12} roughness={0.1} />
          </mesh>
        ) : (
          <mesh geometry={geo.sheet} material={paper} />
        )}
        <instancedMesh ref={lines} args={[geo.line, undefined, LINES.length]}>
          <meshStandardMaterial
            ref={linesMaterial}
            color={glass ? palette.glow : palette.emboss}
            transparent
            opacity={linesOpacity}
            roughness={0.7}
            depthWrite={false}
          />
        </instancedMesh>
        {/* The official record: an archive-gold seal stamped with the mark. */}
        {/* Satin rather than mirror metal, so it reads in a pale room; the mark is a deeper gold. */}
        {seal && (
          <group position={[WIDTH / 2 - 0.16, -HEIGHT / 2 + 0.16, THICKNESS / 2]}>
            <mesh geometry={geo.seal}>
              <meshStandardMaterial color={palette.gold} metalness={0.55} roughness={0.34} />
            </mesh>
            <mesh geometry={geo.stamp} position={[0, 0, 0.007]} scale={[0.11, 0.11, 0.06]}>
              <meshStandardMaterial color={mixHex(palette.gold, '#5C4307', 0.45)} metalness={0.6} roughness={0.42} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}
