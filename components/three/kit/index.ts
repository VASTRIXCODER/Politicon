/*
 * The 3D kit, for code that already runs inside the stage (other kit pieces,
 * scene modules loaded with import()). Pages must import from
 * components/three/kit/lazy instead: this barrel pulls in three.js.
 */
export { default as ApertureDome3D, type ApertureDome3DProps } from '@/components/three/kit/ApertureDome3D';
export { default as BillSheet, type BillSheetProps } from '@/components/three/kit/BillSheet';
export { default as CapitolDome, type CapitolDomeProps } from '@/components/three/kit/CapitolDome';
export { default as GlassMaterial, type GlassMaterialProps } from '@/components/three/kit/GlassMaterial';
export { default as LightParticles, defaultCurves, type LightParticlesProps } from '@/components/three/kit/LightParticles';
export { default as PostFX, type PostFXProps } from '@/components/three/kit/PostFX';
export { default as SceneCamera, type SceneCameraProps } from '@/components/three/kit/SceneCamera';
export { default as StudioLights, type StudioLightsProps } from '@/components/three/kit/StudioLights';
export { buildMarkGeometry, type MarkGeometry, type MarkGeometryOptions } from '@/components/three/kit/markGeometry';
export { useAnimated, useKitTier, useScenePalette } from '@/components/three/kit/hooks';
