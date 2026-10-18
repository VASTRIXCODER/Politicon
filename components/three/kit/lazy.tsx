'use client';

import { lazy } from 'react';
import type { ApertureDome3DProps } from '@/components/three/kit/ApertureDome3D';
import type { BillSheetProps } from '@/components/three/kit/BillSheet';
import type { CapitolDomeProps } from '@/components/three/kit/CapitolDome';
import type { GlassMaterialProps } from '@/components/three/kit/GlassMaterial';
import type { LightParticlesProps } from '@/components/three/kit/LightParticles';
import type { PostFXProps } from '@/components/three/kit/PostFX';
import type { SceneCameraProps } from '@/components/three/kit/SceneCamera';
import type { StudioLightsProps } from '@/components/three/kit/StudioLights';

/*
 * The 3D kit as pages use it: SceneView children.
 *
 *   import SceneView from '@/components/three/SceneView';
 *   import { SceneCamera, StudioLights, CapitolDome } from '@/components/three/kit/lazy';
 *
 * Each piece is a lazy component, so a page's first-load bundle carries only
 * these few wrappers; three.js and the piece's own code load with the stage,
 * and only on devices that render 3D. They render inside the stage canvas,
 * where SceneView's Suspense boundary holds the poster until all of a view's
 * pieces have loaded and drawn.
 *
 * (React.lazy rather than next/dynamic: next/dynamic adds its own Suspense
 * boundary, which would let the poster go before the piece has arrived.)
 */

const LazyApertureDome3D = lazy(() => import('@/components/three/kit/ApertureDome3D'));
const LazyBillSheet = lazy(() => import('@/components/three/kit/BillSheet'));
const LazyCapitolDome = lazy(() => import('@/components/three/kit/CapitolDome'));
const LazyGlassMaterial = lazy(() => import('@/components/three/kit/GlassMaterial'));
const LazyLightParticles = lazy(() => import('@/components/three/kit/LightParticles'));
const LazyPostFX = lazy(() => import('@/components/three/kit/PostFX'));
const LazySceneCamera = lazy(() => import('@/components/three/kit/SceneCamera'));
const LazyStudioLights = lazy(() => import('@/components/three/kit/StudioLights'));

export function ApertureDome3D(props: ApertureDome3DProps) {
  return <LazyApertureDome3D {...props} />;
}

export function BillSheet(props: BillSheetProps) {
  return <LazyBillSheet {...props} />;
}

export function CapitolDome(props: CapitolDomeProps) {
  return <LazyCapitolDome {...props} />;
}

/** For a mesh you build yourself: <mesh><sphereGeometry /><GlassMaterial /></mesh>. */
export function GlassMaterial(props: GlassMaterialProps) {
  return <LazyGlassMaterial {...props} />;
}

export function LightParticles(props: LightParticlesProps) {
  return <LazyLightParticles {...props} />;
}

export function PostFX(props: PostFXProps) {
  return <LazyPostFX {...props} />;
}

export function SceneCamera(props: SceneCameraProps) {
  return <LazySceneCamera {...props} />;
}

export function StudioLights(props: StudioLightsProps) {
  return <LazyStudioLights {...props} />;
}
