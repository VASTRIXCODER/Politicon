'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { m } from 'framer-motion';
import { TrendingDown, TrendingUp, BarChart2, Zap, Pause, Play } from 'lucide-react';

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

const impacts = [
  {
    policy: 'Capital Gains Tax Increase',
    bracket: 'Mid-level investor • $120k income',
    monthly: '-$340/month',
    direction: 'negative' as const,
    bars: [
      { label: 'Tax on gains', pct: 72 },
      { label: 'Portfolio growth', pct: 54 },
      { label: 'Net take-home', pct: 38 },
    ],
    sparkline: [40, 42, 38, 44, 36, 38, 34, 30],
    color: NEGATIVE,
  },
  {
    policy: 'First-Time Homebuyer Credit',
    bracket: 'First-time buyer • $75k income',
    monthly: '+$1,250/month equiv.',
    direction: 'positive' as const,
    bars: [
      { label: 'Tax credit', pct: 85 },
      { label: 'Affordability', pct: 68 },
      { label: 'Net savings', pct: 79 },
    ],
    sparkline: [30, 35, 38, 44, 50, 55, 62, 70],
    color: POSITIVE,
  },
  {
    policy: 'Student Loan Rate Cut',
    bracket: 'Recent grad • $48k income',
    monthly: '-$85/month saved',
    direction: 'positive' as const,
    bars: [
      { label: 'Interest savings', pct: 65 },
      { label: 'Monthly relief', pct: 55 },
      { label: 'Lifetime impact', pct: 90 },
    ],
    sparkline: [60, 55, 58, 52, 48, 44, 40, 35],
    color: POSITIVE,
  },
];

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const normalize = (v: number) => ((v - min) / (max - min)) * 36;

  const points = data.map((v, i) => `${(i / (data.length - 1)) * 120},${40 - normalize(v)}`).join(' ');

  return (
    <svg viewBox="0 0 120 44" className="w-full h-10" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.8"
      />
      <polyline
        points={`0,44 ${points} 120,44`}
        fill={color}
        opacity="0.08"
      />
    </svg>
  );
}

/**
 * Rotating example analysis card. Rotation runs only while the card is on
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
          <div className="w-2 h-2 rounded-full bg-positive animate-pulse" aria-hidden="true" />
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
            <div className="flex items-baseline gap-2 mb-5">
              <span
                className="font-mono-data text-3xl font-bold"
                style={{ color: current.color }}
              >
                {current.monthly}
              </span>
              {current.direction === 'negative'
                ? <TrendingDown className="w-5 h-5" style={{ color: current.color }} aria-hidden="true" />
                : <TrendingUp className="w-5 h-5" style={{ color: current.color }} aria-hidden="true" />}
            </div>

            {/* Bar chart */}
            <ul className="space-y-3 mb-5">
              {current.bars.map((bar, i) => (
                <li key={bar.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-meta text-text-muted font-mono-data">{bar.label}</span>
                    <span className="text-meta font-mono-data" style={{ color: current.color }}>{bar.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden" aria-hidden="true">
                    <m.div
                      className="h-full rounded-full"
                      style={{ width: `${bar.pct}%`, backgroundColor: current.color + '99', originX: 0 }}
                      initial={changed ? { scaleX: 0 } : false}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.8, delay: i * 0.12, ease: 'easeOut' }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {/* Sparkline */}
            <div className="border-t border-white/6 pt-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart2 className="w-3 h-3 text-text-muted" aria-hidden="true" />
                <span className="text-meta text-text-muted font-mono-data">12-month trend</span>
              </div>
              <MiniSparkline data={current.sparkline} color={current.color} />
            </div>
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
