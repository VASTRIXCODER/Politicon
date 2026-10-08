'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useReducedMotion } from 'framer-motion';
import { User, Search, DollarSign, CheckCircle, Pause, Play } from 'lucide-react';
import Reveal from './Reveal';

const STEP_MS = 3000;

interface Step {
  number: string;
  icon: typeof User;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  details: string[];
}

function buildSteps(stateBills: boolean): Step[] {
  return [
    {
      number: '01',
      icon: User,
      title: 'Build your profile',
      subtitle: 'About two minutes',
      description: 'Tell us your income bracket, location, housing situation, debts, and life stage. We use ranges, not exact figures. Only those ranges (never your name or email) are sent to our AI provider to generate your analyses, and you can export or delete your data anytime.',
      color: '#7B61FF',
      details: ['Income & employment', 'Location & state taxes', 'Housing & debt situation', 'Family & dependents'],
    },
    {
      number: '02',
      icon: Search,
      title: 'Discover policies that affect you',
      subtitle: 'From official records',
      description: stateBills
        ? 'We start from recent bills in Congress (via Congress.gov) and your state legislature (via Open States), and the AI ranks them by how likely they are to affect you. If those sources are unavailable, any AI-suggested item is marked unverified.'
        : 'We start from recent bills in Congress (via Congress.gov), and the AI ranks them by how likely they are to affect you. If the source is unavailable, any AI-suggested item is marked unverified.',
      color: '#00D4FF',
      details: [stateBills ? 'Federal & state bills' : 'Federal bills', 'Relevance score for your profile', 'Official status & bill links', 'Category filters'],
    },
    {
      number: '03',
      icon: DollarSign,
      title: 'See your estimated dollar impact',
      subtitle: 'Usually ready in about a minute',
      description: 'Get a full breakdown: immediate effects, ripple effects, 1/3/5-year projections, and the assumptions behind each number — in dollars, not jargon. Each analysis runs in the background, so you can keep browsing while it’s prepared.',
      color: '#F5C842',
      details: ['Immediate monthly impact', '1-, 3- and 5-year projections', 'Trade-offs & assumptions', 'Confidence level'],
    },
  ];
}

const DESKTOP_QUERY = '(min-width: 1024px)';
function subscribeDesktop(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const isDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;

/**
 * The active card's progress line. Driven by the Web Animations API so it can
 * pause mid-way and finish exactly when the step should advance.
 */
function StepProgress({ color, running, onDone }: { color: string; running: boolean; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const a = el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: STEP_MS,
      easing: 'linear',
      fill: 'forwards',
    });
    a.onfinish = () => onDoneRef.current();
    animation.current = a;
    return () => {
      a.onfinish = null;
      a.cancel();
    };
  }, []);

  useEffect(() => {
    const a = animation.current;
    if (!a || a.playState === 'finished') return;
    if (running) a.play();
    else a.pause();
  }, [running]);

  return <div ref={ref} aria-hidden="true" className="h-0.5 rounded-full mt-6 origin-left" style={{ backgroundColor: color }} />;
}

interface HowItWorksProps {
  /** True when state bills are loaded (Open States is configured). */
  stateBills: boolean;
}

export default function HowItWorks({ stateBills }: HowItWorksProps) {
  const steps = buildSteps(stateBills);
  const [activeStep, setActiveStep] = useState(0);
  const reduceMotion = useReducedMotion();
  // null = follow the motion preference; true/false = the visitor pressed pause/play.
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [inView, setInView] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-advance only where all three cards share a row; stacked on phones,
  // the highlight would move to cards that are off-screen.
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false);
  const playing = userPaused === null ? reduceMotion === false : !userPaused;
  // Once the visitor has used the button, keep the line mounted so pausing freezes it mid-way.
  const showProgress = desktop && (playing || userPaused !== null);
  const running = desktop && playing && inView && !hovered;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Stacked layout: highlight the card nearest the middle of the screen.
  useEffect(() => {
    const el = containerRef.current;
    if (desktop || !el || typeof IntersectionObserver === 'undefined') return;
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          ratios.set(Number((entry.target as HTMLElement).dataset.step), entry.isIntersecting ? entry.intersectionRatio : 0);
        });
        let best = -1;
        let bestRatio = 0;
        ratios.forEach((ratio, idx) => {
          if (ratio > bestRatio) { best = idx; bestRatio = ratio; }
        });
        if (best >= 0) setActiveStep(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-30% 0px -30% 0px' }
    );
    el.querySelectorAll('[data-step]').forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, [desktop]);

  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading" className="py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <Reveal className="text-center mb-20">
          <p className="text-xs font-mono-data text-primary uppercase tracking-widest mb-4">The Process</p>
          <h2 id="how-it-works-heading" className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            From policy to your wallet
            <br />
            <span className="gradient-text">in three steps</span>
          </h2>
          <p className="text-text-muted text-lg max-w-xl mx-auto">
            Built for people who care about their finances, not their news feed.
          </p>
        </Reveal>

        {/* Steps */}
        <div
          ref={containerRef}
          onPointerEnter={e => { if (e.pointerType === 'mouse') setHovered(true); }}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setHovered(false); }}
        >
          <ol className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {steps.map((step, i) => {
              const Icon = step.icon;
              const isActive = activeStep === i;
              return (
                <li key={step.number} data-step={i}>
                  <Reveal delay={i * 120} className="h-full">
                    <div
                      onClick={() => setActiveStep(i)}
                      className={`glass backdrop-filter-none h-full rounded-3xl p-8 cursor-pointer transition-all duration-300 ${
                        isActive ? 'border-white/16 shadow-lg' : ''
                      }`}
                      style={isActive ? { boxShadow: `0 20px 60px ${step.color}22` } : {}}
                    >
                      {/* Step number */}
                      <div className="flex items-center justify-between mb-6">
                        <span
                          aria-hidden="true"
                          className="font-mono-data text-5xl font-bold opacity-20"
                          style={{ color: step.color }}
                        >
                          {step.number}
                        </span>
                        <div
                          aria-hidden="true"
                          className="w-12 h-12 rounded-2xl flex items-center justify-center"
                          style={{ backgroundColor: step.color + '18', border: `1px solid ${step.color}30` }}
                        >
                          <Icon className="w-5 h-5" style={{ color: step.color }} />
                        </div>
                      </div>

                      {/* Content */}
                      <p className="text-xs font-mono-data mb-2" style={{ color: step.color }}>
                        {step.subtitle}
                      </p>
                      <h3 className="font-display text-xl font-semibold text-text-primary mb-3">
                        {step.title}
                      </h3>
                      <p className="text-text-muted text-sm leading-relaxed mb-6">
                        {step.description}
                      </p>

                      {/* Detail list */}
                      <ul className="space-y-2">
                        {step.details.map(detail => (
                          <li key={detail} className="flex items-center gap-2.5">
                            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: step.color }} aria-hidden="true" />
                            <span className="text-xs text-text-muted">{detail}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Progress line: animated while auto-advancing, static otherwise. */}
                      {isActive && (showProgress ? (
                        <StepProgress
                          key={i}
                          color={step.color}
                          running={running}
                          onDone={() => setActiveStep((i + 1) % steps.length)}
                        />
                      ) : (
                        <div aria-hidden="true" className="h-0.5 rounded-full mt-6" style={{ backgroundColor: step.color }} />
                      ))}
                    </div>
                  </Reveal>
                </li>
              );
            })}
          </ol>

          {desktop && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setUserPaused(playing)}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/3 px-4 py-2 text-xs text-text-muted transition-colors hover:border-white/16 hover:text-text-primary"
              >
                {playing
                  ? <><Pause className="w-3.5 h-3.5" aria-hidden="true" /> Pause step tour</>
                  : <><Play className="w-3.5 h-3.5" aria-hidden="true" /> Play step tour</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
