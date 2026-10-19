'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowDown } from 'lucide-react';
import SceneView from '@/components/three/SceneView';
import LedgerMonolith from '@/components/three/scenes/LedgerMonolith.lazy';
import LedgerPoster from '@/components/dashboard/LedgerPoster';
import LedgerReadout from '@/components/dashboard/LedgerReadout';
import Button from '@/components/ui/Button';
import { formatUSD, impactWords } from '@/lib/format';
import { buildLedger, describeLedger } from '@/lib/ledger';
import { cn } from '@/lib/utils';
import { extremes, type AnalysisTotals, type PolicyAnalysisRow } from './dashboardModel';
import LedgerSkeleton, { LEDGER_BOX, LEDGER_FIGURE, LEDGER_FRAME, LEDGER_GRID, LEDGER_PANE, LedgerAurora } from './LedgerSkeleton';
import styles from './dashboard.module.css';

/*
 * "Your Ledger", the dashboard's centrepiece: the glass monolith (the
 * LedgerMonolith scene on the shared stage, its server-drawn poster before
 * and without 3D), standing in a small Chamber (a night vitrine on the day
 * page), beside its readout on paper, which states every figure the model
 * shows. Pointing at a slab in the model and pointing at (or focusing) its
 * row in the readout light the same category: one `focus` shared by both,
 * so the readout is the keyboard and screen-reader way into the model.
 *
 * Under the readout, the biggest gain and cost among the latest analyses and
 * the count, with the way to every analysis (My Impact).
 *
 * The page loads this section with next/dynamic, off its first-load bundle:
 * it only ever renders in the browser (the ledger is the user's own data),
 * and its code arrives while that data is still loading (LedgerSkeleton
 * holds its place meanwhile, with the same grid).
 */

export interface LedgerSectionProps {
  loading: boolean;
  /** The dashboard's latest analyses and the totals over all of them (lib/ledger.ts buildLedger). */
  analyses: PolicyAnalysisRow[];
  totals: AnalysisTotals | null;
  /** Takes the visitor to the policy feed (the empty ledger's next step). */
  onGoToFeed: () => void;
}

const yearly = (n: number) => formatUSD(n, { signed: true, suffix: '/yr' });

function Legend() {
  const key = 'inline-flex items-center gap-2';
  return (
    <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-meta text-muted">
      <li className={key}>
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-gain-fill" />
        Teal slabs save you money
      </li>
      <li className={key}>
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-loss-fill" />
        Amber slabs cost you
      </li>
      <li className={key}>
        <span aria-hidden="true" className="h-1 w-3.5 rounded-[2px] bg-primary" />
        Violet line: the $0 baseline
      </li>
      <li className={key}>
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-2 border-violet-glow shadow-[0_0_6px_rgb(var(--c-glow)/0.9)]" />
        Ring of light: your net
      </li>
    </ul>
  );
}

export default function LedgerSection({ loading, analyses, totals, onGoToFeed }: LedgerSectionProps) {
  const [focus, setFocus] = useState<string | null>(null);
  const ledger = useMemo(() => buildLedger({ analyses, totals }), [analyses, totals]);
  if (loading) return <LedgerSkeleton />;

  const { gain, cost } = extremes(analyses);
  const empty = ledger.analysed === 0;

  return (
    <div className={cn(styles.rise, LEDGER_GRID)} style={{ '--rise-delay': '80ms' } as CSSProperties}>
      <div className={LEDGER_FIGURE}>
        {/* A small Chamber on the day page: night tokens, and the stage paints night behind it. */}
        <figure data-night="" data-scene-night="" className={cn(styles.chamber, LEDGER_FRAME)}>
          <LedgerAurora />
          <div className={LEDGER_BOX}>
            <SceneView
              interactive
              className="absolute inset-0"
              label={describeLedger(ledger)}
              poster={<LedgerPoster model={ledger} focus={focus} />}
            >
              <LedgerMonolith model={ledger} focus={focus} onFocus={setFocus} />
            </SceneView>
          </div>
          <figcaption className="mt-2 px-2">
            {empty ? <p className="text-center text-meta text-muted">Your ledger fills in as you analyze policies.</p> : <Legend />}
          </figcaption>
        </figure>
      </div>

      <div className={LEDGER_PANE}>
        <LedgerReadout
          model={ledger}
          focus={focus}
          onFocus={setFocus}
          emptyAction={
            <Button variant="ghost" onClick={onGoToFeed} icon={<ArrowDown className="h-4 w-4" />}>
              Pick a policy from your feed
            </Button>
          }
        />

        {analyses.length > 0 && (
          <dl className="mt-8 grid grid-cols-1 gap-x-4 gap-y-5 border-t border-fg/8 pt-6 sm:grid-cols-3">
            {[
              { label: 'Biggest gain', row: gain, tone: 'text-gain' },
              { label: 'Biggest cost', row: cost, tone: 'text-loss' },
            ].map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">{s.label}</dt>
                <dd className={cn('mt-1 font-mono-data text-lg font-semibold', s.row ? s.tone : 'text-muted')}>
                  {s.row ? yearly(s.row.dollar_impact) : '—'}
                  {s.row && <span className="sr-only"> ({impactWords(s.row.dollar_impact)})</span>}
                </dd>
                <dd className="mt-0.5 truncate text-meta text-muted" title={s.row?.policy_title}>
                  {s.row?.policy_title || 'None among recent analyses'}
                </dd>
              </div>
            ))}
            <div className="min-w-0">
              <dt className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Policies analyzed</dt>
              <dd className="mt-1 font-mono-data text-lg font-semibold text-ink">{ledger.analysed}</dd>
              <dd className="mt-0.5 text-meta">
                <Link href="/impact" className="font-medium text-primary-300 underline-offset-2 hover:underline">
                  View all<span className="sr-only"> analyzed policies</span> in My Impact
                </Link>
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
