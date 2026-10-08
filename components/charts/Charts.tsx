'use client';

import { useId, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { BarChart3, Table2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, AreaChart, Area, LineChart, Line, Legend, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { formatAxisUSD, formatUSD } from '@/lib/format';
import { CHART, seriesColor } from './palette';

// Recharts is heavy: pages load these through components/charts/LazyCharts,
// which splits them into their own chunk. Colours live in ./palette and the
// HTML-only charts in ./StaticCharts, so neither pulls recharts in.

const fmtAxis = formatAxisUSD;
const fmtMoney = (n: number) => formatUSD(n, { signed: true });
const fmtYearly = (n: number) => formatUSD(n, { signed: true, suffix: '/yr' });

/** Recharts animations are JS-driven, so they ignore the CSS reduced-motion rule. */
function useChartAnimation(): boolean {
  return !useReducedMotion();
}

// ---------------------------------------------------------------------------
// Figure: chart + caption + "View as table"
// ---------------------------------------------------------------------------
interface TableData {
  /** Column headings; the first column holds the row headers. */
  columns: { label: string; numeric?: boolean }[];
  /** Pre-formatted cells, one array per row. */
  rows: string[][];
}

/** "A, B and C" */
function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The `n` largest items by magnitude as "Label value" phrases, noting how many more the table holds. */
function largest<T>(items: T[], n: number, size: (_t: T) => number, phrase: (_t: T) => string): string {
  const sorted = [...items].sort((a, b) => Math.abs(size(b)) - Math.abs(size(a)));
  const rest = sorted.length - n;
  return `${listJoin(sorted.slice(0, n).map(phrase))}${rest > 0 ? ` (${rest} more in the table)` : ''}`;
}

/**
 * Wraps a chart in a <figure>. The caption states the key numbers in words, so
 * nobody has to hover to read them, and the toggle swaps the chart for a data
 * table with every value. Bar, line and area charts also have Recharts'
 * accessibilityLayer, so keyboard users can step through points with the
 * arrow keys. Recharts only supports that for horizontal layouts, so the donut
 * and radar are plain role="img" graphics (caption + table carry the data)
 * rather than focusable widgets that ignore every key.
 */
function ChartFigure({ title, summary, table, height, children }: {
  title: string; summary: string; table: TableData; height: number; children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const viewId = useId();
  return (
    <figure>
      <div id={viewId}>
        {asTable ? <DataTable title={title} table={table} /> : <div style={{ width: '100%', height }}>{children}</div>}
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <figcaption className="flex-1 min-w-0 text-meta text-text-muted">
          <span className="sr-only">{title}. </span>{summary}
        </figcaption>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-controls={viewId}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-meta font-medium text-primary-300 hover:text-text-primary hover:bg-white/5 transition-colors"
        >
          {asTable ? <BarChart3 className="w-3.5 h-3.5" aria-hidden /> : <Table2 className="w-3.5 h-3.5" aria-hidden />}
          {asTable ? 'View as chart' : 'View as table'}
          <span className="sr-only">: {title}</span>
        </button>
      </div>
    </figure>
  );
}

function DataTable({ title, table }: { title: string; table: TableData }) {
  return (
    // Focusable so keyboard users can scroll a table wider than the card.
    <div className="overflow-x-auto rounded-xl border border-white/8" role="region" aria-label={`${title} (table)`} tabIndex={0}>
      <table className="w-full text-xs">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b border-white/8 bg-white/3">
            {table.columns.map((c) => (
              <th key={c.label} scope="col" className={`px-3 py-2 font-medium text-text-muted whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-white/6 last:border-0">
              {row.map((cell, ci) => ci === 0 ? (
                <th key={ci} scope="row" className="px-3 py-2 text-left font-normal text-text-primary">{cell}</th>
              ) : (
                <td key={ci} className={`px-3 py-2 text-text-primary ${table.columns[ci]?.numeric ? 'text-right font-mono-data whitespace-nowrap' : ''}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
interface TooltipEntry { name?: string; value?: number; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }
function GlassTooltip({ active, payload, label, format = fmtMoney, accessibilityLayer }: {
  active?: boolean; payload?: TooltipEntry[]; label?: string | number; format?: (_n: number) => string; accessibilityLayer?: boolean;
}) {
  const live = accessibilityLayer ? { role: 'status', 'aria-live': 'polite' as const } : {};
  if (!active || !payload || payload.length === 0) {
    // With the accessibility layer the live region stays mounted (empty) while
    // inactive, so the first point a keyboard user lands on is read as a change.
    // `visibility: visible` keeps it in the accessibility tree inside Recharts'
    // hidden tooltip wrapper.
    return accessibilityLayer ? <div {...live} className="sr-only" style={{ visibility: 'visible' }} /> : null;
  }
  return (
    <div
      // With the accessibility layer, arrow-key moves are read out from here.
      {...live}
      className="rounded-xl border border-white/12 bg-[#0E0A1F]/95 px-3.5 py-2.5 shadow-xl backdrop-blur-xl"
    >
      {label !== undefined && label !== '' && (
        <p className="text-meta font-mono-data uppercase tracking-wider text-text-muted mb-1.5">{label}</p>
      )}
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} aria-hidden />
          <span className="text-text-muted">{e.name}</span>
          <span className="font-mono-data font-semibold text-text-primary ml-auto">
            {/* A slice can carry its signed amount when its size is drawn from the absolute value. */}
            {format(typeof e.payload?.signed === 'number' ? e.payload.signed : e.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

const TICK_FONT = 12;
const axisProps = { stroke: CHART.axis, tick: { fill: CHART.axis, fontSize: TICK_FONT }, tickLine: false } as const;
const legendLabel = (v: ReactNode) => <span style={{ color: CHART.axis, fontSize: TICK_FONT }}>{v}</span>;

// ===========================================================================
// 1. Category impact — vertical bars colored by sign, animated on load
// ===========================================================================
export function CategoryImpactBar({ data, height = 300, title = 'Annual impact by category' }: {
  data: { name: string; value: number }[]; height?: number; title?: string;
}) {
  const animate = useChartAnimation();
  if (data.length === 0) return <EmptyChart height={height} />;
  const summary = `Largest effects: ${largest(data, 3, (d) => d.value, (d) => `${d.name} ${fmtYearly(d.value)}`)}.`;
  const table: TableData = {
    columns: [{ label: 'Category' }, { label: 'Annual impact', numeric: true }],
    rows: data.map((d) => [d.name, fmtYearly(d.value)]),
  };
  return (
    <ChartFigure title={title} summary={summary} table={table} height={height}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} accessibilityLayer title={title} desc={summary}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} interval={0} angle={-12} textAnchor="end" height={50} />
          <YAxis {...axisProps} tickFormatter={fmtAxis} width={56} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<GlassTooltip />} isAnimationActive={animate} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          <Bar dataKey="value" name="Impact" radius={[6, 6, 0, 0]} isAnimationActive={animate} animationDuration={1100} animationBegin={150}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? CHART.emerald : CHART.red} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

// ===========================================================================
// 2. Donut — proportion of impact by category (absolute values)
// ===========================================================================
export function ImpactDonut({ data, height = 300, title = 'Share of impact by category' }: {
  data: { name: string; value: number; color: string }[]; height?: number; title?: string;
}) {
  const animate = useChartAnimation();
  const cleaned = data.filter((d) => Math.abs(d.value) > 0).map((d) => ({ ...d, value: Math.abs(d.value), signed: d.value }));
  if (cleaned.length === 0) return <EmptyChart height={height} />;
  const total = cleaned.reduce((s, d) => s + d.value, 0) || 1;
  const share = (v: number) => `${Math.round((v / total) * 100)}%`;
  const summary = `Biggest shares: ${largest(cleaned, 3, (d) => d.value, (d) => `${d.name} ${share(d.value)} (${fmtYearly(d.signed)})`)}.`;
  const table: TableData = {
    columns: [{ label: 'Category' }, { label: 'Annual impact', numeric: true }, { label: 'Share', numeric: true }],
    rows: cleaned.map((d) => [d.name, fmtYearly(d.signed), share(d.value)]),
  };
  return (
    <ChartFigure title={title} summary={summary} table={table} height={height}>
      <ResponsiveContainer>
        <PieChart role="img" title={title} desc={summary}>
          <Pie
            data={cleaned}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="82%"
            paddingAngle={3}
            stroke="none"
            isAnimationActive={animate}
            animationDuration={1000}
          >
            {cleaned.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip content={<GlassTooltip />} isAnimationActive={animate} />
          <Legend verticalAlign="bottom" iconType="circle" formatter={legendLabel} />
        </PieChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

// ===========================================================================
// 3. Monthly timeline — cumulative impact across year one (area)
// ===========================================================================
export function MonthlyTimeline({ data, height = 300, title = 'Cumulative impact, month by month' }: {
  data: { month: number; impact: number }[]; height?: number; title?: string;
}) {
  const animate = useChartAnimation();
  // Unique per chart, and safe inside url(#…) whatever characters useId produces.
  const fillId = `timeline-fill-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  if (data.length === 0) return <EmptyChart height={height} />;
  const first = data[0];
  const last = data[data.length - 1];
  const positive = last.impact >= 0;
  const stroke = positive ? CHART.emerald : CHART.red;
  const rows = data.map((d) => ({ name: `M${d.month}`, impact: d.impact }));
  const summary = data.length === 1
    ? `${fmtMoney(last.impact)} in month ${last.month}.`
    : `Running total of ${fmtMoney(first.impact)} after month ${first.month}, reaching ${fmtMoney(last.impact)} by month ${last.month}.`;
  const table: TableData = {
    columns: [{ label: 'Month' }, { label: 'Running total', numeric: true }],
    rows: data.map((d) => [`Month ${d.month}`, fmtMoney(d.impact)]),
  };
  return (
    <ChartFigure title={title} summary={summary} table={table} height={height}>
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} accessibilityLayer title={title} desc={summary}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={fmtAxis} width={56} />
          <Tooltip content={<GlassTooltip />} isAnimationActive={animate} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          <Area type="monotone" dataKey="impact" name="Cumulative" stroke={stroke} strokeWidth={2.5} fill={`url(#${fillId})`} isAnimationActive={animate} animationDuration={1300} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

// ===========================================================================
// 4. Projection bars — 1 / 3 / 5 year cumulative side by side
// ===========================================================================
export function ProjectionBars({ year1, year3, year5, height = 280, title = 'Cumulative impact after 1, 3 and 5 years' }: {
  year1: number; year3: number; year5: number; height?: number; title?: string;
}) {
  const animate = useChartAnimation();
  const data = [
    { name: '1 Year', value: year1 },
    { name: '3 Years', value: year3 },
    { name: '5 Years', value: year5 },
  ];
  const summary = `${listJoin(data.map((d) => `${fmtMoney(d.value)} after ${d.name.toLowerCase()}`))}.`;
  const table: TableData = {
    columns: [{ label: 'Period' }, { label: 'Cumulative impact', numeric: true }],
    rows: data.map((d) => [d.name, fmtMoney(d.value)]),
  };
  return (
    <ChartFigure title={title} summary={summary} table={table} height={height}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} accessibilityLayer title={title} desc={summary}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={fmtAxis} width={56} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<GlassTooltip />} isAnimationActive={animate} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          <Bar dataKey="value" name="Cumulative" radius={[6, 6, 0, 0]} isAnimationActive={animate} animationDuration={1100}>
            {data.map((d, i) => <Cell key={i} fill={d.value >= 0 ? CHART.gold : CHART.red} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

// ===========================================================================
// 5. Before / after grouped bars (e.g. effective tax rate)
// ===========================================================================
export function BeforeAfterBar({ items, unit = '%', height = 260, title = 'Before and after' }: {
  items: { label: string; before: number; after: number }[]; unit?: string; height?: number; title?: string;
}) {
  const animate = useChartAnimation();
  if (items.length === 0) return <EmptyChart height={height} />;
  const fmt = (v: number) => (unit === '%' ? `${v}%` : formatUSD(v));
  const summary = `${items.map((i) => `${i.label}: ${fmt(i.before)} before, ${fmt(i.after)} after`).join('; ')}.`;
  const table: TableData = {
    columns: [{ label: 'Measure' }, { label: 'Before', numeric: true }, { label: 'After', numeric: true }],
    rows: items.map((i) => [i.label, fmt(i.before), fmt(i.after)]),
  };
  return (
    <ChartFigure title={title} summary={summary} table={table} height={height}>
      <ResponsiveContainer>
        <BarChart data={items} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} accessibilityLayer title={title} desc={summary}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => (unit === '%' ? `${v}%` : fmtAxis(v))} width={48} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<GlassTooltip format={unit === '%' ? (v) => `${v.toFixed(1)}%` : fmtMoney} />} isAnimationActive={animate} />
          <Legend iconType="circle" formatter={legendLabel} />
          <Bar dataKey="before" name="Before" fill="#6B7280" radius={[5, 5, 0, 0]} isAnimationActive={animate} animationDuration={900} />
          <Bar dataKey="after" name="After" fill={CHART.primary} radius={[5, 5, 0, 0]} isAnimationActive={animate} animationDuration={900} animationBegin={200} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

// ===========================================================================
// 6. Cumulative stacked bar — combined category impacts, stacked by policy
// ===========================================================================
export function CumulativeStackedBar({ data, series, height = 320, title = 'Combined impact by category' }: {
  data: Record<string, number | string>[]; series: { key: string; name: string }[]; height?: number; title?: string;
}) {
  const animate = useChartAnimation();
  if (data.length === 0 || series.length === 0) return <EmptyChart height={height} />;
  const categories = data.map((row) => {
    const parts = series
      .map((s) => ({ name: s.name, value: Number(row[s.key]) || 0 }))
      .filter((p) => p.value !== 0);
    return { name: String(row.category), total: parts.reduce((t, p) => t + p.value, 0), parts };
  });
  const summary = `Combined by category: ${largest(categories, 3, (c) => c.total, (c) => `${c.name} ${fmtYearly(c.total)}`)}.`;
  const table: TableData = {
    columns: [{ label: 'Category' }, { label: 'Combined per year', numeric: true }, { label: 'Policies' }],
    rows: categories.map((c) => [c.name, fmtYearly(c.total), c.parts.map((p) => `${p.name} (${fmtMoney(p.value)})`).join('; ')]),
  };
  return (
    <ChartFigure title={title} summary={summary} table={table} height={height}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} accessibilityLayer title={title} desc={summary}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="category" {...axisProps} interval={0} angle={-12} textAnchor="end" height={50} />
          <YAxis {...axisProps} tickFormatter={fmtAxis} width={56} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<GlassTooltip />} isAnimationActive={animate} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={seriesColor(i)} isAnimationActive={animate} animationDuration={1000} radius={i === series.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

// ===========================================================================
// 7. Cumulative projection lines — one line per policy + a total line
// ===========================================================================
export function CumulativeProjectionLines({ data, series, height = 340, title = 'Projection over 1, 3 and 5 years' }: {
  data: Record<string, number | string>[]; series: { key: string; name: string; total?: boolean }[]; height?: number; title?: string;
}) {
  const animate = useChartAnimation();
  if (data.length === 0 || series.length === 0) return <EmptyChart height={height} />;
  const value = (row: Record<string, number | string>, key: string) => Number(row[key]) || 0;
  const total = series.find((s) => s.total);
  const summary = total
    ? `Total: ${listJoin(data.map((row) => `${fmtMoney(value(row, total.key))} after ${String(row.name).toLowerCase()}`))}.`
    : `${series.length} ${series.length === 1 ? 'policy' : 'policies'} projected over ${listJoin(data.map((row) => String(row.name).toLowerCase()))}.`;
  const table: TableData = {
    columns: [{ label: 'Policy' }, ...data.map((row) => ({ label: String(row.name), numeric: true }))],
    rows: series.map((s) => [s.name, ...data.map((row) => fmtMoney(value(row, s.key)))]),
  };
  return (
    <ChartFigure title={title} summary={summary} table={table} height={height}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }} accessibilityLayer title={title} desc={summary}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={fmtAxis} width={56} />
          <Tooltip content={<GlassTooltip />} isAnimationActive={animate} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.total ? CHART.gold : seriesColor(i)}
              strokeWidth={s.total ? 3.5 : 2}
              dot={{ r: s.total ? 4 : 2.5, strokeWidth: 0, fill: s.total ? CHART.gold : seriesColor(i) }}
              isAnimationActive={animate}
              animationDuration={1200}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div style={{ height }} className="flex items-center justify-center">
      <p className="text-xs text-text-muted">No data to chart yet.</p>
    </div>
  );
}

// ===========================================================================
// 8. Vulnerability radar — six dimensions scored 0-100 (higher = more at risk)
// ===========================================================================
export function VulnerabilityRadar({ data, height = 320, title = 'Vulnerability by area' }: {
  data: { dimension: string; score: number }[]; height?: number; title?: string;
}) {
  const animate = useChartAnimation();
  if (!data || data.length === 0) return <EmptyChart height={height} />;
  const score = (n: number) => `${Math.round(n)}/100`;
  const summary = `Most pressure: ${largest(data, 2, (d) => d.score, (d) => `${d.dimension} ${score(d.score)}`)}. Higher scores mean more pressure.`;
  const table: TableData = {
    columns: [{ label: 'Area' }, { label: 'Score (0–100)', numeric: true }],
    rows: data.map((d) => [d.dimension, score(d.score)]),
  };
  return (
    <ChartFigure title={title} summary={summary} table={table} height={height}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="70%" role="img" title={title} desc={summary}>
          <PolarGrid stroke={CHART.grid} />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: CHART.axis, fontSize: TICK_FONT }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fill: CHART.axis, fontSize: TICK_FONT }} axisLine={false} />
          <Radar name="Pressure" dataKey="score" stroke={CHART.primary} fill={CHART.primary} fillOpacity={0.35} isAnimationActive={animate} animationDuration={900} />
          <Tooltip content={<GlassTooltip format={score} />} isAnimationActive={animate} />
        </RadarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
