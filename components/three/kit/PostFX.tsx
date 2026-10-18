'use client';

import { useEffect } from 'react';
import { useTier } from '@/lib/three/tier';
import { postFxRequests, useViewState } from '@/components/three/runtime';

/*
 * Asks the stage for its tier-2 effects (a subtle bloom, plus a vignette on
 * request) over this view's box while the view is on screen. Renders nothing itself; the effect pass is shared by every
 * view that asks (components/three/StagePostFX.tsx) and never runs on tier 1.
 *
 *   <SceneView …><SceneCamera /><StudioLights /><ApertureDome3D /><PostFX /></SceneView>
 *
 * The effects are clipped to the view's box. The vignette is screen-wide, so
 * only ask for it in a view that fills the viewport (a full-bleed film).
 */
export interface PostFXProps {
  vignette?: boolean;
}

export default function PostFX({ vignette = false }: PostFXProps) {
  const tier = useTier();
  const { visible, element } = useViewState();

  useEffect(() => {
    if (tier < 2 || !visible) return;
    return postFxRequests.request(element, { vignette });
  }, [tier, visible, element, vignette]);

  return null;
}
