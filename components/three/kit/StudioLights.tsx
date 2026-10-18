'use client';

import { Environment, Lightformer } from '@react-three/drei';
import { useKitTier, useScenePalette } from '@/components/three/kit/hooks';

/*
 * The studio every hero object is shot in: an environment built only from
 * drei Lightformers (no HDR file, no preset, nothing fetched), plus a key
 * light and the violet rim light that outlines every object in Politicon.
 *
 *   Day    a warm overhead softbox in a mid-tone paper room, violet light
 *          from behind-left, a hint of gold from below.
 *   Night  a dark room where the violet rim does most of the work.
 *
 * The environment renders once (and again when the theme changes).
 */

export interface StudioLightsProps {
  /** Scales every light (and the environment) together. */
  intensity?: number;
}

export default function StudioLights({ intensity = 1 }: StudioLightsProps) {
  const p = useScenePalette();
  const tier = useKitTier();
  const L = p.light;

  return (
    <>
      <Environment resolution={tier === 2 ? 256 : 128} frames={1} environmentIntensity={L.env * intensity}>
        <color attach="background" args={[p.env]} />
        {/* Overhead softbox. */}
        <Lightformer form="rect" intensity={2.4} color={p.key} position={[0, 5, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[9, 3, 1]} />
        {/* The violet rim: a ring behind and to the left. */}
        <Lightformer form="ring" intensity={p.night ? 6 : 4} color={p.rim} position={[-5, 1.5, -4]} scale={3.5} target={[0, 0, 0]} />
        {/* A tall violet strip on the right, for a second edge. */}
        <Lightformer form="rect" intensity={p.night ? 3 : 2} color={p.glow} position={[5, 0.5, -2]} scale={[1.2, 5, 1]} target={[0, 0, 0]} />
        {/* Warm light from below the front: the paper's candle. */}
        <Lightformer form="rect" intensity={p.night ? 0.5 : 0.9} color={p.gold} position={[2, -3.5, 4]} scale={[4, 1, 1]} target={[0, 0, 0]} />
        {/* A soft front panel so faces toward the camera never go dead. */}
        <Lightformer form="circle" intensity={p.night ? 0.4 : 1} color={p.key} position={[0, 0.5, 7]} scale={4} target={[0, 0, 0]} />
      </Environment>

      <ambientLight intensity={L.ambient * intensity} color={p.fill} />
      {/* Key, from above the right shoulder. */}
      <directionalLight position={[3, 5, 4]} intensity={L.key * intensity} color={p.key} />
      {/* Rim, from behind the left: the Politicon violet edge. */}
      <directionalLight position={[-4, 2.5, -5]} intensity={L.rim * intensity} color={p.rim} />
      {/* A second, cooler rim on the right in orchid. */}
      <directionalLight position={[4.5, -0.5, -4]} intensity={L.rim * 0.35 * intensity} color={p.accent} />
    </>
  );
}
