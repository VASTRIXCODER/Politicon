import { Building2, Globe, Wallet, type LucideIcon } from 'lucide-react';
import { formatUSD } from '@/lib/format';

// HTML-only charts: every value is printed as text, so they need no table
// view, and they don't pull recharts into the page bundle. Being HTML, they
// colour themselves with token classes and CSS variables, so they follow the
// theme without a palette hook.

type Direction = 'positive' | 'negative' | 'neutral';

// ===========================================================================
// Economic transmission waterfall — macro → corporate → personal
// Card-based cascading layout: each tier shows its label, magnitude bar,
// sublabel value, and an optional plain-English detail line.
// ===========================================================================
const WATERFALL_ICONS: LucideIcon[] = [Globe, Building2, Wallet];

export function TransmissionWaterfall(
  { levels }:
  { levels: { label: string; sublabel: string; magnitude: number; direction: Direction; detail?: string }[] }
) {
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
    d === 'positive' ? 'text-gain' : d === 'negative' ? 'text-loss' : 'text-secondary';

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

              {/* Magnitude bar (relative size only; the value is printed above) */}
              <div className="h-2.5 rounded-full bg-fg/8 overflow-hidden mb-3" aria-hidden>
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${barFor(lvl.direction)}`}
                  style={{ width: `${Math.max(6, Math.min(100, lvl.magnitude))}%` }}
                />
              </div>

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
  { items }:
  { items: { category: string; dollarImpact: number; direction: Direction }[] }
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
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 [--heat:0.12] dark:[--heat:0.35]">
      {items.map((it) => (
        <li
          key={it.category}
          className="rounded-xl border border-fg/8 p-4 transition-all"
          style={{ background: cellColor(it.dollarImpact) }}
        >
          <p className="text-xs font-medium text-text-primary mb-1">{it.category}</p>
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
