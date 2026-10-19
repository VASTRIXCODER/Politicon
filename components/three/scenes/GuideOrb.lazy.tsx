'use client';

import { lazy } from 'react';
import type { GuideOrbProps, GuideOrbState } from '@/components/three/scenes/GuideOrb';

/*
 * The Policy Guide's orb as pages use it, inside a SceneView (or through
 * components/guide/GuideOrbView, which brings the CSS poster):
 *
 *   <SceneView className="size-24" poster={<OrbPoster state={state} pulse={pulse} />}>
 *     <GuideOrb state={state} pulse={pulse} />
 *   </SceneView>
 *
 * `state` is 'idle' (breathing), 'thinking' (swirling, while a reply is on
 * its way) or 'speaking' (a reply has just arrived); `pulse` increments once
 * per streamed token and ripples light through the orb. A lazy component,
 * so three.js and the scene load with the stage, never in the page's
 * first-load bundle. It brings its own camera and frames itself for a
 * square box. The orb is decoration: the conversation's state is in the DOM
 * (the typing indicator inside the log).
 */

const Lazy = lazy(() => import('@/components/three/scenes/GuideOrb'));

export type { GuideOrbProps, GuideOrbState };

export default function GuideOrb(props: GuideOrbProps) {
  return <Lazy {...props} />;
}
