'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, AreaChart, Area, LineChart, Line, Legend, ReferenceLine,
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
