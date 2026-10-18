'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

// Smooth scrolling is a marketing-page effect. App pages (chat, feeds, tables)
// keep native scrolling so nested scroll areas and keyboard scrolling just work.
const MARKETING = new Set(['/', '/explorer', '/privacy', '/terms', '/disclaimer', '/help']);
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/* The live instance, for code that needs to hook into the smooth scroll. */
let current: Lenis | null = null;
const listeners = new Set<(lenis: Lenis | null) => void>();

function setCurrent(lenis: Lenis | null) {
  current = lenis;
  listeners.forEach((l) => l(lenis));
}

/**
 * The page's Lenis instance, or null while smooth scrolling is off (app
 * pages, reduced motion) or not yet started. Lenis is created in an effect
 * after the page's own effects have run, so code that mounts with the page
 * should also subscribe with onLenisChange:
 *
 *   useEffect(() => onLenisChange((lenis) => lenis?.on('scroll', ScrollTrigger.update)), []);
 */
export function getLenis(): Lenis | null {
  return current;
}

/**
 * Calls `listener` with the current instance straight away and again each
 * time one is created or destroyed (route changes, a reduced-motion switch).
 * Returns the unsubscribe function.
 */
export function onLenisChange(listener: (lenis: Lenis | null) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export default function LenisProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enabled = MARKETING.has(pathname);

  useEffect(() => {
    if (!enabled) return;
    const reduced = window.matchMedia(REDUCED_MOTION);
    let lenis: Lenis | null = null;
    let frame = 0;

    // The one animation-frame loop that drives Lenis (autoRaf is off), so
    // anything else that needs the scroll in step (GSAP, the scene store)
    // can hang off this instance instead of starting a loop of its own.
    const loop = (time: number) => {
      lenis?.raf(time);
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (lenis || reduced.matches) return;
      lenis = new Lenis({
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        // Let any inner scroll container (menus, carousels, code blocks) scroll natively.
        allowNestedScroll: true,
        autoRaf: false,
      });
      setCurrent(lenis);
      frame = requestAnimationFrame(loop);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!lenis) return;
      lenis.destroy();
      lenis = null;
      setCurrent(null);
    };

    // Turning reduced motion on mid-visit hands scrolling straight back to the browser.
    const onPreferenceChange = () => (reduced.matches ? stop() : start());

    start();
    reduced.addEventListener('change', onPreferenceChange);
    return () => {
      reduced.removeEventListener('change', onPreferenceChange);
      stop();
    };
  }, [enabled]);

  return <>{children}</>;
}
