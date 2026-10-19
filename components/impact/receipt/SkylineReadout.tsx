'use client';

import { useId, useState } from 'react';
import { List, Table2 } from 'lucide-react';
import { formatUSD, impactTone, impactWords } from '@/lib/format';
import { horizonWords, skylineTotals, type SkylineHorizon, type SkylineTower } from '@/lib/skyline';
import { cn } from '@/lib/utils';
import { lineNumber, policies, spokenYearly } from './receiptModel';

/*
 * The Skyline in words: its DOM twin on a solid pane. At the chosen horizon
 * it states the cumulative estimate of what saves you money, of what costs
 * you, and the net, each with its sign and its words, says which policies
 * have no projection that far (and are left out of every sum), and "View as
 * table" lists every tower: its number (the receipt's line number), its
 * policy and its amount. The row of the tower the page has lit is marked.
 */

export interface SkylineReadoutProps {
  towers: readonly SkylineTower[];
  horizon: SkylineHorizon;
  focus?: string | null;
  className?: string;
}

const signed = (n: number) => formatUSD(n, { signed: true });
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "saves you $3,600", for the cumulative figures (not per year). */
function spoken(n: number): string {
  return spokenYearly(n).replace(/ a year$/, '');
}

function Figure({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono-data text-meta uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className={cn('mt-1 font-mono-data text-lg font-semibold leading-tight [overflow-wrap:anywhere]', impactTone(value))}>
        <span aria-hidden="true">{signed(value)}</span>
        <span className="sr-only">{spoken(value)}</span>
      </dd>
      <dd className="mt-0.5 text-meta text-muted">{note}</dd>
    </div>
  );
}

export default function SkylineReadout({ towers, horizon, focus = null, className }: SkylineReadoutProps) {
  const [asTable, setAsTable] = useState(false);
  const viewId = useId();
  const t = skylineTotals(towers);
  const when = horizonWords(horizon);
  const missing = t.missing;

  return (
    <div className={cn('rounded-pane border border-fg/10 bg-surface p-4 sm:p-5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-ink">Cumulative estimate {when}</p>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-controls={viewId}
          aria-expanded={asTable}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-meta font-medium text-primary-300 transition-colors hover:bg-fg/5 hover:text-ink"
        >
          {asTable ? <List className="h-3.5 w-3.5" aria-hidden="true" /> : <Table2 className="h-3.5 w-3.5" aria-hidden="true" />}
          {asTable ? 'Hide table' : 'View as table'}
          <span className="sr-only">: the skyline {when}</span>
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
        <Figure label="Saves you" value={t.gains} note={policies(t.gainCount)} />
        <Figure label="Costs you" value={-t.costs} note={policies(t.costCount)} />
        <Figure label="Net" value={t.net} note={capital(impactWords(t.net))} />
      </dl>

      {missing.length > 0 && (
        <p className="mt-3 text-meta leading-relaxed text-muted">
          {missing.length === towers.length
            ? `None of these analyses has a projection ${when} yet; open one to run its full analysis.`
            : `Left out: ${policies(missing.length)} with no projection ${when} yet (an earlier, short analysis), shown as an empty lot.`}
        </p>
      )}

      <div id={viewId}>
        {asTable && (
          // Focusable so keyboard users can scroll a table wider than the pane.
          <div className="mt-4 overflow-x-auto rounded-tile border border-fg/8" role="region" aria-label={`The skyline ${when} (table)`} tabIndex={0}>
            <table className="w-full text-xs">
              <caption className="sr-only">The skyline {when}: each policy&apos;s cumulative estimate</caption>
              <thead>
                <tr className="border-b border-fg/8 bg-fg/3 text-muted">
                  <th scope="col" className="px-3 py-2 text-left font-medium">No.</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Policy</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">{capital(when)}</th>
                </tr>
              </thead>
              <tbody>
                {towers.map((tower, i) => (
                  <tr
                    key={tower.id}
                    aria-current={focus === tower.id ? 'true' : undefined}
                    className={cn('border-b border-fg/6 last:border-0', focus === tower.id && 'bg-primary/[0.08]')}
                  >
                    <td className="px-3 py-2 font-mono-data text-muted">{lineNumber(i)}</td>
                    <th scope="row" className="px-3 py-2 text-left font-normal text-ink">{tower.label}</th>
                    <td className={cn('whitespace-nowrap px-3 py-2 text-right font-mono-data', tower.value === null ? 'text-muted' : impactTone(tower.value))}>
                      {tower.value === null ? 'Not projected' : (
                        <>
                          <span aria-hidden="true">{signed(tower.value)}</span>
                          <span className="sr-only">{spoken(tower.value)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-fg/12">
                  <td className="px-3 py-2" />
                  <th scope="row" className="px-3 py-2 text-left font-semibold text-ink">Net</th>
                  <td className={cn('whitespace-nowrap px-3 py-2 text-right font-mono-data font-semibold', impactTone(t.net))}>
                    <span aria-hidden="true">{signed(t.net)}</span>
                    <span className="sr-only">{spoken(t.net)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
