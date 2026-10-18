'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useTier } from '@/lib/three/tier';

type HeroSceneComponent = ComponentType<{ poster: ReactNode }>;

/**
 * The hero's picture: the server-rendered Capitol poster, upgraded to the 3D
 * vignette once the device is known to run the 3D stage (tier 1 or 2).
 *
 * The scene's wrapper (SceneView and the lazy HeroCapitol) is fetched only
 * then, so tier-0 devices never download it and it stays out of the page's
 * first load. The poster renders identically before and after the swap, and
 * SceneView keeps it up until the scene has drawn its first frame.
 */
export default function HeroVisual({ poster }: { poster: ReactNode }) {
  const tier = useTier();
  const [Scene, setScene] = useState<HeroSceneComponent | null>(null);

  useEffect(() => {
    if (tier === 0 || Scene) return;
    let live = true;
    import('./HeroScene').then(
      (mod) => {
        if (live) setScene(() => mod.default);
      },
      // A failed chunk: the poster simply stays.
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [tier, Scene]);

  if (Scene && tier > 0) return <Scene poster={poster} />;
  return <div className="absolute inset-0">{poster}</div>;
}
