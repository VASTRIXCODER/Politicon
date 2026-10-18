'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { pointerEffectsAllowed } from '@/lib/hooks/useMagnetic';

/**
 * Cursor spotlight. Tracks a mouse pointer over `listenOn` and keeps three
 * CSS custom properties on `writeTo` for a light that follows it:
 *
 *   --mx, --my   the pointer position in px, relative to `listenOn`
 *   --spot       1 while the pointer is over it, 0 otherwise
 *
 *   background-image: radial-gradient(420px circle at var(--mx) var(--my), rgb(var(--c-glow) / 0.14), transparent 70%);
 *   opacity: var(--spot, 0);
 *
 * Mouse only (touch and pen leave --spot at 0) and off under reduced motion.
 * Writes at most once per animation frame. Returns a cleanup function.
 */
export function trackSpotlight(listenOn: HTMLElement, writeTo: HTMLElement = listenOn): () => void {
  let raf = 0;
  let on = false;
  let mx = 0;
  let my = 0;

  const write = () => {
    raf = 0;
    writeTo.style.setProperty('--mx', `${mx.toFixed(1)}px`);
    writeTo.style.setProperty('--my', `${my.toFixed(1)}px`);
    writeTo.style.setProperty('--spot', on ? '1' : '0');
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(write);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (!on && !pointerEffectsAllowed()) return;
    const r = listenOn.getBoundingClientRect();
    mx = e.clientX - r.left;
    my = e.clientY - r.top;
    on = true;
    schedule();
  };
  const onLeave = () => {
    if (!on) return;
    on = false;
    schedule();
  };

  listenOn.addEventListener('pointermove', onMove, { passive: true });
  listenOn.addEventListener('pointerleave', onLeave);
  return () => {
    listenOn.removeEventListener('pointermove', onMove);
    listenOn.removeEventListener('pointerleave', onLeave);
    cancelAnimationFrame(raf);
    for (const name of ['--mx', '--my', '--spot']) writeTo.style.removeProperty(name);
  };
}

/**
 * Cursor spotlight on one element: sets --mx/--my/--spot on it (see
 * trackSpotlight) for CSS to draw a radial light that follows the pointer.
 * Fine pointers only.
 *
 *   const ref = useSpotlight<HTMLDivElement>();
 *   <div ref={ref} className="relative">…</div>
 */
export function useSpotlight<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return trackSpotlight(el);
  }, []);
  return ref;
}
