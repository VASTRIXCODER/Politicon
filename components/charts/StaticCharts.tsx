import { Building2, Globe, Wallet, type LucideIcon } from 'lucide-react';
import { formatUSD } from '@/lib/format';

// HTML-only charts: every value is printed as text, so they need no table
// view, and they don't pull recharts into the page bundle. Being HTML, they
// colour themselves with token classes and CSS variables, so they follow the
// theme without a palette hook.

type Direction = 'positive' | 'negative' | 'neutral';

// ===========================================================================
// Economic transmission waterfall — macro → corporate → personal
// Card-based cascading layout: each tier shows its label, its figure, a bar
// on that tier's own linear scale from 0 (named under it, `scale`; no bar at
// all for a figure of 0) and an optional plain-English detail line.
// ===========================================================================
const WATERFALL_ICONS: LucideIcon[] = [Globe, Building2, Wallet];

export interface WaterfallLevel {
  label: string;
  sublabel: string;
  /** 0 … 100: the figure as a share of its scale's top (0 draws no bar). */
  magnitude: number;
  /** The tier's tone (its card and figure). */
  direction: Direction;
  /** The bar's own figure's sign (its colour); defaults to `direction`. */
  barDirection?: Direction;
  /** The bar's scale in words ("Bar: 0 to 1% of GDP, linear"). */
  scale?: string;
  detail?: string;
}

export function TransmissionWaterfall({ levels }: { levels: WaterfallLevel[] }) {
  if (!levels || levels.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-xs text-text-muted">No data to chart yet.</p>
      </div>
    );
  }

  const borderFor = (d: Direction) =>
    d === 'positive' ? 'border-gain/30' : d === 'negative' ? 'border-loss/30' : 'border-fg/10';
  const bgFor = (d: Direction) =>
    d === 'positive' ? 'bg-gain-fill/8' : d === 'negative' ? 'bg-loss-fill/8' : 'bg-fg/3';
  const barFor = (d: Direction) =>
    d === 'positive' ? 'bg-gain-fill' : d === 'negative' ? 'bg-loss-fill' : 'bg-accent';
  const valueColor = (d: Direction) =>
    // No direction is ink: never the orchid accent, which reads as a meaning of its own.
    d === 'positive' ? 'text-gain' : d === 'negative' ? 'text-loss' : 'text-text-primary';

  return (
    <ol className="space-y-0">
      {levels.map((lvl, i) => {
        const Icon = WATERFALL_ICONS[i] ?? Wallet;
        return (
          <li key={lvl.label}>
            {/* Card */}
            <div
              className={`rounded-2xl border p-5 ${borderFor(lvl.direction)} ${bgFor(lvl.direction)}`}
              style={{ marginLeft: `${i * 5}%` }}
            >
              {/* Header row */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3">
                <div className="flex items-center gap-2.5">
                  <Icon className="w-5 h-5 text-text-muted flex-shrink-0" aria-hidden />
                  <span className="text-sm font-semibold text-text-primary">{lvl.label}</span>
                </div>
                <span className={`font-mono-data text-sm font-bold ${valueColor(lvl.direction)}`}>
                  {lvl.sublabel}
                </span>
              </div>

              {/* The bar (the value is printed above): linear from 0 on the scale named under it; none for 0. */}
              {lvl.magnitude > 0 ? (
                <div className="mb-3">
                  <div className="h-2.5 rounded-full bg-fg/8 overflow-hidden" aria-hidden>
                    <div
                      className={`h-full min-w-[2px] rounded-full transition-[width] duration-700 ease-out ${barFor(lvl.barDirection ?? lvl.direction)}`}
                      style={{ width: `${Math.min(100, lvl.magnitude)}%` }}
                    />
                  </div>
                  {lvl.scale && <p className="mt-1.5 font-mono-data text-meta text-text-muted">{lvl.scale}</p>}
                </div>
              ) : (
                <p className="mb-3 font-mono-data text-meta text-text-muted">No change to draw</p>
              )}

              {/* Detail text */}
              {lvl.detail && (
                <p className="text-xs text-text-muted leading-relaxed">{lvl.detail}</p>
              )}
            </div>

            {/* Connector arrow */}
            {i < levels.length - 1 && (
              <div
                className="flex items-center py-1"
                style={{ marginLeft: `calc(${(i + 0.5) * 5}% + 24px)` }}
                aria-hidden
              >
                <div className="flex flex-col items-center">
                  <div className="w-px h-3 bg-fg/15" />
                  <svg width="10" height="6" viewBox="0 0 10 6" className="text-fg/20">
                    <path d="M0 0L5 6L10 0" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ===========================================================================
// Spending heatmap — categories tinted ledger teal (saves) or ember amber (costs more)
// ===========================================================================
export function SpendingHeatmap(
  { items, numbered = false, focus = null, onFocus }:
  {
    items: { category: string; dollarImpact: number; direction?: Direction; id?: string }[];
    /** Number the cells 1 … n (to match numbers laid over a picture of the same items). */
    numbered?: boolean;
    /** The cell (its id) to mark as lit. */
    focus?: string | null;
    /** A cell pointed at (its id), or let go (null). */
    onFocus?: (_id: string | null) => void;
  }
) {
  if (!items || items.length === 0) {
    return <div className="flex items-center justify-center py-10"><p className="text-xs text-text-muted">No data to chart yet.</p></div>;
  }
  const max = Math.max(...items.map((i) => Math.abs(i.dollarImpact)), 1);
  const intensityOf = (v: number) => Math.min(1, Math.abs(v) / max);
  // The tint tops out at --heat alpha (0.12 on paper, 0.35 at night) so the
  // value text stays AA on every cell (at full intensity, about 4.7:1 by day
  // and 4.9:1 by night for the amber; the label is higher). The bar carries the size.
  const cellColor = (v: number) => {
    const alpha = `calc(var(--heat) * ${(0.3 + intensityOf(v) * 0.7).toFixed(3)})`;
    if (v > 0) return `rgb(var(--c-gain-fill) / ${alpha})`; // savings
    if (v < 0) return `rgb(var(--c-loss-fill) / ${alpha})`; // costs more
    return 'rgb(var(--c-fg) / 0.06)';
  };
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 [--heat:0.12] dark:[--heat:0.35]" onPointerLeave={onFocus ? () => onFocus(null) : undefined}>
      {items.map((it, i) => (
        <li
          key={it.id ?? it.category}
          onPointerEnter={onFocus ? () => onFocus(it.id ?? it.category) : undefined}
          className={`rounded-xl border p-4 transition-[border-color,box-shadow] ${focus && focus === (it.id ?? it.category) ? 'border-primary-300/70 shadow-[0_0_0_1px_rgb(var(--c-violet)/0.35)]' : 'border-fg/8'}`}
          style={{ background: cellColor(it.dollarImpact) }}
        >
          <p className="text-xs font-medium text-text-primary mb-1 flex items-start gap-1.5">
            {numbered && (
              // The tile's number over the picture beside it (decoration: the name and figure are here in words).
              <span aria-hidden="true" className="mt-px flex size-4 flex-shrink-0 items-center justify-center rounded-full border border-fg/25 font-mono-data text-[0.5625rem] font-semibold leading-none">
                {i + 1}
              </span>
            )}
            <span className="min-w-0">{it.category}</span>
          </p>
          <p className={`font-mono-data text-sm font-bold ${it.dollarImpact > 0 ? 'text-gain' : it.dollarImpact < 0 ? 'text-loss' : 'text-text-muted'}`}>
            {formatUSD(it.dollarImpact, { signed: true, suffix: '/mo' })}
          </p>
          {it.dollarImpact !== 0 && (
            <div className="mt-2 h-1 rounded-full bg-fg/8 overflow-hidden" aria-hidden>
              <div
                className={`h-full rounded-full ${it.dollarImpact > 0 ? 'bg-gain-fill' : 'bg-loss-fill'}`}
                style={{ width: `${Math.max(4, intensityOf(it.dollarImpact) * 100)}%` }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
