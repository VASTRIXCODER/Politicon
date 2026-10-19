'use client';

import { lazy } from 'react';
import type { SpendingTerrainProps } from '@/components/three/scenes/SpendingTerrain';

/*
 * The spending heatmap as a terrain of tiles, as pages use it, inside a SceneView:
 *
 *   const cells = useMemo(() => terrainFromAnalysis(a), [a]);
 *   <SceneView className="aspect-[6/5]" label={describeTerrain(cells)} poster={<TerrainPoster cells={cells} />}>
 *     <SpendingTerrain cells={cells} />
 *   </SceneView>
 *   <p>{terrainScaleNote(cells)}</p>
 *
 * Keep the page's heatmap (SpendingHeatmap) next to it: it prints every
 * figure. (terrainFromAnalysis, describeTerrain, terrainScaleNote:
 * lib/transmission.ts; the poster: components/impact/posters/TerrainPoster.)
 * A lazy component, so three.js and the scene load with the stage, never in
 * the page's first-load bundle. It brings its own camera and lights, and
 * frames itself for any box (about 6:5 for six categories; the exact shape is
 * frameAspect(terrainViewBox(terrainLayout(cells)), TERRAIN_VIEW)).
 */

// From the Transmission's shared chunk (TransmissionScenes.ts): one download for all five of the page's scenes.
const Lazy = lazy(() => import('@/components/three/scenes/TransmissionScenes').then((m) => ({ default: m.SpendingTerrain })));

export type { SpendingTerrainProps };

export default function SpendingTerrain(props: SpendingTerrainProps) {
  return <Lazy {...props} />;
}
