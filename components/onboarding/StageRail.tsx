import { cn } from '@/lib/utils';

/*
 * Where the person is in onboarding: one progress bar ("Profile setup
 * progress", step n of total) drawn as four segments, one per section, each
 * filling as its questions are reached, and the sections named beneath it
 * (the current one marked for screen readers too). On a phone only the
 * current section's name shows; the others keep their numbers.
 */

export interface RailStage {
  label: string;
  steps: readonly number[];
}

export default function StageRail({ stages, step, total }: { stages: readonly RailStage[]; step: number; total: number }) {
  const current = stages.findIndex((s) => s.steps.includes(step));
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Profile setup progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step + 1}
        aria-valuetext={`Step ${step + 1} of ${total}`}
        className="grid grid-cols-4 gap-1.5"
      >
        {stages.map((stage) => {
          const first = stage.steps[0];
          const fill = Math.min(1, Math.max(0, (step + 1 - first) / stage.steps.length));
          return (
            <span key={stage.label} className="relative block h-1 overflow-hidden rounded-full bg-fg/8">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-primary shadow-[0_0_10px_rgb(var(--c-glow)/0.8)] transition-[width] duration-500 ease-civic"
                style={{ width: `${fill * 100}%` }}
              />
            </span>
          );
        })}
      </div>
      <ol aria-label="Sections" className="mt-2.5 grid grid-cols-4 gap-1.5">
        {stages.map((stage, i) => {
          const active = i === current;
          const done = i < current;
          return (
            <li key={stage.label} aria-current={active ? 'step' : undefined} className="flex min-w-0 items-baseline gap-1.5 text-meta">
              <span aria-hidden="true" className={cn('font-mono-data', active || done ? 'text-primary-300' : 'text-muted')}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={cn('truncate font-medium', active ? 'text-ink' : 'sr-only text-muted sm:not-sr-only')}>
                {stage.label}
                <span className="sr-only">{done ? ' (done)' : active ? ' (current)' : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
