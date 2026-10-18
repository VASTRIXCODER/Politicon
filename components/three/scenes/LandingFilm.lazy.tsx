'use client';

import { lazy } from 'react';
import type { LandingFilmProps } from '@/components/three/scenes/LandingFilm';

/*
 * The landing film as pages use it, inside a SceneView:
 *
 *   <SceneView className="h-[100svh]" poster={<FilmPoster />} label="…">
 *     <LandingFilm />
 *   </SceneView>
 *
 * The page drives it through filmStore (lib/three/filmStore): set `progress`
 * from the scroll and `active` while the film section is on screen. For a
 * still frame of one shot (reduced motion): <LandingFilm quality="still"
 * stillShot={2} />. A lazy component, so three.js and the scene load with the
 * stage, never in the page's first-load bundle. It brings its own camera,
 * lights and (tier 2) bloom; compose captions to the left third on wide
 * screens and the lower third on phones (see filmShots.ts for the shots).
 */

const Lazy = lazy(() => import('@/components/three/scenes/LandingFilm'));

export type { LandingFilmProps };

export default function LandingFilm(props: LandingFilmProps) {
  return <Lazy {...props} />;
}
