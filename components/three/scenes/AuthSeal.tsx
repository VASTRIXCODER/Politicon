'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import {
  AdditiveBlending,
  Color,
  LatheGeometry,
  NormalBlending,
  ShaderMaterial,
  Vector2,
  type Group,
  type PerspectiveCamera as PerspectiveCameraImpl,
  type PointLight,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { damp, dampE } from 'maath/easing';
import { sceneStore } from '@/lib/three/sceneStore';
import { mixHex } from '@/lib/three/palette';
import BillSheet from '@/components/three/kit/BillSheet';
import GlassMaterial from '@/components/three/kit/GlassMaterial';
import LightParticles from '@/components/three/kit/LightParticles';
import PostFX from '@/components/three/kit/PostFX';
import StudioLights from '@/components/three/kit/StudioLights';
import { ContactBlob } from '@/components/three/kit/Plinth';
import { buildMarkGeometry } from '@/components/three/kit/markGeometry';
import { useAnimated, useKitTier, useScenePalette } from '@/components/three/kit/hooks';

/*
 * The sign-in seal: the Aperture Dome as a glass seal pressed into a bill.
 * A paper bill sheet (the kit's, with its archive-gold record seal) leans
 * back in a three-quarter turn; on it sits a round glass medallion with the
 * mark standing in relief and a lens of light at its iris. Every few seconds
 * a band of light sweeps across the sheet, with a travelling light that
 * glints along the glass, motes of light rise slowly behind it (as in the
 * landing film), and the whole piece leans toward a mouse. Under
 * reduced motion it holds one composed frame, the sweep crossing the seal.
 *
 * Built from the kit (BillSheet, GlassMaterial, LightParticles, StudioLights) plus two small
 * shaders; the medallion and the mark are one merged mesh, so tier 2 pays
 * for a single transmission pass. It frames itself for any box from
 * portrait to wide.
 */

/** BillSheet's own proportions (kit/BillSheet.tsx): letter paper, 1 unit tall, the face at z = 0.004. */
const SHEET = { width: 0.773, height: 1, face: 0.004 };
/** The sheet's size in the scene. */
const SCALE = 1.7;
/** The medallion, in sheet units: clear of the title above and the record seal at the lower right. */
const SEAL = { x: -0.04, y: -0.015, radius: 0.215 };
/** Rest pose: leaning back, turned a little to the right, like a document on a lectern. */
const REST: [number, number, number] = [-0.2, 0.36, 0.045];
/** One sweep of light, then a pause (seconds). */
const SWEEP_PERIOD = 9;
const SWEEP_ACTIVE = 0.62;
/** The still frame (reduced motion): the band of light just across the seal. */
const STILL_SWEEP = 0.55;
const FOV = 28;

const SHEEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A soft diagonal band of light across the sheet, feathered at its edges.
const SHEEN_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uPos;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float u = vUv.x * 0.75 + (1.0 - vUv.y) * 0.45;
  float d = (u - uPos) / 0.085;
  float band = exp(-d * d) + 0.35 * exp(-d * d * 0.12);
  float edge = smoothstep(0.0, 0.035, vUv.x) * smoothstep(1.0, 0.965, vUv.x)
    * smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
  gl_FragColor = vec4(uColor, band * edge * uStrength);
  #include <colorspace_fragment>
}
`;

const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  // A ring of light around the lens, clear at its centre so the lens stays white.
  float glow = exp(-d * d * 4.5) * smoothstep(0.2, 0.34, d) * (1.0 - smoothstep(0.8, 1.0, d));
  gl_FragColor = vec4(uColor, glow * uStrength);
  #include <colorspace_fragment>
}
`;

/** Paths for the motes: slow columns rising behind the sheet, leaning a little. */
function moteCurves(): [number, number, number][][] {
  return Array.from({ length: 7 }, (_, i) => {
    const x = (i / 6 - 0.5) * 2.2;
    const z = -0.35 - (i % 3) * 0.22;
    return [
      [x * 0.8, -1.25, z],
      [x * 0.95 + 0.08, -0.3, z - 0.05],
      [x + 0.14, 0.6, z],
      [x * 1.1 + 0.2, 1.35, z + 0.08],
    ];
  });
}

/** 0 → 1 across one sweep, then held past the end until the next one starts. */
function sweepAt(t: number): number {
  const phase = (t % SWEEP_PERIOD) / SWEEP_PERIOD / SWEEP_ACTIVE;
  if (phase >= 1) return 1.4;
  const s = phase * phase * (3 - 2 * phase);
  return -0.25 + s * 1.65;
}

/** The medallion (a lathe-turned disc with a raised rim) and the mark in relief on it, as one solid facing +z. */
function buildSeal() {
  const r = SEAL.radius;
  // From the foot inward and up, so the faces point out of the sheet.
  const profile = [
    [r * 1.03, 0],
    [r, 0.012],
    [r * 0.95, 0.027],
    [r * 0.88, 0.031],
    [r * 0.81, 0.025],
    [r * 0.76, 0.017],
    [0, 0.017],
  ].map(([x, y]) => new Vector2(x, y));
  const disc = new LatheGeometry(profile, 72).toNonIndexed();
  disc.rotateX(Math.PI / 2);

  const mark = buildMarkGeometry({ depth: 3.2, bevel: 0.38, curveSegments: 18, bevelSegments: 3 });
  const width = r * 1.18;
  const depth = (3.2 / 50) * width;
  mark.shell.scale(width, width, width);
  mark.aperture.scale(width, width, width);
  // Standing on the disc's field, sunk a hair into it.
  const z = 0.017 + depth / 2 - 0.002;
  mark.shell.translate(0, 0.006, z);
  mark.aperture.translate(0, 0.006, z);
  const solid = mergeGeometries([disc, mark.shell]) ?? disc.clone();
  disc.dispose();
  mark.shell.dispose();
  return {
    solid,
    lens: mark.aperture,
    lensAt: [mark.apertureCenter[0] * width, mark.apertureCenter[1] * width + 0.006, z + depth * 0.4] as const,
  };
}

function SealCamera({ animated }: { animated: boolean }) {
  const camera = useRef<PerspectiveCameraImpl>(null);
  const lean = useMemo(() => ({ x: 0, y: 0 }), []);

  useFrame(({ size }, delta) => {
    const cam = camera.current;
    if (!cam) return;
    const dt = Math.min(delta, 1 / 20);
    const pointer = animated ? sceneStore.get().pointer : { x: 0, y: 0 };
    damp(lean, 'x', pointer.x, 0.8, dt);
    damp(lean, 'y', pointer.y, 0.8, dt);
    // Fit the sheet (with air around it) to the box: by height when wide, by width when tall.
    const aspect = size.width / Math.max(1, size.height);
    const tan = Math.tan((FOV * Math.PI) / 360);
    const byHeight = (SHEET.height * SCALE * 1.18) / (2 * tan);
    const byWidth = (SHEET.width * SCALE * 1.5) / (2 * tan * aspect);
    const distance = Math.max(byHeight, byWidth);
    cam.position.set(lean.x * 0.18, 0.08 + lean.y * 0.12, distance);
    cam.lookAt(0, 0, 0);
  });

  return <PerspectiveCamera ref={camera} makeDefault near={0.1} far={40} fov={FOV} position={[0, 0.08, 4.4]} />;
}

export default function AuthSeal() {
  const palette = useScenePalette();
  const tier = useKitTier();
  const animated = useAnimated(30);
  const curves = useMemo(moteCurves, []);
  const piece = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const clock = useRef({ t: 0 });

  const seal = useMemo(buildSeal, []);
  useEffect(
    () => () => {
      seal.solid.dispose();
      seal.lens.dispose();
    },
    [seal]
  );

  const sheen = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uPos: { value: STILL_SWEEP }, uStrength: { value: 0.3 } },
        vertexShader: SHEEN_VERTEX,
        fragmentShader: SHEEN_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  const halo = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uStrength: { value: 0.6 } },
        vertexShader: SHEEN_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  useEffect(
    () => () => {
      sheen.dispose();
      halo.dispose();
    },
    [sheen, halo]
  );

  // By night the light adds to the scene; by day it is a pale wash over the paper.
  useEffect(() => {
    const blending = palette.night ? AdditiveBlending : NormalBlending;
    sheen.uniforms.uColor.value.set(palette.night ? palette.glow : mixHex(palette.violetLight, '#FFFFFF', 0.55));
    sheen.uniforms.uStrength.value = palette.night ? 0.16 : 0.42;
    halo.uniforms.uColor.value.set(palette.night ? palette.glow : palette.violet);
    halo.uniforms.uStrength.value = palette.night ? 0.8 : 0.3;
    for (const m of [sheen, halo]) {
      if (m.blending !== blending) {
        m.blending = blending;
        m.needsUpdate = true;
      }
    }
  }, [sheen, halo, palette]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    if (animated) clock.current.t += dt;
    const t = clock.current.t;
    const sweep = animated ? sweepAt(t) : STILL_SWEEP;
    sheen.uniforms.uPos.value = sweep;

    // The travelling light rides just ahead of the band, brightest mid-sweep.
    const s = Math.min(1, Math.max(0, (sweep + 0.25) / 1.65));
    const l = light.current;
    if (l) {
      l.position.set(-0.7 + s * 1.4, 0.5 - s * 0.9, 0.3);
      l.intensity = (palette.night ? 1.4 : 1.2) * (0.3 + Math.sin(Math.PI * s) * 0.9);
    }

    const g = piece.current;
    if (!g) return;
    const pointer = animated ? sceneStore.get().pointer : { x: 0, y: 0 };
    dampE(
      g.rotation,
      [
        REST[0] - pointer.y * 0.14 + (animated ? Math.sin(t * 0.23) * 0.025 : 0),
        REST[1] + pointer.x * 0.26 + (animated ? Math.sin(t * 0.17) * 0.06 : 0),
        REST[2],
      ],
      0.9,
      dt
    );
    g.position.y = animated ? Math.sin(t * 0.5) * 0.018 : 0;
  });

  const faceZ = SHEET.face;

  return (
    <>
      <SealCamera animated={animated} />
      <StudioLights intensity={palette.night ? 0.72 : 0.85} />
      <LightParticles curves={curves} count={tier === 2 ? 520 : 220} speed={0.02} spread={0.3} size={17} opacity={palette.night ? 0.75 : 0.5} />
      <group ref={piece} rotation={REST}>
        <group scale={SCALE}>
          <BillSheet material="paper" float={false} />
          {/* The paper pressed down around the seal: a soft shadow ring on the sheet. */}
          <group position={[SEAL.x, SEAL.y, faceZ + 0.0008]} rotation={[Math.PI / 2, 0, 0]}>
            <ContactBlob width={SEAL.radius * 3.1} depth={SEAL.radius * 3.1} position={[0, 0, 0]} strength={0.9} />
          </group>
          <mesh position={[0, 0, faceZ + 0.0035]} material={sheen} renderOrder={1}>
            <planeGeometry args={[SHEET.width, SHEET.height]} />
          </mesh>
          <group position={[SEAL.x, SEAL.y, faceZ]}>
            {/* After the sheen, so the band of light shows through the glass. */}
            <mesh geometry={seal.solid} renderOrder={2}>
              <GlassMaterial thickness={0.5} roughness={0.07} />
            </mesh>
            <mesh geometry={seal.lens}>
              <meshBasicMaterial color={palette.lens} toneMapped={false} />
            </mesh>
            <mesh position={[seal.lensAt[0], seal.lensAt[1], seal.lensAt[2] + 0.004]} material={halo} renderOrder={4}>
              <planeGeometry args={[0.22, 0.22]} />
            </mesh>
          </group>
          <pointLight ref={light} color={palette.night ? palette.violetLight : '#FFFFFF'} distance={3} decay={2} />
        </group>
      </group>
      <PostFX />
    </>
  );
}
