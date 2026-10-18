'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import SceneView from '@/components/three/SceneView';
import HeroCapitol from '@/components/three/scenes/HeroCapitol.lazy';

/** The hero's desktop layout, where the example receipt overlaps the lower half of the Capitol's box. */
const DESKTOP = '(min-width: 1024px)';

function subscribeDesktop(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * The hero's 3D Capitol vignette in its box, loaded by HeroVisual only on
 * devices that run the 3D stage. Decorative (no label): the headline carries
 * the meaning. Eager, so it mounts as soon as the stage is up. On desktops
 * the building is lifted in its box so the dome clears the receipt in front
 * of it, as the drawn poster has it.
 */
export default function HeroScene({ poster }: { poster: ReactNode }) {
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
  return (
    <SceneView eager className="absolute inset-0" poster={poster}>
      {/* On a phone the Capitol is a short band above the headline: in closer. */}
      <HeroCapitol lift={desktop ? 0.16 : 0} closer={desktop ? 1 : 0.8} />
    </SceneView>
  );
}
