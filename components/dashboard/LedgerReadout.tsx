'use client';

import { useId, useState, type ReactNode } from 'react';
import { List, Table2 } from 'lucide-react';
import CountUp from '@/components/ui/CountUp';
import Skeleton from '@/components/ui/Skeleton';
import { formatUSD, impactWords } from '@/lib/format';
import { ledgerCoverageNote, ledgerScaleNote, ledgerStatusNote, type LedgerModel, type LedgerSlab, type LedgerTone } from '@/lib/ledger';
import { cn } from '@/lib/utils';

/*
 * "Your Ledger" in words: the DOM twin of the glass monolith
 * (components/three/scenes/LedgerMonolith) and of its poster. It states the
 * net yearly impact (sign, colour and words), then every category as a row
 * with its signed amount, its policy count and a bar on the same linear
 * scale as the slabs. Pointing at a row or focusing it with the keyboard
 * lights the same slab in the model (`onFocus`); a slab pointed at in the
 * model lights its row (`focus`), so the readout is the keyboard and
 * screen-reader equivalent of hovering the 3D. "View as table" swaps the
 * rows for a plain data table.
 *
 * With no analyses it says so ("Analyze a policy to start your ledger") and
 * shows no numbers at all.
 */

export interface LedgerReadoutProps {
  model: LedgerModel;
  /** The lit slab's id (from the model or from this readout). */
  focus?: string | null;
  /** A row pointed at or focused (its slab id), or let go (null). */
  onFocus?: (id: string | null) => void;
  /** The dashboard is still loading its analyses. */
  loading?: boolean;
  /** The empty ledger's next step (e.g. a link to the policy feed). */
  emptyAction?: ReactNode;
  /** Heading level of "Your Ledger" (default h2). */
  titleAs?: 'h2' | 'h3';
  className?: string;
}

const TONE_TEXT: Record<LedgerTone, string> = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-muted' };
const TONE_BAR: Record<LedgerTone, string> = { gain: 'bg-gain-fill', loss: 'bg-loss-fill', neutral: 'bg-fg/20' };
const GROUPS: { tone: LedgerTone; title: string; note: string }[] = [
  { tone: 'gain', title: 'Saves you', note: 'Rises above the baseline' },
  { tone: 'loss', title: 'Costs you', note: 'Hangs below the baseline' },
  { tone: 'neutral', title: 'No change', note: 'Nets to $0, no slab' },
];

const yearly = (n: number) => formatUSD(n, { signed: true, suffix: '/yr' });
const policies = (n: number) => `${n} ${n === 1 ? 'policy' : 'policies'}`;
const countLabel = (s: LedgerSlab) => (s.combined ? `${s.policies} ${s.policies === 1 ? 'analysis' : 'analyses'}, combined` : policies(s.policies));

/** "Saves you $1,240 a year · about $103 a month" (the month only where it isn't a rounding of nothing). */
function netWords(net: number): string {
  const words = impactWords(net);
  if (words === 'no change') return 'No net change a year';
  const abs = Math.abs(net);
  const month = abs >= 120 ? ` · about ${formatUSD(abs / 12)} a month` : '';
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${formatUSD(abs)} a year${month}`;
}

function Title({ as: Tag, id }: { as: 'h2' | 'h3'; id: string }) {
  return (
    <Tag id={id} className="font-display text-2xl font-medium text-ink sm:text-3xl">
      Your <em>Ledger</em>
    </Tag>
  );
}

function Row({ slab, max, on, hint, onFocus }: { slab: LedgerSlab; max: number; on: boolean; hint: string; onFocus?: (id: string | null) => void }) {
  const share = max > 0 ? Math.abs(slab.value) / max : 0;
  const words = impactWords(slab.value);
  return (
    <li>
      <button
        type="button"
        data-ledger-slab={slab.id}
        aria-describedby={hint}
        onClick={() => onFocus?.(slab.id)}
        onFocus={() => onFocus?.(slab.id)}
        onBlur={() => on && onFocus?.(null)}
        onMouseEnter={() => onFocus?.(slab.id)}
        onMouseLeave={() => on && onFocus?.(null)}
        className={cn(
          'block w-full rounded-tile border px-3 py-2.5 text-left transition-[background-color,border-color] duration-200 ease-civic',
          on ? 'border-primary/35 bg-primary/[0.06]' : 'border-transparent [@media(hover:hover)]:hover:bg-fg/[0.03]'
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium text-ink">{slab.label}</span>
          <span className="sr-only">
            {`: ${words === 'no change' ? 'no change' : `${words} ${formatUSD(Math.abs(slab.value))} a year`}, from ${countLabel(slab)}`}
          </span>
          <span aria-hidden="true" className={cn('whitespace-nowrap font-mono-data text-sm font-semibold', TONE_TEXT[slab.tone])}>
            {yearly(slab.value)}
          </span>
        </span>
        <span aria-hidden="true" className="mt-1.5 flex items-center gap-3">
          {/* The slab's height, on the model's one linear scale. */}
          <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-fg/6">
            <span
              className={cn('absolute inset-y-0 left-0 rounded-full', TONE_BAR[slab.tone], on && 'shadow-[0_0_10px_rgb(var(--c-glow)/0.6)]')}
              style={{ width: `${(share * 100).toFixed(1)}%` }}
            />
          </span>
          <span className="whitespace-nowrap text-meta text-muted">{countLabel(slab)}</span>
        </span>
      </button>
    </li>
  );
}

function LedgerTable({ model, label }: { model: LedgerModel; label: string }) {
  const cell = 'px-3 py-2';
  return (
    // Focusable so keyboard users can scroll a table wider than the pane.
    <div className="overflow-x-auto rounded-tile border border-fg/8" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full text-xs">
        <caption className="sr-only">Your ledger by category: the yearly impact of your analyzed policies</caption>
        <thead>
          <tr className="border-b border-fg/8 bg-fg/3 text-muted">
            <th scope="col" className={cn(cell, 'text-left font-medium')}>Category</th>
            <th scope="col" className={cn(cell, 'text-right font-medium')}>Policies</th>
            <th scope="col" className={cn(cell, 'text-right font-medium')}>Yearly impact</th>
            <th scope="col" className={cn(cell, 'text-left font-medium')}>Direction</th>
          </tr>
        </thead>
        <tbody>
          {model.slabs.map((s) => (
            <tr key={s.id} className="border-b border-fg/6 last:border-0">
              <th scope="row" className={cn(cell, 'text-left font-normal text-ink')}>{s.label}</th>
              <td className={cn(cell, 'text-right font-mono-data text-ink')}>{s.policies}{s.combined ? ' (combined)' : ''}</td>
              <td className={cn(cell, 'whitespace-nowrap text-right font-mono-data font-semibold', TONE_TEXT[s.tone])}>{yearly(s.value)}</td>
              <td className={cn(cell, 'whitespace-nowrap text-ink')}>{impactWords(s.value).replace(/^./, (c) => c.toUpperCase())}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-fg/12">
            <th scope="row" className={cn(cell, 'text-left font-semibold text-ink')}>Net</th>
            <td className={cn(cell, 'text-right font-mono-data text-ink')}>{model.analysed}</td>
            <td className={cn(cell, 'whitespace-nowrap text-right font-mono-data font-semibold', TONE_TEXT[model.net > 0 ? 'gain' : model.net < 0 ? 'loss' : 'neutral'])}>
              {yearly(model.net)}
            </td>
            <td className={cn(cell, 'whitespace-nowrap font-semibold text-ink')}>{impactWords(model.net).replace(/^./, (c) => c.toUpperCase())}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function LedgerReadout({ model, focus = null, onFocus, loading = false, emptyAction, titleAs = 'h2', className }: LedgerReadoutProps) {
  const [asTable, setAsTable] = useState(false);
  const base = useId();
  const titleId = `${base}-title`;
  const viewId = `${base}-view`;
  const hintId = `${base}-hint`;

  if (loading) {
    return (
      <section aria-labelledby={titleId} aria-busy="true" className={cn('min-w-0', className)}>
        <Title as={titleAs} id={titleId} />
        <div role="status" className="mt-5">
          <span className="sr-only">Loading your ledger…</span>
          <Skeleton shape="line" className="w-32" />
          <Skeleton className="mt-3 h-12 w-56" />
          <Skeleton shape="line" className="mt-3 w-48" />
          <div className="mt-6 space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (model.analysed === 0) {
    return (
      <section aria-labelledby={titleId} className={cn('min-w-0', className)}>
        <Title as={titleAs} id={titleId} />
        <div className="mt-5 rounded-pane border border-dashed border-fg/15 bg-surface/60 px-5 py-8 text-center sm:px-8">
          <p className="font-display text-xl font-medium text-ink">Analyze a policy to start your ledger</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{ledgerScaleNote(model)}</p>
          {emptyAction && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{emptyAction}</div>}
        </div>
      </section>
    );
  }

  const tone = TONE_TEXT[model.net > 0 ? 'gain' : model.net < 0 ? 'loss' : 'neutral'];
  const max = model.slabs.reduce((m, s) => Math.max(m, Math.abs(s.value)), 0);
  const coverage = ledgerCoverageNote(model);
  const status = ledgerStatusNote(model);
  const groups = GROUPS.map((g) => ({ ...g, slabs: model.slabs.filter((s) => s.tone === g.tone) })).filter((g) => g.slabs.length);

  return (
    <section aria-labelledby={titleId} className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <Title as={titleAs} id={titleId} />
        <button
          type="button"
          onClick={() => {
            setAsTable((v) => !v);
            // The rows go away with whatever they had lit.
            if (focus) onFocus?.(null);
          }}
          aria-controls={viewId}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-meta font-medium text-primary-300 transition-colors hover:bg-fg/5 hover:text-ink"
        >
          {asTable ? <List className="h-3.5 w-3.5" aria-hidden /> : <Table2 className="h-3.5 w-3.5" aria-hidden />}
          {asTable ? 'View as list' : 'View as table'}
          <span className="sr-only">: your ledger</span>
        </button>
      </div>

      <p className="mt-4 font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Net yearly impact</p>
      <p className={cn('mt-2 font-mono-data text-4xl font-semibold leading-none tracking-tight sm:text-5xl', tone)}>
        <CountUp value={model.net} duration={1600} format={(n) => formatUSD(n, { signed: true })} suffix="/yr" srLabel={`${formatUSD(model.net, { signed: true })} a year`} />
      </p>
      <p className={cn('mt-2 text-sm font-medium [text-wrap:balance]', tone)}>{netWords(model.net)}</p>
      <p className="mt-1 text-meta text-muted">
        Across {policies(model.analysed)} you analyzed · educational estimates
        {status && <span className="block">{status}</span>}
      </p>

      <div id={viewId} className="mt-6">
        {asTable ? (
          <LedgerTable model={model} label="Your ledger (table)" />
        ) : (
          <div className="space-y-5">
            <p id={hintId} className="sr-only">
              Lights its slab in the ledger model.
            </p>
            {groups.map((g) => (
              <div key={g.tone}>
                <p id={`${base}-${g.tone}`} className="mb-1.5 flex items-baseline justify-between gap-3 px-3">
                  <span className={cn('font-mono-data text-meta font-medium uppercase tracking-[0.16em]', TONE_TEXT[g.tone])}>{g.title}</span>
                  <span aria-hidden="true" className="text-meta text-muted">{g.note}</span>
                </p>
                <ul aria-labelledby={`${base}-${g.tone}`} className="space-y-1">
                  {g.slabs.map((s) => (
                    <Row key={s.id} slab={s} max={max} on={focus === s.id} hint={hintId} onFocus={onFocus} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-5 text-meta leading-relaxed text-muted">
        {ledgerScaleNote(model)}
        {!asTable && ' Point at or focus a row to light its slab.'}
        {coverage && ` ${coverage}`}
      </p>
    </section>
  );
}
