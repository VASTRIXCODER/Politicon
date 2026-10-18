'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { prefersLessMotion } from '@/lib/motion';

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/** Whether pointer-following effects may run right now (a mouse, and motion allowed). */
export function pointerEffectsAllowed(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(FINE_POINTER).matches && !prefersLessMotion();
}

/**
 * Magnetic hover: the element leans toward a mouse pointer over it and
 * settles back when the pointer leaves.
 *
 *   const ref = useMagnetic<HTMLButtonElement>();
 *   <button ref={ref} className="transition-[translate] duration-200 ease-civic">…</button>
 *
 * It writes the CSS `translate` property, not `transform`, so it composes
 * with Tailwind's scale/rotate utilities and Motion's inline transform; give
 * the element a transition on `translate` for the soft follow. Frames are
 * written once per animation frame, straight to the DOM (no re-renders).
 *
 * Off for touch and pen input, without hover-capable fine pointers, under
 * reduced motion, and when `strength` is 0 or less.
 *
 * @param strength The furthest the element moves, in px, when the pointer is
 *   at its edge (default 6). Every size of element moves the same amount.
 */
export function useMagnetic<T extends HTMLElement>(strength = 6): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !(strength > 0)) return;

    let raf = 0;
    let active = false;
    // The offset currently asked for, in px.
    let x = 0;
    let y = 0;

    const write = () => {
      raf = 0;
      el.style.translate = active ? `${x.toFixed(2)}px ${y.toFixed(2)}px` : '';
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      // Checked when the pointer arrives, so a preference changed mid-session applies.
      if (!active && !pointerEffectsAllowed()) return;
      active = true;
      // The box without our own offset, so the pull doesn't feed back on itself.
      const r = el.getBoundingClientRect();
      const left = r.left - x;
      const top = r.top - y;
      if (!r.width || !r.height) return;
      const clamp = (n: number) => Math.max(-1, Math.min(1, n));
      // -1 at one edge, 0 at the centre, 1 at the other.
      x = clamp(((e.clientX - left) / r.width) * 2 - 1) * strength;
      y = clamp(((e.clientY - top) / r.height) * 2 - 1) * strength;
      schedule();
    };

    const onLeave = () => {
      if (!active) return;
      active = false;
      x = 0;
      y = 0;
      schedule();
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    // A scroll under a still pointer would leave the element offset from where it is now.
    window.addEventListener('scroll', onLeave, { passive: true, capture: true });
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onLeave, { capture: true });
      cancelAnimationFrame(raf);
      el.style.translate = '';
    };
  }, [strength]);

  return ref;
}
