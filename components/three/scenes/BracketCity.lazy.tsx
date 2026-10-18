'use client';

import { lazy } from 'react';
import type { BracketCityProps } from '@/components/three/scenes/BracketCity';

/*
 * The explorer's "brackets as a city" as pages use it, inside a SceneView:
 *
 *   <SceneView interactive className="aspect-[16/9]" poster={<CityPoster />} label={cityDescription(CITY_DATA)}>
 *     <BracketCity data={CITY_DATA} focus={{ bracket, category }} onHover={…} onPick={…} labels={…} />
 *   </SceneView>
 *
 * A lazy component, so three.js and the scene load with the stage, never in
 * the page's first-load bundle. It brings its own camera and lights and
 * frames itself for any box; pass `compact` for a narrow one (a phone).
 * Types and the layout it draws live in bracketCityData.ts (three-free),
 * which DOM code imports directly.
 */

const Lazy = lazy(() => import('@/components/three/scenes/BracketCity'));

export type { BracketCityProps };

export default function BracketCity(props: BracketCityProps) {
  return <Lazy {...props} />;
}
