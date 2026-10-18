'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useViewState } from '@/components/three/runtime';

/**
 * For pieces that start hidden and appear partway through a scene (a film
 * that scrubs): three.js compiles a material the first time it draws, so a
 * piece that first shows mid-scroll stalls a frame. The view compiles its
 * whole scene before its first frame (ViewTunnel's WarmCompile), but a piece
 * whose program changes with what it draws (clipping planes, a texture that
 * arrives) only settles once it has drawn. Call the returned check once per
 * frame, and draw the piece (invisibly: zero opacity, zero scale, fully
 * clipped) while it says true. It stays true until the view has drawn a
 * frame on screen, still behind the poster.
 */
export function useWarmup(): () => boolean {
  const { visible } = useViewState();
  const state = useRef({ visible, done: false });
  useEffect(() => {
    state.current.visible = visible;
  }, [visible]);
  return useCallback(() => {
    const s = state.current;
    const warm = !s.done;
    if (s.visible) s.done = true;
    return warm;
  }, []);
}
