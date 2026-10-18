'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import ApertureDome3D from '@/components/three/kit/ApertureDome3D';
import GlassMaterial from '@/components/three/kit/GlassMaterial';
import { KitTierOverride, useAnimated, useScenePalette } from '@/components/three/kit/hooks';

/*
 * QA-only scenes for /lab: they exist to judge the kit's materials and
 * lights, not to ship on a page.
 */

/** A glass knot in front of coloured bars, so refraction (tier 2) and the rim fake (tier 1) are easy to compare. */
export function GlassSpecimen() {
  const p = useScenePalette();
  const animated = useAnimated(30);
  const knot = useRef<Group>(null);
  useFrame((_, delta) => {
    if (animated && knot.current) knot.current.rotation.y += Math.min(delta, 0.1) * 0.25;
  });
  const bars = [p.ink, p.violet, p.gold, p.gain, p.loss, p.accent];
  return (
    <>
      {bars.map((color, i) => (
        <mesh key={i} position={[(i - (bars.length - 1) / 2) * 0.32, 0, -0.9]}>
          <boxGeometry args={[0.16, 1.9, 0.05]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      ))}
      <group ref={knot} rotation={[0.35, 0, 0]}>
        <mesh>
          <torusKnotGeometry args={[0.46, 0.16, 220, 32]} />
          <GlassMaterial thickness={0.5} />
        </mesh>
      </group>
    </>
  );
}

/** Matte porcelain, satin violet and gold metal on a paper plinth: the studio lighting at a glance. */
export function LightingSpecimen() {
  const p = useScenePalette();
  return (
    <group position={[0, -0.25, 0]}>
      <mesh position={[0, -0.32, 0]}>
        <boxGeometry args={[2.3, 0.12, 0.9]} />
        <meshStandardMaterial color={p.paper} roughness={0.9} />
      </mesh>
      <mesh position={[-0.72, 0, 0]}>
        <sphereGeometry args={[0.26, 64, 32]} />
        <meshStandardMaterial color={p.porcelain} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.26, 64, 32]} />
        <meshPhysicalMaterial color={p.violet} roughness={0.3} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
      <mesh position={[0.72, 0, 0]}>
        <sphereGeometry args={[0.26, 64, 32]} />
        <meshStandardMaterial color={p.gold} metalness={0.9} roughness={0.28} />
      </mesh>
    </group>
  );
}

/**
 * The mark in tier-1 glass (left) and tier-2 glass (right), whatever this
 * device's tier: the two must read as one material.
 */
export function GlassTierSpecimen() {
  return (
    <>
      <KitTierOverride.Provider value={1}>
        <ApertureDome3D size={0.95} position={[-0.58, 0, 0]} follow={false} />
      </KitTierOverride.Provider>
      <KitTierOverride.Provider value={2}>
        <ApertureDome3D size={0.95} position={[0.58, 0, 0]} follow={false} />
      </KitTierOverride.Provider>
    </>
  );
}
