'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
 */

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
  useEffect(() => {
    const el = boxRef.current;
    if (!(el instanceof HTMLElement)) return;
    setBox(el);
    return trackedBoxes.add(el);
  }, []);
  // Showing or hiding a view clears its box, so the canvas needs a fresh frame.
  useEffect(() => stage.invalidate(), [visible, tone]);

  const state = useMemo<ViewState>(() => ({ visible, element: box, tone }), [visible, box, tone]);

  return (
    <View
      ref={boxRef}
      index={2}
      visible={visible}
      className={cn('absolute inset-0', !interactive && 'pointer-events-none')}
    >
      <ViewContext.Provider value={state}>
        {/* A scene that throws goes blank (its poster stays); the stage and other views carry on. */}
        <SceneBoundary onError={(error) => console.warn('Politicon: a 3D view failed, keeping its poster.', error)}>
          <Suspense fallback={null}>
            {children}
            <ViewReady onReady={onReady} />
          </Suspense>
        </SceneBoundary>
      </ViewContext.Provider>
    </View>
  );
}
