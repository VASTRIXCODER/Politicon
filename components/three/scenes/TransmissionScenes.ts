/*
 * The policy detail page's five scenes ("The Transmission") as one module,
 * so they load as one lazy chunk: the hero, the overview's money flow, the
 * timeline ribbon, the vulnerability crystal and the spending terrain share
 * most of their pieces (the studio lights, the camera rig, the scale staff,
 * the tone glass, the bill sheet, the light particles), and five separate
 * chunks would each carry their own copy of the small ones. The page mounts
 * the hero first, so by the time a tab is opened its scene is already here.
 *
 * Pages never import this directly: each scene's .lazy.tsx wrapper does.
 */

export { default as TransmissionHero } from '@/components/three/scenes/TransmissionHero';
export { default as FlowSankey } from '@/components/three/scenes/FlowSankey';
export { default as TimelineRibbon } from '@/components/three/scenes/TimelineRibbon';
export { default as VulnerabilityCrystal } from '@/components/three/scenes/VulnerabilityCrystal';
export { default as SpendingTerrain } from '@/components/three/scenes/SpendingTerrain';
