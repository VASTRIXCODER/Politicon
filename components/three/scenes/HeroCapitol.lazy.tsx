'use client';

import { lazy } from 'react';
import type { HeroCapitolProps } from '@/components/three/scenes/HeroCapitol';

/*
 * The hero's Capitol vignette as pages use it, inside a SceneView:
 *
 *   <SceneView eager className="aspect-[5/4]" poster={<CapitolPoster />} label="…">
 *     <HeroCapitol />
 *   </SceneView>
 *
 * A lazy component, so three.js and the scene load with the stage, never in
 * the page's first-load bundle. It brings its own camera, lights and (tier 2)
 * bloom, and frames itself for any box from portrait to wide; `lift` raises
 * the building in its box when something overlaps the box's lower half.
 */

const Lazy = lazy(() => import('@/components/three/scenes/HeroCapitol'));

export type { HeroCapitolProps };

export default function HeroCapitol(props: HeroCapitolProps) {
  return <Lazy {...props} />;
}
