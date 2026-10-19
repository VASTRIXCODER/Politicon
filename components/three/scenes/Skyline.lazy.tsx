'use client';

import { lazy } from 'react';
import type { SkylineProps } from '@/components/three/scenes/Skyline';

/*
 * "The Skyline" as pages use it, inside a SceneView:
 *
 *   const towers = useMemo(() => skylineTowers(rows, horizon), [rows, horizon]);
 *   const reach = useMemo(() => skylineReach(rows), [rows]);
 *   <SceneView interactive className="aspect-[16/10]" label={describeSkyline(towers, horizon)}
 *     poster={<SkylinePoster towers={towers} reach={reach} />}>
 *     <Skyline towers={towers} horizon={horizon} reach={reach} focus={focus} onFocus={setFocus} />
 *   </SceneView>
 *
 * Keep a DOM twin beside it that states every figure (the receipt and
 * SkylineReadout on /impact). skylineTowers, skylineReach and
 * describeSkyline: lib/skyline.ts; the poster:
 * components/impact/receipt/SkylinePoster. A lazy component, so three.js
 * and the scene load with the stage, never in the page's first-load bundle.
 * It brings its own camera and lights and frames itself for any box.
 */

const Lazy = lazy(() => import('@/components/three/scenes/Skyline'));

export type { SkylineProps };

export default function Skyline(props: SkylineProps) {
  return <Lazy {...props} />;
}
