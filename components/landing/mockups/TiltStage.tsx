'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { pointerEffectsAllowed } from '@/lib/hooks/useMagnetic';
import { prefersLessMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import styles from './mockups.module.css';

interface TiltStageProps {
  /** The pane and its satellites, each wrapped in a <Layer> (./parts), as direct children of the 3D group. */
  children: ReactNode;
  /** Which way the pane turns at rest from desktop widths: toward copy on its left or its right. */
  facing?: 'left' | 'right';
  className?: string;
}

/** How long the entrance swing takes (mockups.module.css .stage[data-enter='in']), plus a margin. */
const ENTRANCE_MS = 1800;

const clamp = (n: number) => Math.min(0.5, Math.max(-0.5, n));

/**
 * A product mockup in 2.5D: the panes stand in perspective, lean back a
 * little and turn toward the copy beside them. Decorative (aria-hidden and
 * data-decorative): the feature's caption carries the meaning, so nothing
 * inside may be focusable.
 *
 * Two effects, both only where motion is allowed:
 * - Entrance: a stage still below the fold when the page loads lies back,
 *   flat and low, and swings up into its pose (its layers fanning out in
 *   depth) as it scrolls in. Transforms only; its text is never transparent.
 * - Tilt: under a mouse the group turns toward the pointer and a sheet of
 *   light follows it across the panes. Touch screens keep the resting pose.
 *
 * Frames are written straight to CSS custom properties, at most once per
 * animation frame (no re-renders).
 */
export default function TiltStage({ children, facing = 'left', className }: TiltStageProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window.matchMedia !== 'function' || prefersLessMotion()) return;

    let io: IntersectionObserver | null = null;
    let settle = 0;
    if (typeof IntersectionObserver !== 'undefined' && el.getBoundingClientRect().top > window.innerHeight) {
      el.dataset.enter = 'from';
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          io?.disconnect();
          el.dataset.enter = 'in';
          // Back to the quicker tilt follow once the swing has landed.
          settle = window.setTimeout(() => delete el.dataset.enter, ENTRANCE_MS);
        },
        { rootMargin: '0px 0px -12% 0px' }
      );
      io.observe(el);
    }

    let raf = 0;
    let on = false;
    let tx = 0;
    let ty = 0;
    const write = () => {
      raf = 0;
      el.style.setProperty('--tx', tx.toFixed(3));
      el.style.setProperty('--ty', ty.toFixed(3));
      el.style.setProperty('--spot', on ? '1' : '0');
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      // Checked when the pointer arrives, so a preference changed mid-visit applies.
      if (!on && !pointerEffectsAllowed()) return;
      const r = el.getBoundingClientRect();
      tx = clamp((e.clientX - r.left) / Math.max(1, r.width) - 0.5);
      ty = clamp((e.clientY - r.top) / Math.max(1, r.height) - 0.5);
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
      io?.disconnect();
      window.clearTimeout(settle);
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      delete el.dataset.enter;
      for (const name of ['--tx', '--ty', '--spot']) el.style.removeProperty(name);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" data-decorative="" data-facing={facing} className={cn(styles.stage, className)}>
      <div className={styles.bloom} />
      <div className={styles.floor} />
      <div className={styles.rig}>{children}</div>
    </div>
  );
}

