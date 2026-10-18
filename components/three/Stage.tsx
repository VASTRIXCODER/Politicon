'use client';

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, advance, useFrame, useThree, type RootState } from '@react-three/fiber';
import type { WebGLRendererParameters } from 'three';
import { PerformanceMonitor, View } from '@react-three/drei';
import { capTier } from '@/lib/three/tier';
import AmbientField from '@/components/three/AmbientField';
import {
  registerStage,
  stageGeneration,
  stageStatus,
  trackedBoxes,
  useClockFps,
  usePostFxCount,
} from '@/components/three/runtime';

/*
 * The one WebGL canvas, fixed behind the whole page and kept across
 * navigations while pages need it (StageLoader mounts it from the root
 * layout, only where a scene, a night section or the drift needs it). It draws the
 * ambient light field, then every <SceneView> on the page into its own box
 * (drei <View> + <View.Port>), so a page with five scenes still has a single
 * WebGL context.
 *
 * Rendering is on demand: a frame is drawn when something asks for one (a
 * scroll, a resize, a box moving, a prop changing, or the animation clock
 * while something animates on screen), never in an idle loop.
 *
 * Frame order (useFrame priorities; any priority > 0 means we render by hand):
 *   -1000  reset renderer state for the frame
 *       0  scene logic (animations, transmission buffers, readiness)
 *       1  ambient field: clear, then the field across the whole canvas
 *       2  each view, scissored to its box (drei View index)
 *     999+ tier-2 effects over the views that asked for them (StagePostFX)
 *
 * The canvas is decorative: aria-hidden, no pointer events (pointer-driven
 * views get events through document.body), and below all content (z-index
 * -1), so anything opaque painted above a SceneView hides it. On context
 * loss every SceneView falls back to its poster; a restored context gets a
 * fresh canvas, and after repeated losses the device drops to tier 0.
 */

const StagePostFX = lazy(() => import('@/components/three/StagePostFX'));

const MAX_DPR: Record<1 | 2, number> = { 1: 1.5, 2: 2 };
const MAX_CONTEXT_LOSSES = 2;
/** The canvas fade-in (matches duration-700 below). */
const FADE_MS = 700;

// Constant props, so the root isn't reconfigured on every render. The
// browser picks the GPU ('default'): asking for 'high-performance' would wake
// the discrete GPU of a dual-GPU laptop for what is mostly ambient light.
const GL: Record<1 | 2, Partial<WebGLRendererParameters>> = {
  1: { antialias: false, alpha: true, powerPreference: 'default', stencil: false, depth: true, preserveDrawingBuffer: false },
  2: { antialias: true, alpha: true, powerPreference: 'default', stencil: false, depth: true, preserveDrawingBuffer: false },
};
const CAMERA = { position: [0, 0, 5] as [number, number, number], fov: 35 };
// The canvas is fixed to the viewport: no need to re-measure on scroll.
const RESIZE = { scroll: false, debounce: { scroll: 0, resize: 0 } };

export interface StageProps {
  tier: 1 | 2;
  /** The ambient field drifts (marketing routes, a mouse, motion allowed). */
  animated: boolean;
  reducedMotion: boolean;
}

/** Puts renderer state back to its defaults at the start of every frame. */
function FrameStart() {
  useFrame(({ gl }) => {
    // The effect composer leaves autoClear off while mounted; transmission
    // buffers (rendered at priority 0) rely on it being on.
    gl.autoClear = true;
  }, -1000);
  return null;
}

/** Wires the canvas to the page: the frame handle, scroll and layout tracking, and the first frame. */
function StageDriver({ onFirstFrame }: { onFirstFrame: () => void }) {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(
    () =>
      registerStage({
        invalidate: () => invalidate(),
        renderNow: () => advance(performance.now()),
      }),
    [invalidate]
  );

  // A frame in the same tick as the scroll, so views stay pinned to their
  // boxes. With nothing tracked, scrolling changes nothing on the canvas
  // (the drifting field has its own clock), so it costs no frames.
  useEffect(() => {
    const onScroll = () => {
      if (trackedBoxes.size > 0) invalidate();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [invalidate]);

  // Boxes can also move without a scroll (content above them loads, a panel
  // opens). A cheap poll catches that.
  useEffect(() => {
    const last = new WeakMap<HTMLElement, string>();
    const id = window.setInterval(() => {
      if (document.hidden || trackedBoxes.size === 0) return;
      let moved = false;
      trackedBoxes.forEach((el) => {
        const r = el.getBoundingClientRect();
        const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        if (last.get(el) !== key) {
          last.set(el, key);
          moved = true;
        }
      });
      if (moved) invalidate();
    }, 250);
    return () => window.clearInterval(id);
  }, [invalidate]);

  // The first frame has been drawn once the browser reaches the next frame.
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    requestAnimationFrame(() => onFirstFrame());
  });

  return null;
}

/**
 * Steps quality down when frames drop while something animates: first the
 * pixel ratio (to 1), then the tier. It only measures while the animation
 * clock runs, against the rate the clock asks for (on-demand frames have no
 * meaningful fps otherwise).
 */
function QualityGovernor({
  tier,
  dpr,
  maxDpr,
  onDpr,
}: {
  tier: 1 | 2;
  /** The pixel-ratio ceiling in force now. */
  dpr: number;
  /** The highest it may go (the tier's limit or the screen's own ratio, whichever is lower). */
  maxDpr: number;
  onDpr: (dpr: number) => void;
}) {
  const fps = useClockFps();
  const step = Math.max(0.25, (maxDpr - 1) / 4);

  if (!fps) return null;
  return (
    <PerformanceMonitor
      // Re-measure from scratch when the requested rate changes.
      key={fps}
      ms={500}
      iterations={6}
      threshold={0.7}
      flipflops={4}
      bounds={() => [fps * 0.6, fps * 0.92]}
      onDecline={() => {
        if (dpr <= 1.01) capTier((tier - 1) as 0 | 1);
        else onDpr(Math.max(1, Math.round((dpr - step) * 100) / 100));
      }}
      onIncline={() => {
        if (dpr < maxDpr) onDpr(Math.min(maxDpr, Math.round((dpr + step) * 100) / 100));
      }}
    />
  );
}

export default function Stage({ tier, animated, reducedMotion }: StageProps) {
  const [shown, setShown] = useState(false);
  // A new canvas (and WebGL context) after a context loss is restored.
  const [canvasKey, setCanvasKey] = useState(0);
  const losses = useRef(0);
  // The live canvas. A replaced or unmounted canvas reports a context loss
  // when R3F disposes it; only the live one's losses count.
  const liveCanvas = useRef<HTMLCanvasElement | null>(null);
  // No point stepping a ratio the screen doesn't have (a 1x monitor drops a tier straight away).
  const [deviceDpr] = useState(() => Math.max(1, window.devicePixelRatio || 1));
  const maxDpr = Math.min(MAX_DPR[tier], deviceDpr);
  const [dprCap, setDprCap] = useState(maxDpr);
  const effectiveCap = Math.min(dprCap, maxDpr);
  const fxCount = usePostFxCount();
  // Effects load on first request and then stay mounted (switched off when unused).
  const [fxLoaded, setFxLoaded] = useState(false);
  if (tier === 2 && fxCount > 0 && !fxLoaded) setFxLoaded(true);

  // <html data-stage="ready"> tells CSS the canvas is fully in (posters such
  // as the CSS ambient light and night-section backgrounds can step aside).
  // It waits for the fade, so nothing goes transparent over a half-faded canvas.
  const readyTimer = useRef(0);
  const onFirstFrame = useCallback(() => {
    setShown(true);
    stageStatus.set('ready');
    window.clearTimeout(readyTimer.current);
    readyTimer.current = window.setTimeout(() => {
      if (stageStatus.get() === 'ready') document.documentElement.dataset.stage = 'ready';
    }, reducedMotion ? 0 : FADE_MS);
  }, [reducedMotion]);

  useEffect(
    () => () => {
      liveCanvas.current = null;
      window.clearTimeout(readyTimer.current);
      stageStatus.set('off');
      delete document.documentElement.dataset.stage;
    },
    []
  );

  const onCreated = useCallback((state: RootState) => {
    // Views drawn into an earlier canvas must draw again before their posters go.
    stageGeneration.set(stageGeneration.get() + 1);
    const canvas = state.gl.domElement;
    liveCanvas.current = canvas;
    canvas.addEventListener('webglcontextlost', () => {
      if (canvas !== liveCanvas.current) return;
      // three.js calls preventDefault, so the browser may restore the context.
      losses.current += 1;
      setShown(false);
      stageStatus.set('lost');
      delete document.documentElement.dataset.stage;
      if (losses.current >= MAX_CONTEXT_LOSSES) capTier(0);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (canvas === liveCanvas.current && losses.current < MAX_CONTEXT_LOSSES) setCanvasKey((k) => k + 1);
    });
  }, []);

  return (
    <div
      aria-hidden="true"
      data-decorative=""
      className="pointer-events-none fixed inset-x-0 top-0 h-screen transition-opacity duration-700 ease-civic supports-[height:100lvh]:h-[100lvh]"
      style={{ zIndex: -1, opacity: shown ? 1 : 0 }}
    >
      <Canvas
        // Antialiasing is fixed at context creation, so a tier change gets a new canvas.
        key={`${tier}-${canvasKey}`}
        frameloop="demand"
        flat
        dpr={[1, effectiveCap]}
        gl={GL[tier]}
        camera={CAMERA}
        eventSource={document.body}
        eventPrefix="client"
        resize={RESIZE}
        onCreated={onCreated}
      >
        <FrameStart />
        <StageDriver onFirstFrame={onFirstFrame} />
        <AmbientField animated={animated} reducedMotion={reducedMotion} tier={tier} />
        <View.Port />
        <QualityGovernor tier={tier} dpr={effectiveCap} maxDpr={maxDpr} onDpr={setDprCap} />
        {tier === 2 && fxLoaded && (
          <Suspense fallback={null}>
            <StagePostFX enabled={fxCount > 0} />
          </Suspense>
        )}
      </Canvas>
    </div>
  );
}
