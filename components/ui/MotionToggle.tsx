'use client';

import { Pause, Play } from 'lucide-react';
import { useMotionPaused } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Pauses every moving thing on the site (WCAG 2.2.2): the 3D scenes hold
 * their composed still frames, the landing film becomes its still sequence,
 * smooth scrolling and CSS animations stop. It works whatever the OS motion
 * setting is, and the choice is remembered (lib/motion.ts).
 *
 * A toggle button like SoundToggle: its name stays "Pause motion" and
 * aria-pressed says whether motion is paused. The server render says
 * playing; a saved pause shows right after hydration (the page itself is
 * already still from first paint, via <html data-motion>).
 */
export default function MotionToggle({ className }: { className?: string }) {
  const [paused, setPaused] = useMotionPaused();
  const Icon = paused ? Play : Pause;

  return (
    <button
      type="button"
      aria-pressed={paused}
      onClick={() => setPaused(!paused)}
      className={cn(
        'relative inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-transparent',
        'transition-colors duration-200 ease-civic hover:border-fg/10 hover:bg-fg/5 hover:text-ink',
        paused ? 'text-primary-300' : 'text-muted',
        className
      )}
    >
      <span className="sr-only">Pause motion</span>
      <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2.25} />
      {/* A point of violet light while motion is paused. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_6px_1px_rgb(var(--c-violet)/0.7)]',
          'transition-opacity duration-300 ease-civic',
          paused ? 'opacity-100' : 'opacity-0'
        )}
      />
    </button>
  );
}
