'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  NormalBlending,
  ShaderMaterial,
  type Group,
  type PerspectiveCamera as PerspectiveCameraImpl,
} from 'three';
import { damp } from 'maath/easing';
import { sceneStore } from '@/lib/three/sceneStore';
import { mixHex } from '@/lib/three/palette';
import BillSheet from '@/components/three/kit/BillSheet';
import LightParticles from '@/components/three/kit/LightParticles';
import PostFX from '@/components/three/kit/PostFX';
import StudioLights from '@/components/three/kit/StudioLights';
import { ContactBlob } from '@/components/three/kit/Plinth';
import { useAnimated, useKitTier, useScenePalette } from '@/components/three/kit/hooks';

/*
 * The 404 page's bill, lost in committee: a single sheet of paper turning
 * slowly in a shaft of soft light, as if caught in an updraft, with motes
 * of light rising past it and a faint shadow far below. The camera leans
 * toward a mouse; under reduced motion the sheet holds one composed pose
 * mid-air. The kit's BillSheet, StudioLights and LightParticles, plus one
 * small shader for the shaft.
 */

const FOV = 30;
/** The sheet's size in the scene (BillSheet is 1 unit tall). */
const SCALE = 1.3;
/** The space the sheet moves through, kept in frame with some air: [width, height]. */
const FRAME: [number, number] = [2.2, 2.75];
/** Where the shadow falls. */
const GROUND = -1.25;
/** The composed still (reduced motion): a three-quarter turn, tipped toward the light. */
const STILL_TIME = 2.4;

const SHAFT_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

// Brightest down the middle of the shaft and near its top, gone at its silhouette and its foot.
const SHAFT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float body = pow(facing, 2.2);
  float fall = smoothstep(0.0, 0.55, vUv.y) * (0.55 + 0.45 * vUv.y);
  float top = 1.0 - smoothstep(0.92, 1.0, vUv.y);
  gl_FragColor = vec4(uColor, body * fall * top * uStrength);
  #include <colorspace_fragment>
}
`;

/** Paths for the motes: loose columns rising through the shaft, swaying a little. */
function moteCurves(): [number, number, number][][] {
  return Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2;
    const r = 0.18 + (i % 3) * 0.17;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.6;
    return [
      [x * 1.2, GROUND + 0.1, z],
      [x + 0.08 * Math.sin(a * 2), -0.4, z + 0.05],
      [x * 0.85 - 0.06 * Math.cos(a), 0.5, z - 0.04],
      [x * 0.6, 1.5, z * 0.8],
    ];
  });
}

/** The sheet's pose at time t: slow, out-of-step turns on every axis, and a drift. */
function pose(t: number) {
  return {
    x: Math.sin(t * 0.13) * 0.16,
    y: 0.06 + Math.sin(t * 0.41) * 0.08,
    rx: -0.3 + Math.sin(t * 0.31) * 0.42,
    ry: Math.sin(t * 0.19 + 0.6) * 0.95,
    rz: Math.sin(t * 0.23 + 1.3) * 0.26,
  };
}

function LostCamera({ animated }: { animated: boolean }) {
  const camera = useRef<PerspectiveCameraImpl>(null);
  const lean = useMemo(() => ({ x: 0, y: 0 }), []);

  useFrame(({ size }, delta) => {
    const cam = camera.current;
    if (!cam) return;
    const dt = Math.min(delta, 1 / 20);
    const pointer = animated ? sceneStore.get().pointer : { x: 0, y: 0 };
    damp(lean, 'x', pointer.x, 1, dt);
    damp(lean, 'y', pointer.y, 1, dt);
    const aspect = size.width / Math.max(1, size.height);
    const tan = Math.tan((FOV * Math.PI) / 360);
    const distance = Math.max(FRAME[1] / (2 * tan), FRAME[0] / (2 * tan * aspect));
    cam.position.set(lean.x * 0.4, 0.12 + lean.y * 0.25, distance);
    cam.lookAt(0, -0.05, 0);
  });

  return <PerspectiveCamera ref={camera} makeDefault near={0.1} far={40} fov={FOV} position={[0, 0.12, 5]} />;
}

export default function LostBill() {
  const palette = useScenePalette();
  const tier = useKitTier();
  const animated = useAnimated(30);
  const sheet = useRef<Group>(null);
  const shadow = useRef<Group>(null);
  const clock = useRef({ t: STILL_TIME });
  const curves = useMemo(moteCurves, []);

  const shaft = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uStrength: { value: 0.2 } },
        vertexShader: SHAFT_VERTEX,
        fragmentShader: SHAFT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    []
  );
  useEffect(() => () => shaft.dispose(), [shaft]);
  // Light adds up in the night room; by day the shaft is a pale lilac haze on the paper.
  useEffect(() => {
    shaft.uniforms.uColor.value.set(palette.night ? palette.violetLight : mixHex(palette.violetLight, palette.violet, 0.25));
    shaft.uniforms.uStrength.value = palette.night ? 0.16 : 0.14;
    const blending = palette.night ? AdditiveBlending : NormalBlending;
    if (shaft.blending !== blending) {
      shaft.blending = blending;
      shaft.needsUpdate = true;
    }
  }, [shaft, palette]);

  useFrame((_, delta) => {
    if (animated) clock.current.t += Math.min(delta, 1 / 20);
    const p = pose(clock.current.t);
    const g = sheet.current;
    if (g) {
      g.position.set(p.x, p.y, 0);
      g.rotation.set(p.rx, p.ry, p.rz);
    }
    // The shadow follows the sheet across the floor and tightens as it sinks.
    const s = shadow.current;
    if (s) {
      s.position.x = p.x * 1.1;
      const near = 1 - (p.y + 0.1) * 0.6;
      s.scale.set(0.8 + Math.abs(Math.cos(p.ry)) * 0.35, 1, near);
    }
  });

  return (
    <>
      <LostCamera animated={animated} />
      <StudioLights intensity={palette.night ? 1 : 0.95} />
      {/* The shaft of light, falling from a little left of overhead. */}
      <mesh position={[-0.12, 0.35, -0.3]} rotation={[0, 0, -0.08]} material={shaft} renderOrder={-2}>
        <cylinderGeometry args={[0.16, 1.15, 3.8, 48, 1, true]} />
      </mesh>
      <group ref={shadow}>
        <ContactBlob width={1.5} depth={0.7} position={[0, GROUND, 0]} strength={palette.night ? 0.8 : 0.7} />
      </group>
      <LightParticles
        curves={curves}
        count={tier === 2 ? 900 : 360}
        speed={0.018}
        spread={0.22}
        size={11}
        opacity={palette.night ? 0.7 : 0.5}
      />
      <group ref={sheet}>
        <BillSheet material="paper" float={false} scale={SCALE} />
      </group>
      <PostFX />
    </>
  );
}
