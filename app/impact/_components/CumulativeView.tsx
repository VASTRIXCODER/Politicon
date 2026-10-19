'use client';

import { useMemo, type CSSProperties } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import AiDisclaimer from '@/components/ui/AiDisclaimer';
import CountUp from '@/components/ui/CountUp';
import Surface from '@/components/ui/Surface';
// Code-split: recharts loads only when these charts render.
import { CumulativeProjectionLines, CumulativeStackedBar } from '@/components/charts/LazyCharts';
import { useChartPalette } from '@/components/charts/palette';
import { categoryName } from '@/components/impact/receipt/receiptModel';
import { formatUSD, impactTone, impactWords } from '@/lib/format';
import { cn } from '@/lib/utils';
import { horizonTotals, projectionLines, rankedShares, stackedByCategory, titleList } from './cumulativeModel';
import type { PolicyAnalysisRow } from './impactModel';
import styles from './cumulative.module.css';

/*
 * The Cumulative analysis tab: pick which analyses to combine, and see their
 * net yearly impact, the combined impact by category, the combined 1, 3 and
 * 5-year projections (the analyses' own estimates summed, never the yearly
 * figure multiplied up; any without one are named and left out), each
 * one's share of the total, and the AI's combined outlook.
 *
 * The page loads this with next/dynamic, only when the tab is opened; the
 * selection and the AI summary live in the page's data (useImpactList).
 */

export interface CumulativeViewProps {
  analyses: PolicyAnalysisRow[];
  checkedIds: Set<string>;
  setCheckedIds: (ids: Set<string>) => void;
  checkedAnalyses: PolicyAnalysisRow[];
  netImpact: number;
  cumSummary: string;
  cumLoading: boolean;
}

const signedUSD = (n: number) => formatUSD(n, { signed: true });
const PANE_TITLE = 'font-display text-xl font-medium text-ink';

/**
 * The policies' colours in the combined charts: the categorical colours with
 * no green or red cast (no olive, no magenta), so a policy's colour never
 * reads as a gain or a cost; the sign is the bar below zero and the words.
 */
const SERIES_KEYS = ['taxes', 'housing', 'retirement', 'other'] as const;

export default function CumulativeView({ analyses, checkedIds, setCheckedIds, checkedAnalyses, netImpact, cumSummary, cumLoading }: CumulativeViewProps) {
  const stacked = useMemo(() => {
    const s = stackedByCategory(checkedAnalyses);
    // Categories as people read them ("Social security", not "social-security").
    return { ...s, data: s.data.map((row) => ({ ...row, category: categoryName(String(row.category)) })) };
  }, [checkedAnalyses]);
  const palette = useChartPalette();
  const seriesColors = useMemo(() => SERIES_KEYS.map((k) => palette.category[k]), [palette]);
  const projection = useMemo(() => projectionLines(checkedAnalyses), [checkedAnalyses]);
  const totals = useMemo(() => horizonTotals(checkedAnalyses), [checkedAnalyses]);
  const ranked = useMemo(() => rankedShares(checkedAnalyses), [checkedAnalyses]);
  const net = Math.round(netImpact);
  const words = impactWords(net);

  return (
    <div className="space-y-8">
      <Surface variant="night" as="section" pad="lg" radius="xl" aria-labelledby="cumulative-net" className="overflow-hidden text-center">
        <h2 id="cumulative-net" className="mb-4 font-mono-data text-meta uppercase tracking-[0.16em] text-muted">
          Net annual impact ({checkedAnalyses.length} selected)
        </h2>
        <p className={cn('mb-2 font-mono-data text-5xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-7xl', impactTone(net))}>
          <CountUp value={net} format={signedUSD} srLabel={`${signedUSD(net)} per year, ${words}`} />
        </p>
        <p className="text-muted">
          per year{words !== 'no change' && <span className={impactTone(net)}> · {words}</span>}
        </p>
      </Surface>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Surface as="section" pad="lg" aria-labelledby="select-policies">
          <h2 id="select-policies" className={cn(PANE_TITLE, 'mb-4')}>
            Select policies
          </h2>
          <div role="group" aria-labelledby="select-policies">
            <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
              {analyses.map((analysis) => (
                <label key={analysis.id} className="flex cursor-pointer items-center gap-3 rounded-tile p-3 transition-colors hover:bg-fg/5">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(analysis.id)}
                    onChange={(e) => {
                      const next = new Set(checkedIds);
                      if (e.target.checked) next.add(analysis.id);
                      else next.delete(analysis.id);
                      setCheckedIds(next);
                    }}
                    className="h-4 w-4 rounded accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{analysis.policy_title}</span>
                    <span className="block text-meta text-muted">{categoryName(analysis.category)}</span>
                  </span>
                  <span className="flex-shrink-0 text-right">
                    <span className={cn('block font-mono-data text-meta font-semibold', impactTone(analysis.dollar_impact || 0))}>
                      {formatUSD(analysis.dollar_impact || 0, { signed: true, suffix: '/yr' })}
                    </span>
                    <span className="block text-meta text-muted">{impactWords(analysis.dollar_impact || 0)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </Surface>

        <Surface as="section" pad="lg" aria-labelledby="combined-category">
          <h2 id="combined-category" className={cn(PANE_TITLE, 'mb-4')}>
            Combined impact by category
          </h2>
          <CumulativeStackedBar data={stacked.data} series={stacked.series} height={320} title="Combined impact by category" colors={seriesColors} />
        </Surface>
      </div>

      <Surface as="section" pad="lg" aria-labelledby="combined-projection">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 id="combined-projection" className={PANE_TITLE}>
            1 / 3 / 5-year projection
          </h2>
          <dl className="flex gap-5">
            {totals.map(({ horizon, total, counted }) => (
              <div key={horizon} className="text-right">
                <dt className="font-mono-data text-meta uppercase text-muted">
                  {horizon}yr<span className="sr-only"> total</span>
                </dt>
                <dd className={cn('font-mono-data text-sm font-semibold', counted ? impactTone(total) : 'text-muted')}>
                  {counted ? <CountUp value={total} format={signedUSD} duration={1000} /> : '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mb-4 text-meta text-muted">
          Each analysis&apos;s own cumulative estimate, summed. One line per policy, with a thicker total line.
          {projection.missing.length > 0 &&
            ` Left out, with no ${projection.missing.length === 1 ? 'projection' : 'projections'} yet: ${titleList(projection.missing)}.`}
        </p>
        <CumulativeProjectionLines data={projection.data} series={projection.series} height={340} title="1, 3 and 5-year projection" colors={seriesColors} />
      </Surface>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Surface as="section" pad="lg" aria-labelledby="ranked-contribution">
          <h2 id="ranked-contribution" className={cn(PANE_TITLE, 'mb-5')}>
            Ranked by contribution
          </h2>
          {ranked.length === 0 ? (
            <p className="text-sm text-muted">Select policies to rank their contribution.</p>
          ) : (
            <ol className="space-y-4">
              {ranked.map(({ row: a, share }, i) => (
                <li key={a.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 truncate text-sm text-ink">
                      <span className="font-mono-data text-meta text-muted" aria-hidden="true">
                        #{i + 1}
                      </span>
                      {a.policy_title}
                    </span>
                    <span className={cn('flex-shrink-0 font-mono-data text-meta font-semibold', impactTone(a.dollar_impact || 0))}>
                      {formatUSD(a.dollar_impact || 0, { signed: true, suffix: '/yr' })}
                      <span className="sr-only">, {share}% of the total</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-fg/6" aria-hidden="true">
                    <div
                      className={cn(styles.grow, 'h-full rounded-full', (a.dollar_impact || 0) >= 0 ? 'bg-gain-fill' : 'bg-loss-fill')}
                      style={{ width: `${share}%`, '--i': i } as CSSProperties}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Surface>

        <Surface as="section" pad="lg" aria-labelledby="combined-summary">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/15">
              <Sparkles className="h-3.5 w-3.5 text-primary-300" aria-hidden="true" />
            </div>
            <h2 id="combined-summary" className={PANE_TITLE}>
              AI combined summary
            </h2>
          </div>
          {/* Live region: the outlook arrives a while after the selection changes. */}
          <div role="status" aria-live="polite" aria-busy={cumLoading}>
            {checkedAnalyses.length === 0 ? (
              <p className="text-sm text-muted">Select policies to generate a combined financial outlook.</p>
            ) : cumLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> Generating combined outlook…
              </p>
            ) : cumSummary ? (
              <>
                <p className="text-sm leading-relaxed text-muted">{cumSummary}</p>
                <AiDisclaimer className="mt-3" />
              </>
            ) : (
              <p className="text-sm text-muted">Adjust your selection to generate a combined outlook.</p>
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}
