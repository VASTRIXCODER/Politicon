'use client';

import { Sparkles, GraduationCap } from 'lucide-react';
import { useReadingMode } from '@/components/providers/ReadingModeProvider';
import { cn } from '@/lib/utils';

const OPTION =
  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium transition-[color,background-color,border-color,box-shadow] duration-200 ease-civic';
// The chosen level is a raised paper pill with a violet rim (the rim is the
// 3:1 marker, WCAG 1.4.11), lit faintly violet from below.
const ON =
  'border-primary bg-raised text-text-primary shadow-[0_1px_2px_rgb(var(--c-fg)/0.08),0_6px_14px_-8px_rgb(var(--c-violet)/0.4)] dark:shadow-[inset_0_1px_0_rgb(var(--c-fg)/0.08),0_6px_14px_-8px_rgb(var(--c-violet)/0.55)]';
const OFF = 'border-transparent text-text-muted hover:bg-fg/5 hover:text-text-primary';

/** Persistent Simple / Expert reading-level switch. */
export default function ReadingModeToggle({ className = '' }: { className?: string }) {
  const { mode, setMode } = useReadingMode();
  const simple = mode === 'simple';

  return (
    <div
      role="group"
      aria-label="Reading level"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-fg/10 bg-fg/5 p-1 text-xs',
        className
      )}
    >
      <button type="button" onClick={() => setMode('simple')} className={cn(OPTION, simple ? ON : OFF)} aria-pressed={simple}>
        <Sparkles className={cn('w-3 h-3', simple && 'text-accent')} aria-hidden /> Simple
      </button>
      <button type="button" onClick={() => setMode('expert')} className={cn(OPTION, !simple ? ON : OFF)} aria-pressed={!simple}>
        <GraduationCap className={cn('w-3 h-3', !simple && 'text-primary-300')} aria-hidden /> Expert
      </button>
    </div>
  );
}
