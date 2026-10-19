import type { CSSProperties } from 'react';
import { ArrowDownUp, Download, Trash2 } from 'lucide-react';
import { formatUSD, impactSign } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LEDGER_LINES, LEDGER_NET, LEDGER_POLICY_COUNT, LEDGER_ROW, LEDGER_TOP } from './data';
import { AMOUNT_TONE, AppBar, DivergingRow, ExampleStamp, Layer, Pane } from './parts';
import TiltStage from './TiltStage';
import styles from './mockups.module.css';

/** The column's tallest side, in px. */
const COLUMN_PX = 128;
/** The plinth's height (h-2). */
const PLINTH_PX = 8;

/**
 * The Ledger: the net of every example policy as a column of glass slabs on
 * a plinth. Gains (ledger teal) stack up from it and costs (ember amber)
 * hang below it, each slab as tall as its category's amount on one linear
 * scale, with the net marked across the column in violet.
 */
function LedgerColumn() {
  const gains = LEDGER_LINES.filter((l) => l.amount > 0);
  const costs = LEDGER_LINES.filter((l) => l.amount < 0);
  const up = gains.reduce((s, l) => s + l.amount, 0);
  const down = costs.reduce((s, l) => s - l.amount, 0);
  const scale = Math.max(1, up, down);
  const px = (amount: number) => Math.max(6, Math.round((Math.abs(amount) / scale) * COLUMN_PX));
  const depth = { '--d': '0.8rem' } as CSSProperties;
  // Where the net line sits: from the top of the column (its padding, then
  // the gains), up or down from the plinth by the net's own height.
  const gainsPx = gains.reduce((s, l) => s + px(l.amount), 0);
  const netPx = Math.round((Math.abs(LEDGER_NET) / scale) * COLUMN_PX);
  const netTop = LEDGER_NET > 0 ? gainsPx - netPx : gainsPx + PLINTH_PX + netPx;

  return (
    <div className="relative flex flex-col items-center justify-center pr-3 pt-3">
      {/* Gains, the first on the plinth: drawn bottom-up so each slab covers the top of the one below. */}
      <div className="relative z-30 flex flex-col-reverse items-center">
        {gains.map((line) => (
          <span
            key={line.key}
            className={cn(styles.box, styles.gain, styles.windows, 'w-14')}
            style={{ ...depth, height: px(line.amount) }}
          />
        ))}
      </div>
      {/* The plinth. */}
      <span className={cn(styles.box, styles.slab, 'relative z-20 h-2 w-24')} style={{ '--d': '1.1rem' } as CSSProperties} />
      {/* Costs, hanging below it, drawn bottom-up for the same reason. */}
      <div className="relative z-10 flex flex-col-reverse items-center">
        {[...costs].reverse().map((line) => (
          <span
            key={line.key}
            className={cn(styles.box, styles.loss, styles.windows, 'w-14 opacity-90')}
            style={{ ...depth, height: px(line.amount) }}
          />
        ))}
      </div>
      {/* The net, marked across the column at its height above the plinth. */}
      {LEDGER_NET !== 0 && (
        <div
          className="absolute inset-x-0 z-40 flex items-center gap-1.5"
          style={{ top: `calc(0.75rem + ${netTop}px)` }}
        >
          <span className="h-0 flex-1 border-t border-dashed border-primary/70" />
          <span className="rounded-full bg-primary-fill px-1.5 py-0.5 font-mono-data text-meta font-semibold leading-none text-white">
            Net
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The cumulative impact dashboard ("Your Ledger") in miniature: the net
 * yearly impact of every tracked policy, its categories as diverging bars
 * and as the Ledger column, and a receipt slip of the largest lines.
 * Figures are illustrative (lib/explorerData).
 */
export default function LedgerMockup({ facing }: { facing: 'left' | 'right' }) {
  const tone = AMOUNT_TONE[impactSign(LEDGER_NET)];
  return (
    <TiltStage facing={facing} className="sm:mb-24">
      <Layer>
        <Pane>
          <AppBar active="My Impact" crumb="Your ledger" />
          <div className="grid grid-cols-1 gap-6 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_9.5rem] sm:px-6">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Net yearly impact</p>
                <ExampleStamp />
              </div>
              <p className={cn('mt-2 font-mono-data text-4xl font-semibold leading-none tracking-tight sm:text-5xl', tone)}>
                {formatUSD(LEDGER_NET, { signed: true })}
                <span className="ml-0.5 text-lg font-medium">/yr</span>
              </p>
              <p className={cn('mt-2 text-meta font-medium', tone)}>
                {LEDGER_NET < 0 ? 'Could cost you' : 'Could save you'} about {formatUSD(LEDGER_NET / 12)} a month
              </p>
              <p className="mt-1 text-meta text-muted">
                {LEDGER_POLICY_COUNT} tracked policies · sample {LEDGER_ROW.label} household
              </p>
              <div className="mt-5 space-y-3">
                {LEDGER_LINES.map((line) => (
                  <DivergingRow key={line.key} label={line.label} amount={line.amount} />
                ))}
              </div>
            </div>
            <div className="hidden sm:block">
              <LedgerColumn />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-fg/8 px-4 py-3 text-meta text-muted sm:px-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-fg/10 px-2.5 py-1">
              <ArrowDownUp className="h-3 w-3" strokeWidth={2} />
              By impact
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-fg/10 px-2.5 py-1">
              <Download className="h-3 w-3" strokeWidth={2} />
              Export
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-fg/10 px-2.5 py-1">
              <Trash2 className="h-3 w-3" strokeWidth={2} />
              Delete my data
            </span>
          </div>
        </Pane>
      </Layer>

      {/* A receipt slip of the largest lines, lifted off the pane's outer bottom corner (from tablet widths). */}
      <Layer
        depth={100}
        className={cn('absolute -bottom-16 hidden w-56 sm:block', facing === 'left' ? 'right-3' : 'left-3')}
      >
        <div data-day="" className={cn(styles.pane, '!rounded-tile px-4 pb-3 pt-3.5 text-ink')}>
          <p className="font-mono-data text-meta uppercase tracking-[0.14em] text-muted">Largest lines</p>
          <ul className="mt-2 divide-y divide-dashed divide-fg/15">
            {LEDGER_TOP.map(({ policy, amount }) => (
              <li key={policy.id} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="truncate text-meta text-ink">{policy.title}</span>
                <span className={cn('flex-shrink-0 font-mono-data text-meta font-semibold', AMOUNT_TONE[impactSign(amount)])}>
                  {formatUSD(amount, { signed: true })}
                </span>
              </li>
            ))}
          </ul>
          <span className={styles.glare} />
        </div>
      </Layer>
    </TiltStage>
  );
}
