'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { pointerEffectsAllowed } from '@/lib/hooks/useMagnetic';

const clamp = (n: number) => Math.min(0.5, Math.max(-0.5, n));

/**
 * A docket card's tilt (docket.module.css .sheet): under a mouse the sheet
 * turns a few degrees toward the pointer, and settles flat when it leaves.
 * Writes --tx/--ty (-0.5…0.5) and data-tilt straight to the element, at most
 * once per animation frame (no re-renders). Only for hover-capable fine
 * pointers, and never with reduced motion or "Pause motion" (checked each
 * time the pointer arrives, so a preference changed mid-visit applies).
 * At rest the sheet has no transform at all, so its text stays crisp.
 */
export function useSheetTilt<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let on = false;
    let tx = 0;
    let ty = 0;
    const write = () => {
      raf = 0;
      el.style.setProperty('--tx', tx.toFixed(3));
      el.style.setProperty('--ty', ty.toFixed(3));
      el.toggleAttribute('data-tilt', on);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (!on && !pointerEffectsAllowed()) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      tx = clamp((e.clientX - r.left) / r.width - 0.5);
      ty = clamp((e.clientY - r.top) / r.height - 0.5);
      on = true;
      schedule();
    };
    const onLeave = () => {
      if (!on) return;
      on = false;
      tx = 0;
      ty = 0;
      schedule();
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
      el.removeAttribute('data-tilt');
      el.style.removeProperty('--tx');
      el.style.removeProperty('--ty');
    };
  }, []);

  return ref;
}
