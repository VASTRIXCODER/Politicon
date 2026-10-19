'use client';

import { lazy } from 'react';
import type { TimelineRibbonProps } from '@/components/three/scenes/TimelineRibbon';

/*
 * The timeline's 12-month glass ribbon as pages use it, inside a SceneView:
 *
 *   const points = useMemo(() => ribbonFromAnalysis(a), [a]);
 *   <SceneView className="aspect-[16/9]" label={describeRibbon(points, a.confidenceScore, focus)}
 *     poster={<RibbonPoster points={points} focus={focus} />}>
 *     <TimelineRibbon points={points} focus={focus} />
 *   </SceneView>
 *   <p>{RIBBON_LEGEND.title}: {RIBBON_LEGEND.wider}. {ribbonScaleNote(points)}</p>
 *
 * The legend ("wider = less certain") must be on the page in DOM text, next
 * to the picture. (ribbonFromAnalysis, describeRibbon, ribbonScaleNote,
 * RIBBON_LEGEND: lib/transmission.ts; the poster:
 * components/impact/posters/RibbonPoster.) A lazy component, so three.js and
 * the scene load with the stage, never in the page's first-load bundle. It
 * brings its own camera and lights, and frames itself for any box (about
 * 16:9 for a typical year).
 */

// From the Transmission's shared chunk (TransmissionScenes.ts): one download for all five of the page's scenes.
const Lazy = lazy(() => import('@/components/three/scenes/TransmissionScenes').then((m) => ({ default: m.TimelineRibbon })));

export type { TimelineRibbonProps };

export default function TimelineRibbon(props: TimelineRibbonProps) {
  return <Lazy {...props} />;
}
