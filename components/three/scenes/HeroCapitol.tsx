'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { Vector3, type PerspectiveCamera as PerspectiveCameraImpl } from 'three';
import { damp } from 'maath/easing';
import { sceneStore } from '@/lib/three/sceneStore';
import CapitolDome from '@/components/three/kit/CapitolDome';
import LightParticles from '@/components/three/kit/LightParticles';
import Plinth from '@/components/three/kit/Plinth';
import PostFX from '@/components/three/kit/PostFX';
import { useAnimated, useKitTier } from '@/components/three/kit/hooks';
import { FilmFog, FilmLights, Glint, LightBeam, moteCurves } from '@/components/three/scenes/filmParts';
import { CAMERA_KEYS, CAPITOL_PLINTH, LANTERN, STILL_TIME, aspectFit, type Mut3 } from '@/components/three/scenes/filmShots';

/*
 * The hero's establishing shot: the porcelain Capitol on its paper plinth in
 * morning light, motes of violet light drifting up past the dome, a soft
 * beam from the lantern and a glint at its top (the aperture of the
 * Politicon mark). The camera idles in a slow orbit and leans toward a
 * mouse; under reduced motion it holds the composed frame. The film's first
 * shot opens on the same view, so scrolling into it continues this one.
 */

/** The hero frame: the film's opening key, pulled in for a smaller box. */
const HERO = {
  position: [-3.5, 2.05, 9.2] as Mut3,
  target: [-0.05, 0.95, 0] as Mut3,
  fov: CAMERA_KEYS[0].fov,
  /** The plinth, with a little air either side. */
  span: 5.4,
};
const HERO_DISTANCE = Math.hypot(HERO.position[0] - HERO.target[0], HERO.position[1] - HERO.target[1], HERO.position[2] - HERO.target[2]);

/**
 * Raises the picture in its box by a share of its height, the way a shift
 * lens does (verticals stay straight): on desktops the example receipt
 * covers the lower half of the hero's box, so the dome is lifted clear of it.
 */
function applyLift(cam: PerspectiveCameraImpl, width: number, height: number, lift: number) {
  if (lift > 0) cam.setViewOffset(width, height, 0, lift * height, width, height);
  else if (cam.view?.enabled) cam.clearViewOffset();
}

function HeroCamera({ animated, view, lift, closer }: { animated: boolean; view: { fit: number }; lift: number; closer: number }) {
  const camera = useRef<PerspectiveCameraImpl>(null);
  const state = useMemo(() => ({ x: 0, y: 0, target: new Vector3(...HERO.target) }), []);

  useFrame(({ size, clock }, delta) => {
    const cam = camera.current;
    if (!cam) return;
    const dt = Math.min(delta, 1 / 20);
    const pointer = animated ? sceneStore.get().pointer : { x: 0, y: 0 };
    damp(state, 'x', pointer.x, 0.9, dt);
    damp(state, 'y', pointer.y, 0.9, dt);
    const t = animated ? clock.elapsedTime : STILL_TIME;
    const fit = aspectFit(size.width / Math.max(1, size.height), HERO.span, HERO_DISTANCE, HERO.fov);
    const k = fit.distance * closer;
    view.fit = k;
    const [tx, ty, tz] = HERO.target;
    let dx = (HERO.position[0] - tx) * k;
    let dz = (HERO.position[2] - tz) * k;
    const dy = (HERO.position[1] - ty) * k + state.y * 0.3 + Math.sin(t * 0.17) * 0.06;
    // A slow orbit to and fro, plus the lean toward the mouse.
    const yaw = Math.sin(t * 0.09) * 0.09 + state.x * 0.14;
    const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
    [dx, dz] = [dx * c + dz * s, -dx * s + dz * c];
    cam.position.set(tx + dx, ty + dy, tz + dz);
    cam.lookAt(state.target);
    cam.fov = HERO.fov + fit.fov;
    applyLift(cam, size.width, size.height, lift);
    cam.updateProjectionMatrix();
  });

  return <PerspectiveCamera ref={camera} makeDefault near={0.1} far={80} fov={HERO.fov} position={HERO.position} />;
}

export interface HeroCapitolProps {
  /**
   * Raise the Capitol in its box by this share of the box's height (0 … 0.4),
   * to keep the dome clear of what overlaps the box's lower half (the
   * hero's example receipt on desktops). Default 0.
   */
  lift?: number;
  /**
   * Stand this much closer than the composed frame (0.6 … 1), for a short,
   * wide band where the whole plinth needn't fit (the hero on a phone).
   * Default 1.
   */
  closer?: number;
}

export default function HeroCapitol({ lift = 0, closer = 1 }: HeroCapitolProps) {
  const tier = useKitTier();
  const animated = useAnimated(tier === 2 ? 60 : 30);
  const curves = useMemo(moteCurves, []);
  const clock = useRef({ t: STILL_TIME });

  useFrame((_, delta) => {
    if (animated) clock.current.t += Math.min(delta, 1 / 20);
  });
  const time = useMemo(() => () => clock.current.t, []);
  const view = useMemo(() => ({ fit: 1 }), []);
  const fit = useMemo(() => () => view.fit, [view]);
  const beam = useMemo(() => () => 0.45, []);
  const glint = useMemo(() => () => 0.85, []);

  return (
    <>
      <HeroCamera animated={animated} view={view} lift={Math.min(0.4, Math.max(0, lift))} closer={Math.min(1, Math.max(0.6, closer))} />
      <FilmLights />
      <FilmFog scale={fit} />
      <Plinth radius={CAPITOL_PLINTH.radius} height={CAPITOL_PLINTH.height} />
      <CapitolDome />
      <LightBeam position={[LANTERN[0], LANTERN[1] + 0.1, LANTERN[2]]} strength={beam} />
      <Glint position={[LANTERN[0], LANTERN[1] + 0.02, LANTERN[2]]} size={0.9} strength={glint} time={time} />
      <LightParticles curves={curves} count={tier === 2 ? 1100 : 450} speed={0.025} spread={0.55} size={13} opacity={0.6} />
      <PostFX />
    </>
  );
}
