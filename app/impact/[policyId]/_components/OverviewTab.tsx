import { WhatThisMeans } from '@/components/ui/SimpleMode';
import type { Applicability } from '@/lib/applicability';
import { formatPts } from '@/lib/format';
import { pctToDollar } from '@/lib/simpleMode';
import { cn } from '@/lib/utils';
import type { FullAnalysis } from '@/types';
import { money, simpleSummary } from './detailModel';
import { INNER_ROW, Kicker, Pane, StatRow } from './parts';
import { FlowView } from './visuals';

/*
 * Overview: the money's path first (FlowView, the flow from the bill into
 * each part of the budget and on to the net; its list states every
 * category's amount, so no separate category chart repeats it), then the
 * plain-English summary and its assumptions beside the immediate figures,
 * the trade-offs and the first things to consider.
 */

export default function OverviewTab({ a, simple, income, applies }: {
  a: FullAnalysis; simple: boolean; income: number; applies: Applicability;
}) {
  return (
    <div className="space-y-6">
      {simple && <WhatThisMeans text={simpleSummary(a, 'overview') || a.plainEnglishSummary} />}

      <FlowView a={a} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Pane title="What this means for you">
          <p className="max-w-3xl text-sm leading-relaxed text-muted">{a.plainEnglishSummary}</p>
          {a.assumptions.length > 0 && (
            <div className="mt-5 border-t border-fg/8 pt-5">
              <h4 className="mb-2 font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-muted">Assumptions behind these numbers</h4>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-muted">
                {a.assumptions.map((x, i) => <li key={i} className="text-sm leading-relaxed text-muted">{x}</li>)}
              </ul>
            </div>
          )}
        </Pane>

        <Pane title="Immediate Effects">
          <StatRow label="Monthly budget impact" value={money(a.immediate.monthlyBudgetImpact, '/mo')} positive={a.immediate.monthlyBudgetImpact >= 0} cue={a.immediate.monthlyBudgetImpact} />
          <StatRow label="Annual budget impact" value={money(a.immediate.annualBudgetImpact, '/yr')} positive={a.immediate.annualBudgetImpact >= 0} cue={a.immediate.annualBudgetImpact} />
          {(applies.paycheck || a.immediate.takeHomePerPaycheck !== 0) && (
            <StatRow label="Take-home per paycheck" value={money(a.immediate.takeHomePerPaycheck)} positive={a.immediate.takeHomePerPaycheck >= 0} cue={a.immediate.takeHomePerPaycheck} kind="income" />
          )}
          <StatRow
            label={simple ? 'Change to your tax bill' : 'Effective tax rate change'}
            value={simple ? pctToDollar(a.immediate.effectiveTaxRateChange, income) : formatPts(a.immediate.effectiveTaxRateChange, { digits: 2 })}
            positive={a.immediate.effectiveTaxRateChange === 0 ? undefined : a.immediate.effectiveTaxRateChange < 0}
          />
          {a.immediate.spendingCategories.slice(0, 5).map((s, i) => (
            <StatRow key={i} label={s.label} value={money(s.value)} positive={s.value >= 0} cue={s.value} />
          ))}
        </Pane>
      </div>

      <Pane title="Trade-offs">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Kicker className="mb-3 text-gain">You gain</Kicker>
            <div className="space-y-2">
              {a.tradeoffs.gains.length ? a.tradeoffs.gains.map((g, i) => (
                <div key={i} className={cn('flex items-center justify-between gap-3 rounded-tile px-4 py-2.5', INNER_ROW)}>
                  <span className="min-w-0 text-sm text-ink">{g.label}</span>
                  <span className="font-mono-data text-sm font-semibold text-gain">{money(Math.abs(g.value))}</span>
                </div>
              )) : <p className="text-xs text-muted">No notable gains identified.</p>}
            </div>
          </div>
          <div>
            <Kicker className="mb-3 text-loss">You lose</Kicker>
            <div className="space-y-2">
              {a.tradeoffs.losses.length ? a.tradeoffs.losses.map((l, i) => (
                <div key={i} className={cn('flex items-center justify-between gap-3 rounded-tile px-4 py-2.5', INNER_ROW)}>
                  <span className="min-w-0 text-sm text-ink">{l.label}</span>
                  <span className="font-mono-data text-sm font-semibold text-loss">{money(-Math.abs(l.value))}</span>
                </div>
              )) : <p className="text-xs text-muted">No notable losses identified.</p>}
            </div>
          </div>
        </div>
        {a.tradeoffs.netAssessment && (
          <p className="mt-5 border-t border-fg/8 pt-5 text-sm leading-relaxed text-muted">{a.tradeoffs.netAssessment}</p>
        )}
      </Pane>

      <Pane title="Things to consider">
        {a.recommendations.length > 0 ? (
          <ol className="space-y-3">
            {a.recommendations.slice(0, 3).map((r, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/20" aria-hidden>
                  <span className="font-mono-data text-meta text-primary-300">{i + 1}</span>
                </span>
                <p className="text-sm leading-relaxed text-muted">{r.step}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">This analysis didn’t suggest anything to consider.</p>
        )}
      </Pane>
    </div>
  );
}
