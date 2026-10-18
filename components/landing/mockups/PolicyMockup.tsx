import type { CSSProperties } from 'react';
import { formatUSD, impactSign } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FEED_EXAMPLES, PASSAGE_AT, PASSAGE_STEPS, POLICY_EXAMPLE } from './data';
import { AMOUNT_TONE, AppBar, ExampleStamp, Layer, Pane } from './parts';
import RecordSeal from './RecordSeal';
import TiltStage from './TiltStage';
import styles from './mockups.module.css';

const CATEGORY_LABEL = { taxes: 'Taxes', healthcare: 'Healthcare', housing: 'Housing', employment: 'Employment' } as const;

/** Year 1, 3 and 5 of the example, cumulative (the real page uses the analysis's own projections). */
const YEARS = [1, 3, 5] as const;

/**
 * The policy page, "the Transmission", in miniature: the official record's
 * header with its gold seal and status, where the bill stands on its path,
 * the plain-English summary and the estimate for a sample household. A
 * slip of the ranked feed floats beside it. All figures are illustrative
 * (lib/explorerData) and the pane says so.
 */
export default function PolicyMockup({ facing }: { facing: 'left' | 'right' }) {
  const { policy, bracket, annual } = POLICY_EXAMPLE;
  const tone = AMOUNT_TONE[impactSign(annual)];
  const yearly = YEARS.map((y) => ({ y, amount: annual * y }));
  const tallest = Math.max(...yearly.map((r) => Math.abs(r.amount)));

  return (
    <TiltStage facing={facing} className="sm:mb-28">
      <Layer>
        <Pane>
          <AppBar active="Policies" crumb={policy.title} />

          {/* The official record: seal, title, status. */}
          <div className="flex gap-4 border-b border-fg/8 px-4 pb-4 pt-5 sm:px-6">
            <RecordSeal className="h-12 w-12 flex-shrink-0 sm:h-14 sm:w-14" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono-data text-meta uppercase tracking-[0.16em] text-gold">Official record</p>
                <ExampleStamp>Example bill</ExampleStamp>
              </div>
              <p className="mt-1 font-display text-xl font-medium leading-tight text-ink sm:text-2xl">{policy.title}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-meta text-muted">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 font-mono-data font-medium text-primary-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                  In committee
                </span>
                <span>
                  {policy.scope} · {CATEGORY_LABEL[policy.category]}
                </span>
                <span className="hidden sm:inline">Source: Congress.gov</span>
              </div>
            </div>
          </div>

          {/* Where it stands: the record's status, never a prediction. */}
          <ol className="flex items-center gap-1.5 border-b border-fg/8 px-4 py-3 sm:px-6">
            {PASSAGE_STEPS.map((step, i) => (
              <li key={step} className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  className={cn(
                    'h-2 w-2 flex-shrink-0 rounded-full',
                    i < PASSAGE_AT && 'bg-primary',
                    i === PASSAGE_AT && 'bg-primary shadow-[0_0_0_3px_rgb(var(--c-violet)/0.22)]',
                    i > PASSAGE_AT && 'border border-fg/25'
                  )}
                />
                <span
                  className={cn(
                    'truncate text-meta',
                    i === PASSAGE_AT ? 'font-medium text-ink' : 'hidden text-muted sm:inline',
                    i > 2 && 'sm:hidden lg:inline'
                  )}
                >
                  {step}
                </span>
                {i < PASSAGE_STEPS.length - 1 && (
                  <span className={cn('h-px min-w-2 flex-1', i < PASSAGE_AT ? 'bg-primary/60' : 'bg-fg/12')} />
                )}
              </li>
            ))}
          </ol>

          {/* In plain English. */}
          <div className="px-4 py-4 sm:px-6">
            <p className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">In plain English</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink">{policy.summary}</p>
          </div>

          {/* The estimate for a sample household. */}
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-t border-fg/8 bg-fg/[0.025] px-4 pb-5 pt-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-meta text-muted">For a sample {bracket.label} household</p>
              <p className={cn('mt-1 font-mono-data text-3xl font-semibold leading-none tracking-tight sm:text-4xl', tone)}>
                {formatUSD(annual, { signed: true })}
                <span className="ml-0.5 text-base font-medium">/yr</span>
              </p>
              <p className={cn('mt-1.5 text-meta font-medium', tone)}>
                {annual < 0 ? 'Could cost you' : 'Could save you'} about {formatUSD(annual / 12)} a month
              </p>
              <p className="mt-2 flex items-center gap-2 text-meta text-muted">
                Confidence
                <span className="flex gap-0.5">
                  <span className="h-1.5 w-4 rounded-full bg-primary" />
                  <span className="h-1.5 w-4 rounded-full bg-primary" />
                  <span className="h-1.5 w-4 rounded-full bg-fg/12" />
                </span>
                <span className="text-ink">Medium</span>
              </p>
            </div>
            {/* 1, 3 and 5 years, cumulative. */}
            <div className="flex h-20 items-end gap-2.5">
              {yearly.map(({ y, amount }) => (
                <div key={y} className="flex flex-col items-center gap-1">
                  <span
                    className={cn(styles.box, annual < 0 ? styles.loss : styles.gain, styles.windows, 'w-5 sm:w-6')}
                    style={{ height: `${Math.max(8, Math.round((Math.abs(amount) / tallest) * 52))}px`, '--d': '0.35rem' } as CSSProperties}
                  />
                  <span className="font-mono-data text-meta text-muted">Y{y}</span>
                </div>
              ))}
            </div>
          </div>
        </Pane>
      </Layer>

      {/* The ranked feed, lifted off the pane's outer bottom corner (from tablet widths). */}
      <Layer
        depth={90}
        className={cn('absolute -bottom-20 hidden w-60 sm:block', facing === 'left' ? 'right-3' : 'left-3')}
      >
        <Pane className="!rounded-tile p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="font-mono-data text-meta uppercase tracking-[0.14em] text-muted">Your feed</p>
            <span className="text-meta text-muted">Ranked for you</span>
          </div>
          <ul className="space-y-2">
            {FEED_EXAMPLES.map(({ impact, relevance }) => (
              <li key={impact.policy.id} className="rounded-xl border border-fg/8 bg-fg/[0.025] px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-meta font-medium text-ink">{impact.policy.title}</p>
                  <p className={cn('flex-shrink-0 font-mono-data text-meta font-semibold', AMOUNT_TONE[impactSign(impact.annual)])}>
                    {formatUSD(impact.annual, { signed: true })}
                  </p>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-fg/8">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${relevance}%` }} />
                  </span>
                  <span className="font-mono-data text-meta text-muted">{relevance}%</span>
                </div>
              </li>
            ))}
          </ul>
        </Pane>
      </Layer>
    </TiltStage>
  );
}
