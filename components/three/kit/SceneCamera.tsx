'use client';

import { useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import type { PerspectiveCamera as PerspectiveCameraImpl } from 'three';

/** A view's own camera (drei PerspectiveCamera, made the view's default). Put one in every SceneView. */
export interface SceneCameraProps {
  position?: [number, number, number];
  /** Where it looks. */
  target?: [number, number, number];
  /** Vertical field of view, in degrees. Long lenses (25-35) flatter objects. */
  fov?: number;
}

export default function SceneCamera({ position = [0, 0, 5], target = [0, 0, 0], fov = 30 }: SceneCameraProps) {
  const ref = useRef<PerspectiveCameraImpl>(null);
  const invalidate = useThree((s) => s.invalidate);
  const [px, py, pz] = position;
  const [tx, ty, tz] = target;

  useLayoutEffect(() => {
    ref.current?.lookAt(tx, ty, tz);
    invalidate();
  }, [px, py, pz, tx, ty, tz, invalidate]);

  return <PerspectiveCamera ref={ref} makeDefault position={[px, py, pz]} fov={fov} near={0.1} far={100} />;
}
