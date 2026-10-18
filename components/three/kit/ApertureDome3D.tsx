'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, NormalBlending, ShaderMaterial, Color, type Group } from 'three';
import { dampE } from 'maath/easing';
import { sceneStore } from '@/lib/three/sceneStore';
import GlassMaterial from '@/components/three/kit/GlassMaterial';
import { buildMarkGeometry } from '@/components/three/kit/markGeometry';
import { useAnimated, useScenePalette } from '@/components/three/kit/hooks';

/*
 * The Politicon mark, the Aperture Dome, as a lit glass object: the logo's
 * own paths extruded with a bevel, in violet glass with a violet rim light,
 * and a lens of light at the iris. It turns slowly toward the mouse with
 * inertia and sways a little on its own (touch screens get the sway only).
 * Under reduced motion it holds a composed three-quarter view.
 */

export interface ApertureDome3DProps {
  /** World-space width of the mark (it is built one unit wide). */
  size?: number;
  position?: [number, number, number];
  /** Lean toward the pointer (default true). */
  follow?: boolean;
}

const HALO_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float glow = exp(-d * d * 4.0) * (1.0 - smoothstep(0.85, 1.0, d));
  gl_FragColor = vec4(uColor, glow * uStrength);
  #include <colorspace_fragment>
}
`;

/** Rest pose: a gentle three-quarter turn, slightly from below, like a monument. */
const REST: [number, number, number] = [-0.08, -0.32, 0];

export default function ApertureDome3D({ size = 1.6, position = [0, 0, 0], follow = true }: ApertureDome3DProps) {
  const palette = useScenePalette();
  const animated = useAnimated();
  const group = useRef<Group>(null);

  const mark = useMemo(() => buildMarkGeometry({ depth: 6, bevel: 0.45 }), []);
  useEffect(
    () => () => {
      mark.shell.dispose();
      mark.aperture.dispose();
    },
    [mark]
  );

  // A soft glow behind the lens, so it reads as light even without bloom.
  const halo = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uStrength: { value: 0.6 } },
        vertexShader: HALO_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => halo.dispose(), [halo]);
  useEffect(() => {
    halo.uniforms.uColor.value.set(palette.night ? palette.glow : palette.violet);
    halo.uniforms.uStrength.value = palette.night ? 0.75 : 0.32;
    const blending = palette.night ? AdditiveBlending : NormalBlending;
    if (halo.blending !== blending) {
      halo.blending = blending;
      halo.needsUpdate = true;
    }
  }, [halo, palette]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    if (!animated) {
      g.rotation.set(...REST);
      return;
    }
    const t = state.clock.elapsedTime;
    const { pointer } = sceneStore.get();
    const lean = follow ? 1 : 0;
    dampE(
      g.rotation,
      [REST[0] - pointer.y * 0.22 * lean + Math.sin(t * 0.21) * 0.03, REST[1] + pointer.x * 0.5 * lean + Math.sin(t * 0.17) * 0.1, 0],
      0.85,
      Math.min(delta, 0.1)
    );
  });

  const [lx, ly] = mark.apertureCenter;

  return (
    <group position={position} scale={size}>
      <group ref={group}>
        <mesh geometry={mark.shell}>
          <GlassMaterial thickness={0.6} roughness={0.08} />
        </mesh>
        <mesh geometry={mark.aperture}>
          <meshBasicMaterial color={palette.lens} toneMapped={false} />
        </mesh>
        <mesh position={[lx, ly, -0.05]} material={halo}>
          <planeGeometry args={[0.55, 0.55]} />
        </mesh>
      </group>
    </group>
  );
}
