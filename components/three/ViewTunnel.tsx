'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { View } from '@react-three/drei';
import type { Group } from 'three';
import { SceneBoundary, ViewContext, stage, trackedBoxes, useViewState, type ViewState } from '@/components/three/runtime';
import { cn } from '@/lib/utils';

/*
 * The 3D half of a SceneView, loaded only once the stage is up. drei's <View>
 * renders the tracking box here in the page, and tunnels the scene content
 * into the stage canvas (<View.Port /> in Stage.tsx), where it is drawn
 * scissored to that box with its own scene and camera.
 *
 * A view isn't drawn until its shaders are compiled: once its content has
 * mounted (ahead of the viewport, or at once for an eager hero), every
 * material in it, hidden pieces included, is compiled with
 * renderer.compileAsync, which links programs off the main thread where the
 * browser supports KHR_parallel_shader_compile (elsewhere a plain compile
 * still starts the work early). Until then the poster stays,
 * so the first frame that scrolls into view never stalls on a compile.
 */

/** Never hold a view back longer than this waiting for its shaders (a lost context, a driver that never reports ready). */
const WARM_TIMEOUT_MS = 6000;

/** Compiles the view's scene once its content has run a couple of frames (materials set up in their first frames included). */
function WarmCompile({ onWarm }: { onWarm: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const frames = useRef(0);
  const started = useRef(false);
  useEffect(() => invalidate(), [invalidate]);
  useFrame(() => {
    if (started.current) return;
    frames.current += 1;
    if (frames.current < 3) {
      invalidate();
      return;
    }
    started.current = true;
    let settled = false;
    let timer = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      onWarm();
    };
    timer = window.setTimeout(finish, WARM_TIMEOUT_MS);
    try {
      // Without the extension (asked quietly: three.js would warn), compiling
      // still starts the driver's work early, ahead of the first frame.
      if (gl.extensions.has('KHR_parallel_shader_compile')) {
        gl.compileAsync(scene, camera).then(finish, finish);
      } else {
        gl.compile(scene, camera);
        window.setTimeout(finish, 32);
      }
    } catch {
      finish();
    }
  });
  return null;
}

/** Tells the SceneView its content has drawn (on screen), so the poster can go. */
function ViewReady({ onReady }: { onReady: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const { visible } = useViewState();
  const fired = useRef(false);
  useEffect(() => invalidate(), [invalidate, visible]);
  useFrame(() => {
    if (fired.current || !visible) return;
    fired.current = true;
    // The frame this runs in is presented before the next animation frame.
    requestAnimationFrame(() => onReady());
  });
  return null;
}

export interface ViewTunnelProps {
  visible: boolean;
  interactive: boolean;
  tone: 'light' | 'dark' | null;
  onReady: () => void;
  children: ReactNode;
}

export default function ViewTunnel({ visible, interactive, tone, onReady, children }: ViewTunnelProps) {
  // A ref object, not a callback: drei re-applies the handle on every render.
  const boxRef = useRef<HTMLElement | Group | null>(null);
  const [box, setBox] = useState<HTMLElement | null>(null);
  // Drawn only once its shaders are compiled (WarmCompile), and while on screen.
  const [warm, setWarm] = useState(false);
  const onWarm = useCallback(() => setWarm(true), []);
  const drawn = visible && warm;
  useEffect(() => {
    const el = boxRef.current;
    if (!(el instanceof HTMLElement)) return;
    setBox(el);
    return trackedBoxes.add(el);
  }, []);
  // Showing or hiding a view clears its box, so the canvas needs a fresh frame.
  useEffect(() => stage.invalidate(), [drawn, tone]);

  const state = useMemo<ViewState>(() => ({ visible: drawn, element: box, tone }), [drawn, box, tone]);

  return (
    <View
      ref={boxRef}
      index={2}
      visible={drawn}
      className={cn('absolute inset-0', !interactive && 'pointer-events-none')}
    >
      <ViewContext.Provider value={state}>
        {/* A scene that throws goes blank (its poster stays); the stage and other views carry on. */}
        <SceneBoundary onError={(error) => console.warn('Politicon: a 3D view failed, keeping its poster.', error)}>
          <Suspense fallback={null}>
            {children}
            <ViewReady onReady={onReady} />
            {!warm && <WarmCompile onWarm={onWarm} />}
          </Suspense>
        </SceneBoundary>
      </ViewContext.Provider>
    </View>
  );
}
