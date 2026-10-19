/*
 * The Transmission's server posters: what each scene's SceneView shows
 * before (and, without 3D, instead of) the WebGL scene. Each draws the same
 * world from the same angle as its scene (lib/transmission.ts). No hooks, so
 * they render on the server; decorative (SceneView hides them from
 * assistive tech).
 */
export { default as TransmissionPoster, type TransmissionPosterProps } from '@/components/impact/posters/TransmissionPoster';
export { default as FlowPoster, type FlowPosterProps } from '@/components/impact/posters/FlowPoster';
export { default as RibbonPoster, type RibbonPosterProps } from '@/components/impact/posters/RibbonPoster';
export { default as CrystalPoster, type CrystalPosterProps } from '@/components/impact/posters/CrystalPoster';
export { default as TerrainPoster, type TerrainPosterProps } from '@/components/impact/posters/TerrainPoster';
