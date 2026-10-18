'use client';

import { lazy } from 'react';

/*
 * The sign-in seal as pages use it, inside a SceneView:
 *
 *   <SceneView className="aspect-square" poster={<SealPoster />} label="…">
 *     <AuthSeal />
 *   </SceneView>
 *
 * A lazy component, so three.js and the scene load with the stage, never in
 * the page's first-load bundle. It brings its own camera, lights and (tier 2)
 * bloom, and frames itself for any box from portrait to wide.
 */

const Lazy = lazy(() => import('@/components/three/scenes/AuthSeal'));

export default function AuthSeal() {
  return <Lazy />;
}
