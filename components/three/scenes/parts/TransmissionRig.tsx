'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import type { PerspectiveCamera as PerspectiveCameraImpl } from 'three';
import { damp } from 'maath/easing';
import { sceneStore } from '@/lib/three/sceneStore';
import { frameOf, unprojectView, type SceneAngle, type ViewBox } from '@/lib/transmission';
import { useViewState } from '@/components/three/runtime';

/*
 * The camera every Transmission scene is shot with: the scene's composed
 * angle (lib/transmission *_VIEW), standing just far enough back that its
 * whole subject (the scene's view box) fits whatever box it renders into,
 * from a phone's portrait strip to a wide desktop band. Its poster draws the
 * same frame flat (lib/transmission frameOf), so the cross-fade lines up.
 *
 * While motion is allowed it drifts slowly to and fro and leans a little
 * after a mouse, with some inertia; under reduced (or paused) motion it
 * holds the composed frame exactly.
 */

export interface TransmissionRigProps {
  view: SceneAngle;
  box: ViewBox;
  animated: boolean;
  /** How far the idle drift turns, in radians of yaw. */
  drift?: number;
  /** How far a mouse at the viewport's edge turns the view, in radians of yaw. */
  lean?: number;
}

const ZERO = { x: 0, y: 0 };

export default function TransmissionRig({ view, box, animated, drift = 0.05, lean = 0.1 }: TransmissionRigProps) {
  const camera = useRef<PerspectiveCameraImpl>(null);
  const { element } = useViewState();
  const state = useMemo(() => ({ x: 0, y: 0, t: 0 }), []);
  const frame = useMemo(() => {
    const f = frameOf(box, view);
    return { ...f, target: unprojectView([f.cx, f.cy, 0], view) };
  }, [box, view]);

  useFrame((_, delta) => {
    const cam = camera.current;
    if (!cam) return;
    const dt = Math.min(delta, 1 / 20);
    if (animated) {
      const pointer = sceneStore.get().pointer ?? ZERO;
      damp(state, 'x', pointer.x, 0.6, dt);
      damp(state, 'y', pointer.y, 0.6, dt);
      state.t += dt;
    } else {
      state.x = 0;
      state.y = 0;
      state.t = 0;
    }
    const w = Math.max(1, element?.clientWidth ?? 1);
    const h = Math.max(1, element?.clientHeight ?? 1);
    const aspect = w / h;
    const tan = Math.tan(((view.fov * Math.PI) / 180) / 2);
    const distance = Math.max(frame.halfH / tan, frame.halfW / (tan * aspect)) + box.near;
    const yaw = view.yaw + Math.sin(state.t * 0.11) * drift + state.x * lean;
    const pitch = view.pitch - state.y * 0.035 + Math.sin(state.t * 0.07) * drift * 0.15;
    const [tx, ty, tz] = frame.target;
    cam.position.set(tx + Math.sin(yaw) * Math.cos(pitch) * distance, ty + Math.sin(pitch) * distance, tz + Math.cos(yaw) * Math.cos(pitch) * distance);
    cam.aspect = aspect;
    cam.near = Math.max(0.05, distance * 0.05);
    cam.far = distance * 4 + 10;
    cam.updateProjectionMatrix();
    cam.lookAt(tx, ty, tz);
  });

  return <PerspectiveCamera ref={camera} makeDefault fov={view.fov} near={0.1} far={60} position={[0, 1, 6]} />;
}
