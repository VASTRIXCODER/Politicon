'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { Vector3, type Group, type PerspectiveCamera as PerspectiveCameraImpl } from 'three';
import type { HouseholdModel } from '@/lib/household';
import { HOUSEHOLD_CAMERA, PLAQUE, householdShot } from '@/components/three/kit/dioramaLayout';
import HouseholdDiorama from '@/components/three/kit/HouseholdDiorama';
import StudioLights from '@/components/three/kit/StudioLights';
import { useAnimationFrames, usePrefersReducedMotion, useViewState } from '@/components/three/runtime';

/*
 * A person's household on its paper plinth (the kit's HouseholdDiorama with
 * their HouseholdModel), in two framings:
 *
 *   build   the onboarding diorama. It holds still while the person
 *           answers: each new piece rises into place with a soft pulse of
 *           light under it, and nothing else moves. With `reveal` (the
 *           profile is complete) the camera pulls back and swings a little
 *           toward the front while lamplight comes up in the windows.
 *   avatar  the same household small, turning slowly on its plinth.
 *
 * Under reduced motion (or "Pause motion") it is a composed still: every
 * piece in place, the reveal already done, the avatar at rest. The camera
 * frames the plinth for any box (dioramaLayout.ts: householdShot, which the
 * CSS posters use too, so the two line up). In the build view it also keeps
 * `--plaque-x` / `--plaque-y` on the nearest [data-household-stage] element:
 * where the state's DOM plaque sits on the plinth's edge, as a share of the box.
 *
 * No tier-2 effect pass (<PostFX />): the stage's pass, scissored to a box
 * that sits inside a pane rather than full-bleed, shifts the field's colour
 * behind the diorama, so the box shows as a darker rectangle in the dark
 * theme. The lamplight reads without bloom.
 */

export interface HouseholdSceneProps {
  model: HouseholdModel;
  mode: 'build' | 'avatar';
  /** The newest piece (dioramaLayout.ts newestPiece), lit by a pulse of light. */
  lastAdded?: string | null;
  /** Build view: the profile is complete, so the camera pulls back and the windows light up. */
  reveal?: boolean;
  /** Build view: jump the reveal straight to its end (the person skipped it). */
  skip?: boolean;
}

const REVEAL_SECONDS = 2.6;
/** The avatar's turn, radians per second (a full turn in about 40 s). */
const TURN_SPEED = 0.16;
/** Lamplight in the avatar's windows: a lived-in evening glow, not the reveal's full light. */
const AVATAR_GLOW = 0.3;

/** Smootherstep: the reveal eases in and out. */
const ease = (k: number) => k * k * k * (k * (k * 6 - 15) + 10);

function HouseholdCamera({ mode, reveal }: { mode: 'build' | 'avatar'; reveal: { current: number } }) {
  const camera = useRef<PerspectiveCameraImpl>(null);
  const { element } = useViewState();
  const host = useMemo(() => (mode === 'build' ? element?.closest<HTMLElement>('[data-household-stage]') ?? null : null), [element, mode]);
  const plaque = useMemo(() => new Vector3(), []);
  const last = useRef({ x: -1, y: -1 });

  // Gone with the scene: the plaque falls back to the poster's spot.
  useEffect(
    () => () => {
      host?.style.removeProperty('--plaque-x');
      host?.style.removeProperty('--plaque-y');
    },
    [host]
  );

  useFrame(({ size }) => {
    const cam = camera.current;
    if (!cam) return;
    const aspect = size.width / Math.max(1, size.height);
    const shot = householdShot(mode, aspect, ease(reveal.current));
    cam.position.set(...shot.position);
    cam.lookAt(shot.target[0], shot.target[1], shot.target[2]);
    cam.fov = shot.fov;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    if (!host) return;
    cam.updateMatrixWorld();
    plaque.set(...PLAQUE).project(cam);
    const x = ((plaque.x + 1) / 2) * 100;
    const y = ((1 - plaque.y) / 2) * 100;
    if (Math.abs(x - last.current.x) > 0.05 || Math.abs(y - last.current.y) > 0.05) {
      last.current = { x, y };
      host.style.setProperty('--plaque-x', `${x.toFixed(2)}%`);
      host.style.setProperty('--plaque-y', `${y.toFixed(2)}%`);
    }
  });

  return <PerspectiveCamera ref={camera} makeDefault near={0.1} far={40} fov={HOUSEHOLD_CAMERA.fov} />;
}

export default function HouseholdScene({ model, mode, lastAdded = null, reveal = false, skip = false }: HouseholdSceneProps) {
  const still = usePrefersReducedMotion();
  const { visible } = useViewState();
  const invalidate = useThree((s) => s.invalidate);
  const build = mode === 'build';
  const wanted = build && reveal;

  // The reveal's progress, 0..1. Already done if the view arrives after it began.
  const progress = useRef(wanted ? 1 : 0);
  useEffect(() => invalidate(), [wanted, skip, still, invalidate]);

  // The avatar turns while it is on screen and motion is allowed.
  const turning = !build && visible && !still;
  useAnimationFrames(turning, 24);
  const turn = useRef<Group>(null);

  useFrame((state, delta) => {
    // The avatar's clock runs at 24 fps; a longer gap (a hidden tab, a stall) is not a jump.
    const dt = Math.min(delta, 1 / 20);
    if (turning && turn.current) turn.current.rotation.y += dt * TURN_SPEED;
    const target = wanted ? 1 : 0;
    if (progress.current === target) return;
    if (still || skip) progress.current = target;
    // Back from the last question, the light goes down twice as fast as it came up.
    else if (target > progress.current) progress.current = Math.min(1, progress.current + dt / REVEAL_SECONDS);
    else progress.current = Math.max(0, progress.current - (2 * dt) / REVEAL_SECONDS);
    state.invalidate();
  });

  const glow = useMemo(() => (build ? () => ease(progress.current) : () => AVATAR_GLOW), [build]);
  const dusk = useMemo(() => (build ? () => 0.55 * ease(progress.current) : () => 0), [build]);

  return (
    <>
      <HouseholdCamera mode={mode} reveal={progress} />
      <StudioLights />
      <group ref={turn}>
        <HouseholdDiorama household={model} lastAdded={build ? lastAdded : null} glow={glow} dusk={dusk} />
      </group>
    </>
  );
}
