'use client';

import { lazy } from 'react';

/*
 * The 404 page's drifting bill as pages use it, inside a SceneView:
 *
 *   <SceneView className="aspect-square" poster={<LostBillPoster />} label="…">
 *     <LostBill />
 *   </SceneView>
 *
 * A lazy component, so three.js and the scene load with the stage, never in
 * the page's first-load bundle. It brings its own camera, lights and (tier 2)
 * bloom, and frames itself for any box from portrait to wide.
 */

const Lazy = lazy(() => import('@/components/three/scenes/LostBill'));

export default function LostBill() {
  return <Lazy />;
}
