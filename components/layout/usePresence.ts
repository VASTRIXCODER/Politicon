'use client';

import { useEffect, useState } from 'react';

/**
 * Enter and exit transitions in plain CSS, for overlays that mount only
 * while open (the nav drawer, the account menu), without an animation
 * library in every page's first load.
 *
 *   const { mounted, shown } = usePresence(open, 450);
 *   {mounted && <div data-shown={shown || undefined} className="translate-x-full data-[shown]:translate-x-0 transition-transform" />}
 *
 * `mounted` turns true with `open` (so refs and focus handling see the
 * element in the same render) and stays true for `exitMs` after it closes,
 * while the exit transition plays. `shown` follows a frame behind on open,
 * so the element paints once in its closed state and then transitions in,
 * and drops at once on close. Under reduced motion the CSS should skip the
 * transition (motion-reduce:transition-none); the timing is the same.
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: the closed state must reach the screen before the open one.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted: mounted || open, shown: shown && open };
}
