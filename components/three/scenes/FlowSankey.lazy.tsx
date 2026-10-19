'use client';

import { lazy } from 'react';
import type { FlowSankeyProps } from '@/components/three/scenes/FlowSankey';

/*
 * The overview's money flow as pages use it, inside a SceneView:
 *
 *   const flows = useMemo(() => flowsFromAnalysis(a), [a]);
 *   <SceneView className="aspect-[16/9] sm:aspect-[2/1]" label={describeFlows(flows)} poster={<FlowPoster flows={flows} />}>
 *     <FlowSankey flows={flows} />
 *   </SceneView>
 *   <p>{flowScaleNote(flows)}</p>
 *
 * (flowsFromAnalysis, describeFlows, flowScaleNote: lib/transmission.ts;
 * the poster: components/impact/posters/FlowPoster.) A lazy component, so
 * three.js and the scene load with the stage, never in the page's
 * first-load bundle. It brings its own camera and lights, and frames itself
 * for any box (it is wide: about 2:1 fills its box edge to edge; lib/transmission
 * frameAspect(sankeyViewBox(), SANKEY_VIEW) gives the exact shape).
 */

// From the Transmission's shared chunk (TransmissionScenes.ts): one download for all five of the page's scenes.
const Lazy = lazy(() => import('@/components/three/scenes/TransmissionScenes').then((m) => ({ default: m.FlowSankey })));

export type { FlowSankeyProps };

export default function FlowSankey(props: FlowSankeyProps) {
  return <Lazy {...props} />;
}
