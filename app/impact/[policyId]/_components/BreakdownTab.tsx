'use client';

import { useId } from 'react';
import { WhatThisMeans } from '@/components/ui/SimpleMode';
import { formatPts, formatUSD, impactWords } from '@/lib/format';
import { CHART_DESCRIPTIONS } from '@/lib/simpleMode';
import { cn } from '@/lib/utils';
import type { FullAnalysis } from '@/types';
import { costRow, money, shareText, simpleSummary, taxRatePlate, yearlyLedger, type LedgerLine } from './detailModel';
import { Kicker, Pane, StatRow } from './parts';
import { NoPicture } from './visuals';
import styles from './detail.module.css';

/*
 * Financial Breakdown, printed as a record rather than charted: "your
 * yearly ledger", a slip in the receipt's idiom with one line per flow of
 * money (the same lines the Overview's flow draws, so they add up to the
 * net), each with its signed amount and words, a bar on one linear scale
 * and its share of all the money that moves, then the subtotals and the net
 * under a double rule. Beside it, the tax-rate plate (the effective rate
 * before → after on one linear track, the change in points, which way it
 * goes for you) with the tax lines, and the paycheck and budget lines.
 *
 * HTML only: every value is printed as text beside its mark (so no "View as
 * table" is needed), the marks are decoration, and nothing here loads a
 * chart library.
 */

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-muted' } as const;
const yearly = (n: number) => formatUSD(n, { signed: true, suffix: '/yr' });

/** One ledger line's bar: from a centre zero, teal to the right for a gain, amber to the left for a cost. */
function LedgerBar({ line }: { line: LedgerLine }) {
  const width = `${(line.bar * 50).toFixed(2)}%`;
  return (
    <span aria-hidden="true" data-decorative="" className="relative block h-2 w-full rounded-full bg-fg/6">
      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-fg/30" />
      <span
        className={cn('absolute inset-y-0 min-w-[2px] rounded-full', line.tone === 'loss' ? 'right-1/2 bg-loss-fill' : 'left-1/2 bg-gain-fill')}
        style={{ width }}
      />
    </span>
  );
}

function YearlyLedger({ a, simple }: { a: FullAnalysis; simple: boolean }) {
  const titleId = useId();
  const ledger = yearlyLedger(a);
  const { lines } = ledger;
  return (
    <section aria-labelledby={titleId} className={cn(styles.paper, 'rounded-pane px-4 pb-5 pt-5 sm:px-7 sm:pt-6')}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pb-4">
        <div className="min-w-0">
          <Kicker>Financial breakdown</Kicker>
          <h3 id={titleId} className="mt-1 font-display text-xl font-medium leading-snug text-ink sm:text-2xl">
            Your yearly <em>ledger</em>
          </h3>
        </div>
        {lines.length > 0 && (
          <p className="font-mono-data text-meta uppercase tracking-[0.14em] text-muted">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'} · per year
          </p>
        )}
      </div>
      {simple && <p className="-mt-2 mb-4 max-w-2xl text-xs leading-relaxed text-muted">{CHART_DESCRIPTIONS.category}</p>}
      <div aria-hidden="true" data-decorative="" className={styles.perforation} />

      {lines.length === 0 ? (
        <div className="mt-5">
          <NoPicture>This analysis has no yearly amounts by category, so there is nothing to itemize.</NoPicture>
        </div>
      ) : (
        <>
          <p aria-hidden="true" className="mt-4 hidden grid-cols-[minmax(0,10rem)_minmax(0,1fr)_7.5rem] gap-4 font-mono-data text-meta uppercase tracking-[0.14em] text-muted sm:grid">
            <span>Item</span>
            <span>Share of the money that moves</span>
            <span className="text-right">Per year</span>
          </p>
          <ol aria-labelledby={titleId} className="mt-1">
            {lines.map((l) => (
              <li
                key={l.id}
                className={cn(styles.dotted, 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_7.5rem]')}
              >
                <span className="min-w-0 text-sm font-medium text-ink">
                  {l.label}
                  {l.rest && <span className="block text-meta font-normal text-muted">Not split by category</span>}
                </span>
                <span className="col-span-2 row-start-2 flex items-center gap-3 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <LedgerBar line={l} />
                  <span className="w-10 flex-shrink-0 text-right font-mono-data text-meta text-muted">
                    {shareText(l.share)}
                    <span className="sr-only"> of the money that moves</span>
                  </span>
                </span>
                <span className="text-right sm:col-start-3 sm:row-start-1">
                  <span className={cn('block whitespace-nowrap font-mono-data text-sm font-semibold', TONE_TEXT[l.tone])}>{yearly(l.value)}</span>
                  <span className={cn('block text-meta', TONE_TEXT[l.tone])}>{impactWords(l.value)}</span>
                </span>
              </li>
            ))}
          </ol>

          <dl className={cn(styles.dottedTop, 'mt-1 space-y-2 pt-4')}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm text-ink">Subtotal, saves you</dt>
              <dd className={cn('whitespace-nowrap font-mono-data text-sm font-semibold', ledger.gains ? 'text-gain' : 'text-muted')}>{yearly(ledger.gains)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm text-ink">Subtotal, costs you</dt>
              <dd className={cn('whitespace-nowrap font-mono-data text-sm font-semibold', ledger.costs ? 'text-loss' : 'text-muted')}>{yearly(-ledger.costs)}</dd>
            </div>
          </dl>
          <p className={cn(styles.doubleRule, 'mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-4')}>
            <span>
              <span className="block font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Net per year</span>
              <span className={cn('mt-1 block text-sm font-medium', TONE_TEXT[ledger.net > 0 ? 'gain' : ledger.net < 0 ? 'loss' : 'neutral'])}>
                {ledger.net === 0 ? 'No net change' : `Altogether, ${impactWords(ledger.net)}`}
              </span>
            </span>
            <span className={cn('font-mono-data text-2xl font-semibold leading-none tracking-tight sm:text-3xl', TONE_TEXT[ledger.net > 0 ? 'gain' : ledger.net < 0 ? 'loss' : 'neutral'])}>
              {yearly(ledger.net)}
            </span>
          </p>
          <p className="mt-4 max-w-3xl text-meta leading-relaxed text-muted [text-wrap:pretty]">
            Bars run from a centre line at $0 on one linear scale: the longest is {formatUSD(ledger.largest)} a year, teal to the right
            saves you money, amber to the left costs you. Share is each line&apos;s part of all the money that moves, gains and costs
            counted together ({formatUSD(ledger.gross)} a year).
          </p>
        </>
      )}
    </section>
  );
}

/** The effective tax rate before → after, on one linear track from 0%. */
function TaxRatePlate({ a }: { a: FullAnalysis }) {
  const plate = taxRatePlate(a);
  const span = plate ? { left: Math.min(plate.at.before, plate.at.after), width: Math.abs(plate.at.after - plate.at.before) } : null;
  return (
    <Pane title="Your tax rate, before and after">
      {plate && span ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono-data">
            <span className="text-2xl font-semibold text-muted"><span className="sr-only">Before </span>{plate.before}%</span>
            <span aria-hidden="true" className="text-muted">→</span>
            <span className={cn('text-3xl font-semibold', plate.tone === 'neutral' ? 'text-ink' : TONE_TEXT[plate.tone])}><span className="sr-only">, after </span>{plate.after}%</span>
          </p>
          <p className={cn('mt-1 text-sm font-medium', TONE_TEXT[plate.tone])}>
            {plate.words}
            {plate.change !== 0 && <span className="font-normal"> · {plate.cue}</span>}
          </p>
          {/* The track: both rates on one linear scale from 0%; the span between them in the change's tone. */}
          <div aria-hidden="true" data-decorative="" className="mt-5">
            <div className="relative h-2.5 rounded-full bg-fg/8">
              <span
                className={cn('absolute inset-y-0 rounded-full', plate.tone === 'loss' ? 'bg-loss-fill/60' : plate.tone === 'gain' ? 'bg-gain-fill/60' : 'bg-fg/20')}
                style={{ left: `${(span.left * 100).toFixed(2)}%`, width: `${(span.width * 100).toFixed(2)}%` }}
              />
              <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted bg-surface" style={{ left: `${(plate.at.before * 100).toFixed(2)}%` }} />
              <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink" style={{ left: `${(plate.at.after * 100).toFixed(2)}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between font-mono-data text-meta text-muted">
              <span>0%</span>
              <span>{plate.top}%</span>
            </div>
          </div>
          <p className="mt-3 text-meta leading-relaxed text-muted">
            Your effective rate on one linear scale from 0% to {plate.top}%: the ring is before, the dot after.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">This analysis didn’t estimate your effective tax rate.</p>
      )}
      <div className="mt-4 border-t border-fg/8 pt-1">
        <StatRow {...costRow('Federal income tax', a.tax.federalLiabilityChange)} />
        <StatRow {...costRow('State income tax', a.tax.stateLiabilityChange)} />
      </div>
    </Pane>
  );
}

export default function BreakdownTab({ a, simple }: { a: FullAnalysis; simple: boolean }) {
  return (
    <div className="space-y-6">
      {simple && <WhatThisMeans text={simpleSummary(a, 'personal')} />}
      <YearlyLedger a={a} simple={simple} />

      <div className="grid gap-6 lg:grid-cols-2">
        <TaxRatePlate a={a} />
        <Pane title="Your paycheck and budget">
          <StatRow label="Take-home per paycheck" value={money(a.immediate.takeHomePerPaycheck)} positive={a.immediate.takeHomePerPaycheck >= 0} cue={a.immediate.takeHomePerPaycheck} kind="income" />
          <StatRow label="Monthly budget" value={money(a.immediate.monthlyBudgetImpact, '/mo')} positive={a.immediate.monthlyBudgetImpact >= 0} cue={a.immediate.monthlyBudgetImpact} />
          <StatRow label="Yearly budget" value={money(a.immediate.annualBudgetImpact, '/yr')} positive={a.immediate.annualBudgetImpact >= 0} cue={a.immediate.annualBudgetImpact} />
          <StatRow
            label="Effective tax rate change"
            value={formatPts(a.immediate.effectiveTaxRateChange, { digits: 2 })}
            positive={a.immediate.effectiveTaxRateChange === 0 ? undefined : a.immediate.effectiveTaxRateChange < 0}
          />
        </Pane>
      </div>
    </div>
  );
}
