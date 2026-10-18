'use client';

import { createContext, useContext } from 'react';
import { useSceneStore } from '@/lib/three/sceneStore';
import { SCENE_PALETTES, type ScenePalette } from '@/lib/three/palette';
import { useTier, type Tier } from '@/lib/three/tier';
import { useAnimationFrames, usePrefersReducedMotion, useViewState } from '@/components/three/runtime';

/** The palette for this view: night inside [data-night], day inside [data-day], else the page theme. */
export function useScenePalette(): ScenePalette {
  const theme = useSceneStore((s) => s.theme);
  const { tone } = useViewState();
  return SCENE_PALETTES[tone ?? theme];
}

/**
 * Forces the kit's tier for the pieces inside it, whatever the device: only
 * for /lab, which shows the tier-1 and tier-2 materials side by side.
 */
export const KitTierOverride = createContext<1 | 2 | null>(null);

/** The tier in effect, but at least 1: kit pieces only ever mount on a live stage. */
export function useKitTier(): 1 | 2 {
  const tier: Tier = useTier();
  const forced = useContext(KitTierOverride);
  return forced ?? (tier === 2 ? 2 : 1);
}

/**
 * Whether a piece should animate right now (its view is on screen and motion
 * is allowed), holding the stage's clock at `fps` while it does. Under
 * reduced motion every scene is a composed still frame.
 */
export function useAnimated(fps?: number): boolean {
  const { visible } = useViewState();
  const reduced = usePrefersReducedMotion();
  const tier = useKitTier();
  const active = visible && !reduced;
  useAnimationFrames(active, fps ?? (tier === 2 ? 60 : 30));
  return active;
}
