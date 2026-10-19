'use client';

import { lazy } from 'react';
import type { HouseholdSceneProps } from '@/components/three/scenes/HouseholdScene';

/*
 * A person's household diorama as pages use it, inside a SceneView:
 *
 *   <SceneView className="aspect-[5/4]" poster={<HouseholdPoster model={model} />}>
 *     <HouseholdScene model={model} mode="build" lastAdded={lastAdded} />
 *   </SceneView>
 *
 * A lazy component, so three.js and the scene load with the stage, never in
 * the page's first-load bundle. It brings its own camera and lights, and
 * frames itself for any box. 'build' is the onboarding diorama (still,
 * pieces rising in as answers arrive, the reveal at the end); 'avatar' is
 * the small turning household (components/avatar/HouseholdAvatar.tsx).
 */

const Lazy = lazy(() => import('@/components/three/scenes/HouseholdScene'));

export type { HouseholdSceneProps };

export default function HouseholdScene(props: HouseholdSceneProps) {
  return <Lazy {...props} />;
}
