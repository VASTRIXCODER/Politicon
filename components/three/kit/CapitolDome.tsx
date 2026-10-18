'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  LatheGeometry,
  Matrix4,
  MeshStandardMaterial,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
} from 'three';
import { useAnimated, useScenePalette } from '@/components/three/kit/hooks';

/*
 * A procedural Capitol: stepped plinth, a low central block, a colonnaded
 * drum (an instanced ring of columns), the attic, a ribbed lathe dome and a
 * lantern. No model file: every piece is a primitive or a lathe of a profile
 * curve, finished in porcelain with a baked-in occlusion gradient (darker
 * where pieces meet) and a soft contact shadow, so it reads as a crafted
 * object in day light. By night the lantern glows.
 *
 * About 3.4 units wide and 2.2 tall, standing on y = 0. Used by the landing
 * film (R1).
 */

export interface CapitolDomeProps {
  position?: [number, number, number];
  scale?: number;
  /** A slow turntable rotation (when motion is allowed). */
  spin?: boolean;
}

const COLUMNS = 24;
const RIBS = 16;
const DOME_BASE = 1.28;
const DOME_RADIUS = 0.53;
const DOME_HEIGHT = 0.62;

/** Darkens a geometry toward its base (y0 → y1), a cheap stand-in for ambient occlusion. */
function occlude<T extends BufferGeometry>(g: T, y0: number, y1: number, dark = 0.28): T {
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    const f = 1 - dark * (1 - t * t * (3 - 2 * t));
    colors.set([f, f, f], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

function domeProfile(steps: number, inset = 0): Vector2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * (Math.PI / 2);
    // A slightly fuller shoulder than a hemisphere, like the real dome.
    const x = (DOME_RADIUS + inset) * Math.pow(Math.cos(a), 0.82);
    const y = DOME_BASE + (DOME_HEIGHT + inset) * Math.sin(a);
    return new Vector2(Math.max(0, x), y);
  });
}

const SHADOW_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SHADOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float a = exp(-dot(d, d) * 2.6) * uOpacity;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

export default function CapitolDome({ position = [0, 0, 0], scale = 1, spin = false }: CapitolDomeProps) {
  const palette = useScenePalette();
  const animated = useAnimated(30);
  const group = useRef<Group>(null);
  const columns = useRef<InstancedMesh>(null);
  const ribs = useRef<InstancedMesh>(null);

  const geo = useMemo(() => {
    const box = (w: number, h: number, d: number, y: number) => {
      const g = new BoxGeometry(w, h, d);
      g.translate(0, y, 0);
      return occlude(g, y - h / 2, y + h / 2, 0.12);
    };
    const cylinder = (r: number, h: number, y: number, dark = 0.18, segments = 64) => {
      const g = new CylinderGeometry(r, r, h, segments, 1);
      g.translate(0, y + h / 2, 0);
      return occlude(g, y, y + h, dark);
    };
    const steps = [box(3.4, 0.1, 1.7, 0.05), box(3.1, 0.1, 1.5, 0.15), box(2.8, 0.12, 1.3, 0.26)];
    const body = box(2.4, 0.34, 1.15, 0.49);
    const cornice = box(2.5, 0.04, 1.22, 0.68);
    const stylobate = cylinder(0.66, 0.05, 0.7, 0.1);
    const drum = cylinder(0.56, 0.36, 0.75, 0.4);
    const entablature = cylinder(0.665, 0.05, 1.11, 0.1);
    const attic = cylinder(0.55, 0.12, 1.16, 0.3);
    const dome = occlude(new LatheGeometry(domeProfile(40), 96), DOME_BASE, DOME_BASE + DOME_HEIGHT * 0.6, 0.32);
    const column = occlude(new CylinderGeometry(0.016, 0.019, 0.36, 12, 1), -0.18, 0.18, 0.35);
    // A rib follows the dome's surface from the attic to just below the lantern.
    const ribPath = new CatmullRomCurve3(
      domeProfile(16, 0.004)
        .slice(0, 15)
        .map((p) => new Vector3(p.x, p.y, 0))
    );
    const rib = new TubeGeometry(ribPath, 32, 0.007, 6, false);
    const lanternBase = cylinder(0.075, 0.1, DOME_BASE + DOME_HEIGHT - 0.03, 0.25, 24);
    const lanternCap = new SphereGeometry(0.07, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    lanternCap.translate(0, DOME_BASE + DOME_HEIGHT + 0.07, 0);
    const statue = new CylinderGeometry(0.004, 0.02, 0.1, 10, 1);
    statue.translate(0, DOME_BASE + DOME_HEIGHT + 0.19, 0);
    return { steps, body, cornice, stylobate, drum, entablature, attic, dome, column, rib, lanternBase, lanternCap, statue };
  }, []);

  useEffect(
    () => () => {
      Object.values(geo)
        .flat()
        .forEach((g) => g.dispose());
    },
    [geo]
  );

  // Place the column and rib instances around the drum and dome.
  useLayoutEffect(() => {
    const m = new Matrix4();
    const r = new Matrix4();
    for (let i = 0; i < COLUMNS; i++) {
      const a = (i / COLUMNS) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * 0.62, 0.75 + 0.18, Math.sin(a) * 0.62);
      columns.current?.setMatrixAt(i, m);
    }
    for (let i = 0; i < RIBS; i++) {
      r.makeRotationY((i / RIBS) * Math.PI * 2);
      ribs.current?.setMatrixAt(i, r);
    }
    if (columns.current) columns.current.instanceMatrix.needsUpdate = true;
    if (ribs.current) ribs.current.instanceMatrix.needsUpdate = true;
  }, []);

  const shadow = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uOpacity: { value: 0.2 } },
        vertexShader: SHADOW_VERTEX,
        fragmentShader: SHADOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => shadow.dispose(), [shadow]);
  useEffect(() => {
    shadow.uniforms.uColor.value.set(palette.shadow);
    shadow.uniforms.uOpacity.value = palette.light.shadow * 1.6;
  }, [shadow, palette]);

  // One porcelain for the whole building (the occlusion lives in vertex colours).
  const porcelain = useMemo(() => new MeshStandardMaterial({ roughness: 0.78, metalness: 0, vertexColors: true }), []);
  useEffect(() => () => porcelain.dispose(), [porcelain]);
  useEffect(() => {
    porcelain.color.set(palette.porcelain);
  }, [porcelain, palette]);

  useFrame((_, delta) => {
    if (spin && animated && group.current) group.current.rotation.y += Math.min(delta, 0.1) * 0.08;
  });

  return (
    <group position={position} scale={scale}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} material={shadow}>
        <planeGeometry args={[5.2, 2.8]} />
      </mesh>
      <group ref={group}>
        {[...geo.steps, geo.body, geo.cornice, geo.stylobate, geo.drum, geo.entablature, geo.attic, geo.dome, geo.lanternBase, geo.statue].map(
          (g, i) => (
            <mesh key={i} geometry={g} material={porcelain} />
          )
        )}
        <instancedMesh ref={columns} args={[geo.column, porcelain, COLUMNS]} />
        <instancedMesh ref={ribs} args={[geo.rib, undefined, RIBS]}>
          <meshStandardMaterial color={palette.porcelain} roughness={0.6} metalness={0} />
        </instancedMesh>
        {/* The lantern: lit from within at night. */}
        <mesh geometry={geo.lanternCap}>
          <meshStandardMaterial
            color={palette.porcelain}
            roughness={0.5}
            emissive={palette.glow}
            emissiveIntensity={palette.night ? 1.6 : 0}
          />
        </mesh>
      </group>
    </group>
  );
}
