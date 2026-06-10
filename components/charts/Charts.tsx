'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, AreaChart, Area, LineChart, Line, Legend, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';

// ---------------------------------------------------------------------------
// Shared palette + helpers (matches the Politicon design system)
// ---------------------------------------------------------------------------
export const CHART = {
  primary: '#7B61FF',
  secondary: '#00D4FF',
  gold: '#F5C842',
  emerald: '#10B981',
  red: '#EF4444',
  grid: 'rgba(255,255,255,0.06)',
  axis: '#8B87A8',
};

export const CATEGORY_COLOR: Record<string, string> = {
  taxes: '#7B61FF',
  housing: '#F5C842',
  healthcare: '#00D4FF',
  employment: '#8B5CF6',
  retirement: '#EC4899',
  education: '#10B981',
  energy: '#F97316',
  other: '#6B7280',
};

const PALETTE = ['#7B61FF', '#00D4FF', '#F5C842', '#10B981', '#EC4899', '#F97316', '#8B5CF6', '#06B6D4', '#FB7185', '#A3E635'];
export const seriesColor = (i: number) => PALETTE[i % PALETTE.length];

const fmtAxis = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000) return `${n < 0 ? '-' : ''}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return `${n < 0 ? '-' : ''}$${a}`;
};
const fmtMoney = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(Math.round(n)).toLocaleString()}`;

interface TooltipEntry { name?: string; value?: number; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }
function GlassTooltip({ active, payload, label, unit = '$' }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number; unit?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/12 bg-[#0E0A1F]/95 px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
      {label !== undefined && label !== '' && (
        <p className="text-[10px] font-mono-data uppercase tracking-wider text-text-muted mb-1.5">{label}</p>
      )}
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
          <span className="text-text-muted">{e.name}</span>
          <span className="font-mono-data font-semibold text-text-primary ml-auto">
            {unit === '%' ? `${(e.value ?? 0).toFixed(1)}%` : fmtMoney(e.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

const axisProps = { stroke: CHART.axis, tick: { fill: CHART.axis, fontSize: 11 }, tickLine: false } as const;

// ===========================================================================
// 1. Category impact — vertical bars colored by sign, animated on load
// ===========================================================================
export function CategoryImpactBar({ data, height = 300 }: { data: { name: string; value: number }[]; height?: number }) {
  if (data.length === 0) return <EmptyChart height={height} />;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} interval={0} angle={-12} textAnchor="end" height={50} />
          <YAxis {...axisProps} tickFormatter={fmtAxis} width={56} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<GlassTooltip />} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          <Bar dataKey="value" name="Impact" radius={[6, 6, 0, 0]} animationDuration={1100} animationBegin={150}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? CHART.emerald : CHART.red} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// 2. Donut — proportion of impact by category (absolute values)
// ===========================================================================
export function ImpactDonut({ data, height = 300 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const cleaned = data.filter((d) => Math.abs(d.value) > 0).map((d) => ({ ...d, value: Math.abs(d.value) }));
  if (cleaned.length === 0) return <EmptyChart height={height} />;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={cleaned}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="82%"
            paddingAngle={3}
            stroke="none"
            animationDuration={1000}
          >
            {cleaned.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip content={<GlassTooltip />} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            formatter={(v) => <span style={{ color: CHART.axis, fontSize: 11 }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// 3. Monthly timeline — cumulative impact across year one (area)
// ===========================================================================
export function MonthlyTimeline({ data, height = 300 }: { data: { month: number; impact: number }[]; height?: number }) {
  if (data.length === 0) return <EmptyChart height={height} />;
  const positive = data[data.length - 1].impact >= 0;
  const stroke = positive ? CHART.emerald : CHART.red;
  const rows = data.map((d) => ({ name: `M${d.month}`, impact: d.impact }));
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="timelineFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={fmtAxis} width={56} />
          <Tooltip content={<GlassTooltip />} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          <Area type="monotone" dataKey="impact" name="Cumulative" stroke={stroke} strokeWidth={2.5} fill="url(#timelineFill)" animationDuration={1300} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// 4. Projection bars — 1 / 3 / 5 year cumulative side by side
// ===========================================================================
export function ProjectionBars({ year1, year3, year5, height = 280 }: { year1: number; year3: number; year5: number; height?: number }) {
  const data = [
    { name: '1 Year', value: year1 },
    { name: '3 Years', value: year3 },
    { name: '5 Years', value: year5 },
  ];
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={fmtAxis} width={56} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<GlassTooltip />} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          <Bar dataKey="value" name="Cumulative" radius={[6, 6, 0, 0]} animationDuration={1100}>
            {data.map((d, i) => <Cell key={i} fill={d.value >= 0 ? CHART.gold : CHART.red} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// 5. Before / after grouped bars (e.g. effective tax rate)
// ===========================================================================
export function BeforeAfterBar({ items, unit = '%', height = 260 }: { items: { label: string; before: number; after: number }[]; unit?: string; height?: number }) {
  if (items.length === 0) return <EmptyChart height={height} />;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={items} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => (unit === '%' ? `${v}%` : fmtAxis(v))} width={48} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<GlassTooltip unit={unit} />} />
          <Legend iconType="circle" formatter={(v) => <span style={{ color: CHART.axis, fontSize: 11 }}>{v}</span>} />
          <Bar dataKey="before" name="Before" fill="#6B7280" radius={[5, 5, 0, 0]} animationDuration={900} />
          <Bar dataKey="after" name="After" fill={CHART.primary} radius={[5, 5, 0, 0]} animationDuration={900} animationBegin={200} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// 6. Cumulative stacked bar — combined category impacts, stacked by policy
// ===========================================================================
export function CumulativeStackedBar(
  { data, series, height = 320 }:
  { data: Record<string, number | string>[]; series: { key: string; name: string }[]; height?: number }
) {
  if (data.length === 0 || series.length === 0) return <EmptyChart height={height} />;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="category" {...axisProps} interval={0} angle={-12} textAnchor="end" height={50} />
          <YAxis {...axisProps} tickFormatter={fmtAxis} width={56} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<GlassTooltip />} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={seriesColor(i)} animationDuration={1000} radius={i === series.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// 7. Cumulative projection lines — one line per policy + a total line
// ===========================================================================
export function CumulativeProjectionLines(
  { data, series, height = 340 }:
  { data: Record<string, number | string>[]; series: { key: string; name: string; total?: boolean }[]; height?: number }
) {
  if (data.length === 0 || series.length === 0) return <EmptyChart height={height} />;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={fmtAxis} width={56} />
          <Tooltip content={<GlassTooltip />} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.total ? CHART.gold : seriesColor(i)}
              strokeWidth={s.total ? 3.5 : 2}
              strokeDasharray={s.total ? undefined : '0'}
              dot={{ r: s.total ? 4 : 2.5, strokeWidth: 0, fill: s.total ? CHART.gold : seriesColor(i) }}
              animationDuration={1200}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
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
// 8. Economic transmission waterfall — macro → corporate → personal
// Card-based cascading layout: each tier shows its label, magnitude bar,
// sublabel value, and an optional plain-English detail line.
// ===========================================================================
const WATERFALL_ICONS = ['🌐', '🏢', '💰'];

export function TransmissionWaterfall(
  { levels }:
  { levels: { label: string; sublabel: string; magnitude: number; direction: 'positive' | 'negative' | 'neutral'; detail?: string }[] }
) {
  if (!levels || levels.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-xs text-text-muted">No data to chart yet.</p>
      </div>
    );
  }

  const borderFor = (d: string) =>
    d === 'positive' ? 'border-emerald-500/30' : d === 'negative' ? 'border-red-500/30' : 'border-white/10';
  const bgFor = (d: string) =>
    d === 'positive' ? 'rgba(16,185,129,0.08)' : d === 'negative' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)';
  const barFor = (d: string) =>
    d === 'positive' ? CHART.emerald : d === 'negative' ? CHART.red : CHART.secondary;
  const valueColor = (d: string) =>
    d === 'positive' ? 'text-emerald-400' : d === 'negative' ? 'text-red-400' : 'text-secondary';

  return (
    <div className="space-y-0">
      {levels.map((lvl, i) => (
        <div key={lvl.label}>
          {/* Card */}
          <div
            className={`rounded-2xl border p-5 ${borderFor(lvl.direction)}`}
            style={{ background: bgFor(lvl.direction), marginLeft: `${i * 5}%` }}
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl leading-none">{WATERFALL_ICONS[i] ?? '📊'}</span>
                <span className="text-sm font-semibold text-text-primary">{lvl.label}</span>
              </div>
              <span className={`font-mono-data text-sm font-bold ${valueColor(lvl.direction)}`}>
                {lvl.sublabel}
              </span>
            </div>

            {/* Magnitude bar */}
            <div className="h-2.5 rounded-full bg-white/8 overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.max(6, Math.min(100, lvl.magnitude))}%`,
                  background: barFor(lvl.direction),
                  animationDelay: `${i * 150}ms`,
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
            >
              <div className="flex flex-col items-center">
                <div className="w-px h-3 bg-white/15" />
                <svg width="10" height="6" viewBox="0 0 10 6" className="text-white/20">
                  <path d="M0 0L5 6L10 0" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// 9. Vulnerability radar — six dimensions scored 0-100 (higher = more at risk)
// ===========================================================================
export function VulnerabilityRadar(
  { data, height = 320 }:
  { data: { dimension: string; score: number }[]; height?: number }
) {
  if (!data || data.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center"><p className="text-xs text-text-muted">No data to chart yet.</p></div>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke={CHART.grid} />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: CHART.axis, fontSize: 10 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fill: CHART.axis, fontSize: 9 }} axisLine={false} />
          <Radar name="Risk" dataKey="score" stroke={CHART.primary} fill={CHART.primary} fillOpacity={0.35} animationDuration={900} />
          <Tooltip content={<GlassTooltip unit="%" />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// 10. Spending heatmap — categories color-coded green (saves) → red (costs more)
// ===========================================================================
export function SpendingHeatmap(
  { items }:
  { items: { category: string; dollarImpact: number; direction: 'positive' | 'negative' | 'neutral' }[] }
) {
  if (!items || items.length === 0) {
    return <div className="flex items-center justify-center py-10"><p className="text-xs text-text-muted">No data to chart yet.</p></div>;
  }
  const max = Math.max(...items.map((i) => Math.abs(i.dollarImpact)), 1);
  const cellColor = (v: number) => {
    const intensity = Math.min(1, Math.abs(v) / max);
    if (v > 0) return `rgba(16,185,129,${0.15 + intensity * 0.55})`;   // emerald — savings
    if (v < 0) return `rgba(239,68,68,${0.15 + intensity * 0.55})`;    // red — costs more
    return 'rgba(255,255,255,0.06)';
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((it) => (
        <div
          key={it.category}
          className="rounded-xl border border-white/8 p-4 transition-all"
          style={{ background: cellColor(it.dollarImpact) }}
        >
          <p className="text-xs font-medium text-text-primary mb-1">{it.category}</p>
          <p className={`font-mono-data text-sm font-bold ${it.dollarImpact > 0 ? 'text-emerald-300' : it.dollarImpact < 0 ? 'text-red-300' : 'text-text-muted'}`}>
            {it.dollarImpact >= 0 ? '+' : '-'}${Math.abs(Math.round(it.dollarImpact)).toLocaleString()}/mo
          </p>
        </div>
      ))}
    </div>
  );
}
