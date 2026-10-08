import { Building2, Globe, Wallet, type LucideIcon } from 'lucide-react';
import { formatUSD } from '@/lib/format';
import { CHART } from './palette';

// HTML-only charts: every value is printed as text, so they need no table
// view, and they don't pull recharts into the page bundle.

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
    d === 'positive' ? 'border-emerald-500/30' : d === 'negative' ? 'border-red-500/30' : 'border-white/10';
  const bgFor = (d: Direction) =>
    d === 'positive' ? 'rgba(16,185,129,0.08)' : d === 'negative' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)';
  const barFor = (d: Direction) =>
    d === 'positive' ? CHART.emerald : d === 'negative' ? CHART.red : CHART.secondary;
  const valueColor = (d: Direction) =>
    d === 'positive' ? 'text-emerald-400' : d === 'negative' ? 'text-red-400' : 'text-secondary';

  return (
    <ol className="space-y-0">
      {levels.map((lvl, i) => {
        const Icon = WATERFALL_ICONS[i] ?? Wallet;
        return (
          <li key={lvl.label}>
            {/* Card */}
            <div
              className={`rounded-2xl border p-5 ${borderFor(lvl.direction)}`}
              style={{ background: bgFor(lvl.direction), marginLeft: `${i * 5}%` }}
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
              <div className="h-2.5 rounded-full bg-white/8 overflow-hidden mb-3" aria-hidden>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.max(6, Math.min(100, lvl.magnitude))}%`,
                    background: barFor(lvl.direction),
                  }}
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
                  <div className="w-px h-3 bg-white/15" />
                  <svg width="10" height="6" viewBox="0 0 10 6" className="text-white/20">
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
// Spending heatmap — categories color-coded green (saves) → red (costs more)
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
  // The tint tops out at 0.35 alpha so the text stays AA on every cell (at full
  // intensity: value about 6.4:1, label about 8.8:1). The bar carries the size.
  const cellColor = (v: number) => {
    const alpha = 0.1 + intensityOf(v) * 0.25;
    if (v > 0) return `rgba(16,185,129,${alpha})`;   // emerald — savings
    if (v < 0) return `rgba(239,68,68,${alpha})`;    // red — costs more
    return 'rgba(255,255,255,0.06)';
  };
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((it) => (
        <li
          key={it.category}
          className="rounded-xl border border-white/8 p-4 transition-all"
          style={{ background: cellColor(it.dollarImpact) }}
        >
          <p className="text-xs font-medium text-text-primary mb-1">{it.category}</p>
          <p className={`font-mono-data text-sm font-bold ${it.dollarImpact > 0 ? 'text-emerald-300' : it.dollarImpact < 0 ? 'text-red-300' : 'text-text-muted'}`}>
            {formatUSD(it.dollarImpact, { signed: true, suffix: '/mo' })}
          </p>
          {it.dollarImpact !== 0 && (
            <div className="mt-2 h-1 rounded-full bg-white/8 overflow-hidden" aria-hidden>
              <div
                className={`h-full rounded-full ${it.dollarImpact > 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                style={{ width: `${Math.max(4, intensityOf(it.dollarImpact) * 100)}%` }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
