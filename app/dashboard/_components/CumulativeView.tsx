import { Layers, Sparkles } from 'lucide-react';
import AiDisclaimer from '@/components/ui/AiDisclaimer';
import EmptyState from '@/components/ui/EmptyState';
import IconTile from '@/components/ui/IconTile';
import Surface from '@/components/ui/Surface';
import { formatUSD, impactTone } from '@/lib/format';
import type { PolicyAnalysisRow } from './dashboardModel';

/*
 * The "Cumulative impact" view: each recent analysis as a bar on one linear
 * scale (the largest amount fills the track), the same amounts added up over
 * 1, 3 and 5 years, and the portfolio insight. The running totals hold each
 * yearly estimate flat; they are arithmetic, not a forecast, and the table
 * says so. (The category view is the ledger above.)
 */

const signed = (n: number) => formatUSD(n, { signed: true });
const YEARS = [1, 3, 5] as const;

export default function CumulativeView({ analyses, insight }: { analyses: PolicyAnalysisRow[]; insight: string }) {
  if (analyses.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        titleAs="h2"
        title="No data yet"
        body="Analyze at least one policy to see your cumulative financial picture."
      />
    );
  }

  const max = Math.max(...analyses.map((a) => Math.abs(a.dollar_impact || 0)), 1);
  const sorted = [...analyses].sort((a, b) => Math.abs(b.dollar_impact || 0) - Math.abs(a.dollar_impact || 0));

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Surface pad="lg" className="min-w-0 lg:col-span-5">
        <h2 className="mb-5 font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Policy breakdown</h2>
        <ul className="space-y-4">
          {sorted.map((a) => {
            const val = a.dollar_impact || 0;
            return (
              <li key={a.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-ink" title={a.policy_title}>{a.policy_title}</span>
                  <span className={`whitespace-nowrap font-mono-data text-sm font-semibold ${impactTone(val)}`}>
                    {formatUSD(val, { signed: true, suffix: '/yr' })}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-fg/6" aria-hidden>
                  <div
                    className={`h-full rounded-full transition-[width] duration-700 ease-civic ${val >= 0 ? 'bg-gain-fill' : 'bg-loss-fill'}`}
                    style={{ width: `${(Math.abs(val) / max) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Surface>

      <div className="min-w-0 space-y-6 lg:col-span-7">
        <Surface pad="lg">
          <h2 className="mb-5 font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Running totals</h2>
          {/* Focusable so keyboard users can scroll a table wider than a phone. */}
          <div className="overflow-x-auto" role="region" aria-label="Running totals (table)" tabIndex={0}>
            <table className="w-full text-sm">
              <caption className="sr-only">Each analyzed policy&apos;s yearly estimate added up over 1, 3 and 5 years</caption>
              <thead>
                <tr className="border-b border-fg/8">
                  <th scope="col" className="pb-3 text-left text-xs font-normal text-muted">Policy</th>
                  <th scope="col" className="pb-3 text-right text-xs font-normal text-muted">1 year</th>
                  <th scope="col" className="pb-3 text-right text-xs font-normal text-muted">3 years</th>
                  <th scope="col" className="pb-3 text-right text-xs font-normal text-muted">5 years</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((a) => {
                  const yr1 = a.dollar_impact || 0;
                  return (
                    <tr key={a.id} className="border-b border-fg/4 transition-colors hover:bg-fg/2">
                      <th scope="row" className="max-w-[200px] truncate py-3 pr-3 text-left text-xs font-normal text-ink">{a.policy_title}</th>
                      {YEARS.map((yrs) => (
                        <td key={yrs} className={`py-3 pl-3 text-right font-mono-data text-xs font-semibold ${impactTone(yr1 * yrs)}`}>
                          {signed(yr1 * yrs)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-fg/12">
                  <th scope="row" className="pt-4 text-left text-xs font-semibold text-ink">Total</th>
                  {YEARS.map((yrs) => {
                    const total = analyses.reduce((s, a) => s + (a.dollar_impact || 0) * yrs, 0);
                    return (
                      <td key={yrs} className={`pt-4 text-right font-mono-data text-sm font-semibold ${impactTone(total)}`}>
                        {signed(total)}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-4 text-meta leading-relaxed text-muted">
            Each yearly estimate held flat and added up: simple arithmetic, not a forecast. A policy&apos;s own year-by-year
            outlook is on its impact page.
          </p>
        </Surface>

        {insight && (
          <Surface variant="glass" pad="md">
            <div className="flex items-start gap-3">
              <IconTile icon={Sparkles} size="sm" className="mt-0.5" />
              <div className="min-w-0">
                <h2 className="mb-1 text-sm font-medium text-ink">AI portfolio summary</h2>
                <p className="text-sm leading-relaxed text-muted">{insight}</p>
              </div>
            </div>
            <AiDisclaimer className="mt-3" />
          </Surface>
        )}
      </div>
    </div>
  );
}
