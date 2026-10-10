'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { m } from 'framer-motion';
import { TrendingDown, TrendingUp, Zap, Pause, Play } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { formatUSD } from '@/lib/format';
import { exampleImpact, formatAnnual } from '@/lib/explorerData';

// Semantic positive/negative tokens (tailwind `positive` / `negative`).
const POSITIVE = '#34D399';
const NEGATIVE = '#F87171';

const ROTATE_MS = 4000;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(onChange: () => void) {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;
// The server can't know the preference, so it renders the paused state and the
// hydration render matches it; the real value takes over right after.
const prefersReducedMotionOnServer = () => true;

// Examples from the explorer's illustrative dataset (lib/explorerData), so the
// card and the chart quote the same figures. Balanced on purpose: policy types
// from different sides, and a gain and a cost for both a lower-income and a
// higher-income household. The projection rows are cumulative, like the
// 1/3/5-year view in a real analysis.
const impacts = [
  exampleImpact('premium-subsidy-extension', '25to50k'),
  exampleImpact('income-tax-rate-cut', '100kPlus'),
  exampleImpact('import-tariff', '25to50k'),
  exampleImpact('employer-plan-cap', '100kPlus'),
].map(({ policy, bracket, annual }) => ({
  policy: policy.title,
  bracket: `Sample household • ${bracket.label} income`,
  headline: formatAnnual(annual),
  note: 'estimated for a typical household in this bracket',
  direction: annual < 0 ? ('negative' as const) : ('positive' as const),
  projection: [annual, annual * 3, annual * 5],
  color: annual < 0 ? NEGATIVE : POSITIVE,
}));

const PROJECTION_YEARS = ['Year 1', 'Year 3', 'Year 5'];
/** Bar length as a share of the largest amount in the same example. */
const barWidth = (amount: number, all: number[]) =>
  Math.round((Math.abs(amount) / (Math.max(...all.map(Math.abs)) || 1)) * 100);

/**
 * Rotating example analysis card, visibly labelled as an example. Rotation runs only while the card is on
 * screen, pauses while hovered or focused, has a visible pause/play button,
 * and doesn't start on its own when the OS asks for reduced motion.
 */
export default function ImpactCardDemo() {
  const [index, setIndex] = useState(0);
  // The first example renders in its final state (server HTML included);
  // only later slide changes animate in.
  const [changed, setChanged] = useState(false);
  const reduceMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, prefersReducedMotionOnServer);
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
      setIndex(i => (i + 1) % impacts.length);
    }, ROTATE_MS);
    return () => window.clearTimeout(id);
  }, [rotating, index]);

  const current = impacts[index];
  const goTo = (i: number) => {
    setChanged(true);
    setIndex(i);
  };

  return (
    <div className="lg:animate-float relative w-full max-w-[360px]">
      {/* Glow behind card */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-3xl blur-3xl opacity-30"
        style={{ background: `radial-gradient(circle, ${current.color}44 0%, transparent 70%)` }}
      />
      {/* Pulsing violet halo: an opacity animation (compositor-only) instead of an animated box-shadow. */}
      <div
        aria-hidden="true"
        className="hidden lg:block absolute inset-0 rounded-3xl shadow-[0_0_40px_rgba(123,97,255,0.45),0_0_80px_rgba(123,97,255,0.15)] animate-pulse"
      />

      <div
        ref={rootRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Example impact analyses"
        onPointerEnter={e => { if (e.pointerType === 'mouse') setHovered(true); }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setHovered(false); }}
        onFocus={() => setFocused(true)}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
        className="glass-strong rounded-3xl p-6 w-full relative z-10 shadow-[0_0_20px_rgba(123,97,255,0.3)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/20 flex items-center justify-center" aria-hidden="true">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-meta text-text-muted font-mono-data uppercase tracking-widest">AI Impact Analysis</p>
              <p className="text-xs text-text-primary font-medium">Politicon</p>
            </div>
          </div>
          <Badge variant="gold">Example</Badge>
        </div>

        {/* Current example. Announced politely only while rotation is stopped. */}
        <div
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${impacts.length}`}
          aria-live={rotating ? 'off' : 'polite'}
        >
          <m.div
            key={index}
            initial={changed ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-text-muted text-xs mb-1 font-mono-data">{current.bracket}</p>
            <p className="font-display text-sm font-semibold text-text-primary mb-1 leading-snug">
              {current.policy}
            </p>

            {/* Big impact number */}
            <div className="flex items-baseline gap-2">
              <span
                className="font-mono-data text-3xl font-bold"
                style={{ color: current.color }}
              >
                {current.headline}
              </span>
              {current.direction === 'negative'
                ? <TrendingDown className="w-5 h-5" style={{ color: current.color }} aria-hidden="true" />
                : <TrendingUp className="w-5 h-5" style={{ color: current.color }} aria-hidden="true" />}
            </div>
            <p className="text-meta text-text-muted mb-5">{current.note}</p>

            {/* Cumulative projection, bars scaled to the largest year */}
            <p className="text-meta text-text-muted font-mono-data uppercase tracking-widest mb-2">Cumulative estimate</p>
            <ul className="space-y-3 mb-5">
              {current.projection.map((amount, i) => (
                <li key={PROJECTION_YEARS[i]}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-meta text-text-muted font-mono-data">{PROJECTION_YEARS[i]}</span>
                    <span className="text-meta font-mono-data" style={{ color: current.color }}>{formatUSD(amount, { signed: true })}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden" aria-hidden="true">
                    <m.div
                      className="h-full rounded-full"
                      style={{ width: `${barWidth(amount, current.projection)}%`, backgroundColor: current.color + '99', originX: 0 }}
                      initial={changed ? { scaleX: 0 } : false}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.8, delay: i * 0.12, ease: 'easeOut' }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <p className="border-t border-white/6 pt-4 text-meta text-text-muted">
              Hypothetical policy and illustrative figures from the Public Impact Explorer. Your analyses use your own profile and real bills.
            </p>
          </m.div>
        </div>

        {/* Controls: pause/play and one button per example */}
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            type="button"
            onClick={() => setUserPaused(playing)}
            aria-label={playing ? 'Pause examples' : 'Play examples'}
            className="mr-1 flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/6 hover:text-text-primary"
          >
            {playing ? <Pause className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
          {impacts.map((impact, i) => (
            <button
              key={impact.policy}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show example ${i + 1}: ${impact.policy}`}
              aria-current={i === index ? 'true' : undefined}
              className="group flex h-6 min-w-6 items-center justify-center rounded-full px-1"
            >
              <span
                aria-hidden="true"
                className={`block h-1 rounded-full transition-all duration-300 ${
                  i === index ? 'w-6 bg-primary' : 'w-1.5 bg-white/20 group-hover:bg-white/40'
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
