'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { TrendingDown, TrendingUp, Pause, Play } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { LogoMark } from '@/components/ui/Logo';
import { subscribeMotion, prefersLessMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { ImpactExample } from './impactExamples';
import styles from './receipt.module.css';

// Direction colours as token classes: ledger teal for gains, ember amber for
// costs (text uses the AA text tone, bars the fill tone).
const TONE = {
  positive: { text: 'text-gain', bar: 'bg-gain-fill', Icon: TrendingUp },
  negative: { text: 'text-loss', bar: 'bg-loss-fill', Icon: TrendingDown },
} as const;

const ROTATE_MS = 4000;

// Reduced motion, or the site's "Pause motion" control (lib/motion.ts). The
// server can't know either, so it renders the paused state and the hydration
// render matches it; the real value takes over right after.
const prefersReducedMotionOnServer = () => true;

interface ImpactCardProps {
  /** The examples to rotate through (buildImpactExamples()). */
  examples: ImpactExample[];
  className?: string;
}

/**
 * The example analysis as a policy receipt: a porcelain slip, visibly
 * labelled as an example, rotating through a few illustrative analyses.
 * Rotation runs only while the card is on screen, pauses while hovered or
 * focused, has a visible pause/play button, and doesn't start on its own
 * when the OS asks for reduced motion or the visitor paused motion site-wide.
 * The first example renders in its final state (server HTML included); only
 * later slide changes animate in.
 */
export default function ImpactCard({ examples, className }: ImpactCardProps) {
  const [index, setIndex] = useState(0);
  const [changed, setChanged] = useState(false);
  const reduceMotion = useSyncExternalStore(subscribeMotion, prefersLessMotion, prefersReducedMotionOnServer);
  // null = follow the motion preference; true/false = the visitor pressed pause/play.
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const playing = userPaused === null ? !reduceMotion : !userPaused;
  const rotating = playing && inView && !hovered && !focused;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A fresh timer per slide, so picking a slide restarts the countdown.
  useEffect(() => {
    if (!rotating) return;
    const id = window.setTimeout(() => {
      setChanged(true);
      setIndex((i) => (i + 1) % examples.length);
    }, ROTATE_MS);
    return () => window.clearTimeout(id);
  }, [rotating, index, examples.length]);

  const current = examples[index];
  if (!current) return null;
  const tone = TONE[current.direction];
  const goTo = (i: number) => {
    setChanged(true);
    setIndex(i);
  };

  return (
    <div className={cn('relative w-full max-w-[360px]', className)}>
      {/* Violet light pooled behind the slip. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-12 bg-[radial-gradient(closest-side,rgb(var(--c-glow)/0.32),transparent)]"
      />
      <div className={styles.lift}>
        <div
          ref={rootRef}
          data-day=""
          role="region"
          aria-roledescription="carousel"
          aria-label="Example impact analyses"
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') setHovered(true);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setHovered(false);
          }}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
          }}
          className={cn(styles.receipt, 'relative w-full bg-raised text-left text-ink')}
        >
          <div className={cn(styles.header, 'flex items-center justify-between gap-3 px-5')}>
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-7 w-7" detail="small" />
              <div>
                <p className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Policy receipt</p>
                <p className="text-xs font-medium text-ink">Politicon</p>
              </div>
            </div>
            <Badge variant="example">Example</Badge>
          </div>
          <div aria-hidden="true" className={styles.tear} />

          {/* Current example. Announced politely only while rotation is stopped. */}
          <div
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${examples.length}`}
            aria-live={rotating ? 'off' : 'polite'}
            className="px-5 pb-1 pt-4"
          >
            <div key={index} className={changed ? styles.enter : undefined}>
              <p className="font-mono-data text-meta text-muted">{current.bracket}</p>
              <p className="mt-1 font-display text-lg font-medium leading-snug text-ink">{current.policy}</p>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className={cn('font-mono-data text-[2.25rem] font-semibold leading-none tracking-tight', tone.text)}>
                    {current.headline}
                  </p>
                  <p className="mt-2 text-meta text-muted">{current.verdict}</p>
                </div>
                <tone.Icon className={cn('mb-6 h-5 w-5 flex-shrink-0', tone.text)} aria-hidden="true" />
              </div>

              {/* Cumulative projection, bars scaled to the largest year. */}
              <p className="mb-2 mt-5 font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Cumulative estimate</p>
              <ul className="space-y-2.5">
                {current.projection.map((row, i) => (
                  <li key={row.label} style={{ '--row': i } as CSSProperties}>
                    <div className="flex items-baseline gap-2 font-mono-data text-meta">
                      <span className="text-muted">{row.label}</span>
                      <span aria-hidden="true" className="mb-1 flex-1 border-b border-dotted border-fg/20" />
                      <span className={tone.text}>{row.amount}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-fg/6" aria-hidden="true">
                      <div className={cn(styles.bar, 'h-full rounded-full', tone.bar)} style={{ width: `${row.width}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div aria-hidden="true" className={cn(styles.tear, 'mt-4')} />
          <div className="px-5 pb-4 pt-3">
            <p className="text-meta text-muted">
              Hypothetical policy, illustrative figures (Public Impact Explorer). Your analyses use your own profile and real bills.
            </p>

            {/* Controls: pause/play and one button per example. */}
            <div className="mt-3 flex items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => setUserPaused(playing)}
                aria-label={playing ? 'Pause examples' : 'Play examples'}
                className="mr-1 flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-fg/6 hover:text-ink"
              >
                {playing ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
              {examples.map((example, i) => (
                <button
                  key={example.policy}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Show example ${i + 1}: ${example.policy}`}
                  aria-current={i === index ? 'true' : undefined}
                  className="group flex h-6 min-w-6 items-center justify-center rounded-full px-1"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'block h-1 rounded-full transition-all duration-300',
                      i === index ? 'w-6 bg-primary' : 'w-1.5 bg-fg/20 group-hover:bg-fg/40'
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
