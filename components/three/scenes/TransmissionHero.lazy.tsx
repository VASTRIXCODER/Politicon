'use client';

import { lazy } from 'react';
import type { TransmissionHeroProps } from '@/components/three/scenes/TransmissionHero';

/*
 * The policy detail hero ("The Transmission") as pages use it, inside a SceneView:
 *
 *   <SceneView eager className="aspect-[10/9] lg:aspect-[16/9]" label={describeTransmission(a)}
 *     poster={<TransmissionPoster netAnnualImpact={a.netAnnualImpact} status={a.status} />}>
 *     <TransmissionHero netAnnualImpact={a.netAnnualImpact} status={a.status} title={a.policyTitle} />
 *   </SceneView>
 *   <p>{heroScaleNote(a.netAnnualImpact)}</p>
 *
 * (describeTransmission, heroScaleNote: lib/transmission.ts; the poster:
 * components/impact/posters/TransmissionPoster.) A lazy component, so
 * three.js and the scene load with the stage, never in the page's
 * first-load bundle. It brings its own camera and lights, and frames itself
 * for any box from a phone's portrait strip to a wide band.
 */

// From the Transmission's shared chunk (TransmissionScenes.ts): one download for all five of the page's scenes.
const Lazy = lazy(() => import('@/components/three/scenes/TransmissionScenes').then((m) => ({ default: m.TransmissionHero })));

export type { TransmissionHeroProps };

export default function TransmissionHero(props: TransmissionHeroProps) {
  return <Lazy {...props} />;
}
