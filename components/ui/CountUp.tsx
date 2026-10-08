'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface CountUpProps {
  /** The number to show. When it changes, the display tweens from where it is now. */
  value: number;
  /** Where the very first tween starts (default 0). Pass `from={value}` to skip it. */
  from?: number;
  /** Tween length in ms (default 1600). */
  duration?: number;
  prefix?: string;
  suffix?: string;
  /** Fraction digits for the default en-US formatting (default 0). */
  decimals?: number;
  /** Custom number formatting, e.g. (n) => formatUSD(n, { signed: true }). Replaces `decimals`. */
  format?: (_n: number) => string;
  /** What screen readers hear. Defaults to the final formatted value with prefix and suffix. */
  srLabel?: string;
  /** Wait until the number scrolls into view before the first tween (default true). */
  startOnView?: boolean;
  className?: string;
}

const numberFormats = new Map<number, Intl.NumberFormat>();
function formatNumber(n: number, decimals: number): string {
  let f = numberFormats.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    numberFormats.set(decimals, f);
  }
  return f.format(n);
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animated number. Frames are written straight to the DOM (no React re-render
 * per frame), later changes tween from the number on screen instead of
 * restarting at 0, and reduced-motion users get the final value at once.
 * The animated text is aria-hidden; screen readers get the final value only.
 */
export default function CountUp({
  value,
  from = 0,
  duration = 1600,
  prefix = '',
  suffix = '',
  decimals = 0,
  format,
  srLabel,
  startOnView = true,
  className,
}: CountUpProps) {
  const target = Number.isFinite(value) ? value : 0;
  const render = (n: number) => `${prefix}${format ? format(n) : formatNumber(n, decimals)}${suffix}`;

  // Latest formatter, so a tween in flight picks up new prefix/suffix/format.
  const renderRef = useRef(render);
  renderRef.current = render;

  const textRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(Number.isFinite(from) ? from : 0);
  // Fixed initial text: React never rewrites it, so it can't clobber the tween.
  const [initialText] = useState(() => render(shown.current));
  const [inView, setInView] = useState(!startOnView);

  useEffect(() => {
    if (inView) return;
    const el = textRef.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || !inView) return;

    const start = shown.current;
    if (start === target || duration <= 0 || prefersReducedMotion()) {
      shown.current = target;
      el.textContent = renderRef.current(target);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const n = p === 1 ? target : start + (target - start) * easeOutCubic(p);
      shown.current = n;
      el.textContent = renderRef.current(n);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, inView]);

  // Formatting changed while idle: redraw the number on screen in the new format.
  const formatKey = `${prefix}\u0000${suffix}\u0000${decimals}`;
  useEffect(() => {
    if (textRef.current) textRef.current.textContent = renderRef.current(shown.current);
  }, [formatKey]);

  return (
    <span className={cn('tabular-nums', className)}>
      <span ref={textRef} aria-hidden="true">{initialText}</span>
      <span className="sr-only">{srLabel ?? render(target)}</span>
    </span>
  );
}
