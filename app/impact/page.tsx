'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { m } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Search, ChevronDown, ArrowUpDown, Sparkles, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import CountUp from '@/components/ui/CountUp';
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';
import { apiFetch } from '@/lib/api';
import ViewFullImpactButton from '@/components/ViewFullImpactButton';
import AiDisclaimer from '@/components/ui/AiDisclaimer';
import { formatUSD, impactTone } from '@/lib/format';
// Code-split: recharts loads only when the Cumulative tab is opened.
import { CumulativeStackedBar, CumulativeProjectionLines } from '@/components/charts/LazyCharts';

/** One saved analysis, with just the parts of the structured result this page shows. */
interface PolicyAnalysisRow {
  id: string;
  policy_id: string;
  policy_title: string;
  dollar_impact: number;
  category: string;
  created_at: string;
  summary: string | null;
  timeline: { year1?: number; year3?: number; year5?: number } | null;
  tradeoffs: { gains?: { label: string; value: number }[]; losses?: { label: string; value: number }[] } | null;
  recommendations: { step: string; priority?: string }[] | null;
  legacy: boolean | null;
  /** Present on every generated analysis; absent on placeholders for jobs still running. */
  analysis_title: string | null;
}

const ROW_COLUMNS =
  'id, policy_id, policy_title, category, created_at, dollar_impact:net_annual_impact, ' +
  'summary:analysis->>plainEnglishSummary, timeline:analysis->timeline, tradeoffs:analysis->tradeoffs, ' +
  'recommendations:analysis->recommendations, legacy:analysis->legacy, analysis_title:analysis->>policyTitle';

const signedUSD = (n: number) => formatUSD(n, { signed: true });

// Violet-tinted action: primary-300 text keeps it at AA contrast on the tint.
const TINT_BUTTON = 'bg-primary/20 hover:bg-primary/30 border-primary/20 text-primary-300';

type ImpactTab = 'individual' | 'cumulative';

const methodology = [
  {
    q: 'Where do the policies come from?',
    a: 'Federal bills and laws come from Congress.gov, the official source for legislation, and state bills from Open States, which tracks every state legislature. Each policy shows its latest official action and links to the record. If those sources are unavailable, a policy may be suggested by the AI instead and is clearly marked as not verified.',
  },
  {
    q: 'How are dollar amounts estimated?',
    a: "An AI model (Anthropic's Claude) reads the policy's official summary and status and applies them to the ranges in your profile: income bracket, state, filing status, housing, debts and dependents. It shows the assumptions it made. These are educational estimates, not a tax calculation or professional advice.",
  },
  {
    q: 'What does "net annual impact" mean?',
    a: 'The sum of the estimated gains and costs across the policies you have selected, expressed per year. Gains are positive; costs are negative.',
  },
  {
    q: 'How confident are these estimates?',
    a: 'Each analysis has a confidence score. Proposed bills are less certain than enacted laws, and estimates depend on details a bill may not specify yet. Check the official record, and talk to a qualified professional (for example a CPA or a free IRS VITA clinic) before making major decisions.',
  },
];

function SkeletonCard() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse backdrop-filter-none" aria-hidden>
      <div className="h-4 bg-white/10 rounded w-3/4 mb-3" />
      <div className="h-3 bg-white/10 rounded w-1/2" />
    </div>
  );
}

function AnalysisBody({ row, headingTag = 'h4' }: { row: PolicyAnalysisRow; headingTag?: 'h3' | 'h4' }) {
  const H = headingTag;
  const heading = 'text-xs font-mono-data font-bold text-primary-300 uppercase tracking-widest mb-2';
  const t = row.timeline;
  const gains = (row.tradeoffs?.gains || []).slice(0, 3);
  const losses = (row.tradeoffs?.losses || []).slice(0, 3);
  const recs = (row.recommendations || []).slice(0, 3);
  return (
    <div className="space-y-5">
      {row.summary && <p className="text-sm text-text-muted leading-relaxed">{row.summary}</p>}
      {row.legacy && (
        <p className="text-xs text-text-muted">This is a short summary from an earlier version. Open the full impact to generate the complete breakdown.</p>
      )}
      {t && (t.year1 !== undefined || t.year3 !== undefined || t.year5 !== undefined) && (
        <div>
          <H className={heading}>Projections</H>
          <dl className="grid grid-cols-3 gap-3">
            {([['1 year', t.year1], ['3 years', t.year3], ['5 years', t.year5]] as const).map(([label, v]) => (
              <div key={label} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                <dt className="text-meta text-text-muted">{label}</dt>
                <dd className={`font-mono-data text-sm font-semibold ${(v ?? 0) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{v === undefined ? '—' : signedUSD(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {(gains.length > 0 || losses.length > 0) && (
        <div>
          <H className={heading}>Trade-offs</H>
          <ul className="space-y-1.5 text-sm">
            {gains.map((g, i) => <li key={`g${i}`} className="flex justify-between gap-3"><span className="text-text-muted">{g.label}</span><span className="font-mono-data text-emerald-400">{signedUSD(Math.abs(g.value))}</span></li>)}
            {losses.map((l, i) => <li key={`l${i}`} className="flex justify-between gap-3"><span className="text-text-muted">{l.label}</span><span className="font-mono-data text-red-400">{signedUSD(-Math.abs(l.value))}</span></li>)}
          </ul>
        </div>
      )}
      {recs.length > 0 && (
        <div>
          <H className={heading}>Things to consider</H>
          <ul className="list-disc pl-5 space-y-1 text-sm text-text-muted">
            {recs.map((r, i) => <li key={i}>{r.step}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function ImpactContent() {
  const searchParams = useSearchParams();
  const policyParam = searchParams.get('policy');

  const [tab, setTab] = useState<ImpactTab>('individual');
  const [analyses, setAnalyses] = useState<PolicyAnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyAnalysisRow | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'impact' | 'date'>('impact');
  const [expandedMethod, setExpandedMethod] = useState<number | null>(null);
  const [cumSummary, setCumSummary] = useState('');
  const [cumLoading, setCumLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        try {
          const { data, error: dbErr } = await supabase
            .from('analyzed_policies')
            .select(ROW_COLUMNS)
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });
          if (dbErr) {
            console.error('Analyses load error:', dbErr);
          } else {
            // Placeholders for jobs still running (no analysis yet) aren't shown,
            // matching the dashboard totals.
            const rows = ((data || []) as unknown as PolicyAnalysisRow[]).filter(r => r.analysis_title || r.legacy);
            setAnalyses(rows);
            setCheckedIds(new Set(rows.map(r => r.id)));
            if (policyParam) {
              const found = rows.find(r => r.policy_id === policyParam);
              if (found) setSelectedPolicy(found);
            }
          }
        } catch (e) {
          console.error('Failed to load analyses:', e);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [policyParam]);

  const checkedAnalyses = useMemo(() => analyses.filter(a => checkedIds.has(a.id)), [analyses, checkedIds]);
  const netImpact = useMemo(() => checkedAnalyses.reduce((sum, a) => sum + (a.dollar_impact || 0), 0), [checkedAnalyses]);
  const checkedKey = useMemo(() => checkedAnalyses.map(a => a.id).sort().join(','), [checkedAnalyses]);

  const sortedAnalyses = useMemo(() => [...analyses].sort((a, b) => {
    if (sortBy === 'impact') return Math.abs(b.dollar_impact || 0) - Math.abs(a.dollar_impact || 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }), [analyses, sortBy]);

  // Stacked bar: category rows, one stack segment per selected policy
  const { stackedData, stackedSeries } = useMemo(() => {
    const series = checkedAnalyses.map(a => ({ key: a.policy_id, name: a.policy_title }));
    const byCat: Record<string, Record<string, number | string>> = {};
    for (const a of checkedAnalyses) {
      const cat = a.category || 'Other';
      if (!byCat[cat]) byCat[cat] = { category: cat };
      byCat[cat][a.policy_id] = Number(byCat[cat][a.policy_id] || 0) + (a.dollar_impact || 0);
    }
    return { stackedData: Object.values(byCat), stackedSeries: series };
  }, [checkedAnalyses]);

  // Projection lines: one line per policy + a total line, across 1/3/5 years
  const { projectionData, projectionSeries } = useMemo(() => {
    const series = [
      ...checkedAnalyses.map(a => ({ key: a.policy_id, name: a.policy_title })),
      { key: '__total', name: 'Total', total: true },
    ];
    const points = [1, 3, 5].map(yr => {
      const row: Record<string, number | string> = { name: `${yr} Year${yr > 1 ? 's' : ''}` };
      let total = 0;
      for (const a of checkedAnalyses) {
        const v = (a.dollar_impact || 0) * yr;
        row[a.policy_id] = v;
        total += v;
      }
      row['__total'] = total;
      return row;
    });
    return { projectionData: points, projectionSeries: series };
  }, [checkedAnalyses]);

  const ranked = useMemo(
    () => [...checkedAnalyses].sort((a, b) => Math.abs(b.dollar_impact || 0) - Math.abs(a.dollar_impact || 0)),
    [checkedAnalyses]
  );
  const totalAbs = useMemo(() => ranked.reduce((s, a) => s + Math.abs(a.dollar_impact || 0), 0) || 1, [ranked]);

  // AI cumulative summary (debounced on selection change)
  useEffect(() => {
    if (checkedAnalyses.length === 0) { setCumSummary(''); return; }
    let cancelled = false;
    setCumLoading(true);
    const policyIds = checkedAnalyses.map(a => a.policy_id).slice(0, 50);
    const t = setTimeout(async () => {
      const res = await apiFetch<{ summary: string }>('/api/cumulative-summary', { body: { policyIds } });
      if (cancelled) return;
      setCumSummary(res.ok ? res.data.summary || '' : '');
      setCumLoading(false);
    }, 700);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedKey]);

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <main id="main" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Impact Analysis</h1>
            <p className="text-text-muted">Your personalized policy financial impact breakdown.</p>
          </m.div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabList label="Impact views" className="glass rounded-2xl p-1 mb-8 w-fit">
              {(['individual', 'cumulative'] as const).map(t => (
                <Tab key={t} value={t} className="px-5 py-2.5 border border-transparent aria-selected:bg-primary/20 aria-selected:border-primary/20">
                  {t === 'individual' ? 'Individual Analyses' : 'Cumulative Analysis'}
                </Tab>
              ))}
            </TabList>

            {/* INDIVIDUAL TAB */}
            <TabPanel value="individual" className="space-y-6">
              {selectedPolicy && (
                <GlassCard className="rounded-3xl p-8 mb-4 border-primary/20 bg-primary/5">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <Badge variant="default">{selectedPolicy.category}</Badge>
                      <h2 className="font-display text-2xl font-bold text-text-primary mt-2">{selectedPolicy.policy_title}</h2>
                      <p className="text-xs text-text-muted mt-1">{new Date(selectedPolicy.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                      <div className={`font-mono-data text-2xl font-bold ${impactTone(selectedPolicy.dollar_impact || 0)}`}>
                        {formatUSD(selectedPolicy.dollar_impact || 0, { signed: true, suffix: '/yr' })}
                      </div>
                      <ViewFullImpactButton policyId={selectedPolicy.policy_id} policyTitle={selectedPolicy.policy_title} category={selectedPolicy.category} variant="chat" analyzed />
                    </div>
                  </div>
                  <AnalysisBody row={selectedPolicy} headingTag="h3" />
                </GlassCard>
              )}

              {loading ? (
                <div className="space-y-3" role="status">
                  <span className="sr-only">Loading your analyses…</span>
                  {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : analyses.length === 0 ? (
                <GlassCard className="rounded-3xl p-12 text-center">
                  <Search className="w-12 h-12 text-text-muted mx-auto mb-4" aria-hidden />
                  <h2 className="font-display text-xl font-semibold text-text-primary mb-2">No policies analyzed yet</h2>
                  <p className="text-sm text-text-muted mb-6 max-w-sm mx-auto">Browse the policy feed on your dashboard to get started.</p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <Button href="/dashboard" variant="ghost" size="sm" className={`px-5 py-3 ${TINT_BUTTON}`}>Go to Dashboard</Button>
                    <Button href="/advisor" variant="ghost" size="sm" className="px-5 py-3 font-normal text-text-muted hover:text-text-primary hover:border-white/16">Ask the Policy Guide</Button>
                  </div>
                </GlassCard>
              ) : (
                <GlassCard className="rounded-3xl p-7">
                  <div className="flex items-center justify-between gap-3 mb-6">
                    <h2 className="font-display text-xl font-semibold text-text-primary">All Analyzed Policies</h2>
                    <button type="button" onClick={() => setSortBy(s => s === 'impact' ? 'date' : 'impact')}
                      className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary bg-white/4 border border-white/8 hover:border-white/16 px-3 py-2 rounded-xl transition-all">
                      <ArrowUpDown className="w-3 h-3" aria-hidden /> Sort by {sortBy === 'impact' ? 'date' : 'impact'}
                    </button>
                  </div>
                  <ul className="space-y-3">
                    {sortedAnalyses.map(analysis => {
                      const isOpen = selectedPolicy?.id === analysis.id;
                      const value = analysis.dollar_impact || 0;
                      const panelId = `analysis-panel-${analysis.id}`;
                      return (
                        <li key={analysis.id}>
                          {/* The row toggles its summary; "View Full Impact" is a separate link beside it, not nested inside. */}
                          <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                            isOpen ? 'bg-primary/10 border-primary/20' : 'bg-white/4 border-white/8 hover:border-white/16'
                          }`}>
                            <button
                              type="button"
                              onClick={() => setSelectedPolicy(a => a?.id === analysis.id ? null : analysis)}
                              aria-expanded={isOpen}
                              aria-controls={isOpen ? panelId : undefined}
                              className="flex-1 min-w-0 flex items-center justify-between gap-4 text-left rounded-xl"
                            >
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium text-text-primary truncate">{analysis.policy_title}</span>
                                <span className="flex items-center gap-2 mt-1">
                                  <Badge variant="default">{analysis.category}</Badge>
                                  <span className="text-meta text-text-muted">{new Date(analysis.created_at).toLocaleDateString()}</span>
                                </span>
                              </span>
                              <span className={`font-mono-data text-sm font-bold flex-shrink-0 ${impactTone(value)}`}>
                                {formatUSD(value, { signed: true, suffix: '/yr' })}
                              </span>
                            </button>
                            <ViewFullImpactButton policyId={analysis.policy_id} policyTitle={analysis.policy_title} category={analysis.category} variant="compact" analyzed className="flex-shrink-0" />
                            {value > 0
                              ? <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden />
                              : value < 0 ? <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" aria-hidden /> : <Minus className="w-4 h-4 text-text-muted flex-shrink-0" aria-hidden />}
                          </div>

                          {isOpen && (
                            <m.div id={panelId} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 bg-white/3 border border-white/8 rounded-2xl p-6 overflow-hidden">
                              <AnalysisBody row={analysis} headingTag="h4" />
                            </m.div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </GlassCard>
              )}

              {analyses.length > 0 && (
                <GlassCard className="rounded-3xl p-7">
                  <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Methodology &amp; Transparency</h2>
                  <div className="space-y-3">
                    {methodology.map((item, i) => {
                      const isOpen = expandedMethod === i;
                      return (
                        <div key={i} className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
                          <h3>
                            <button
                              type="button"
                              onClick={() => setExpandedMethod(isOpen ? null : i)}
                              aria-expanded={isOpen}
                              aria-controls={`method-${i}`}
                              className="w-full flex items-center justify-between gap-3 p-5 text-left rounded-2xl"
                            >
                              <span className="text-sm font-medium text-text-primary">{item.q}</span>
                              <ChevronDown className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                            </button>
                          </h3>
                          <div id={`method-${i}`} hidden={!isOpen} className="px-5 pb-5">
                            <p className="text-sm text-text-muted leading-relaxed">{item.a}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              )}
            </TabPanel>

            {/* CUMULATIVE TAB */}
            <TabPanel value="cumulative" className="space-y-8">
              {loading ? (
                <div className="space-y-4" role="status">
                  <span className="sr-only">Loading your analyses…</span>
                  {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : analyses.length === 0 ? (
                <GlassCard className="rounded-3xl p-12 text-center">
                  <Search className="w-12 h-12 text-text-muted mx-auto mb-4" aria-hidden />
                  <h2 className="font-display text-xl font-semibold text-text-primary mb-2">No analyses yet</h2>
                  <p className="text-sm text-text-muted mb-6">Analyze some policies first to see cumulative impact.</p>
                  <Button href="/dashboard" variant="ghost" size="sm" className={`px-5 py-3 ${TINT_BUTTON}`}>Go to Dashboard</Button>
                </GlassCard>
              ) : (
                <>
                  <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-3xl p-10 relative overflow-hidden text-center">
                    <div className="absolute inset-0 bg-gradient-to-br from-gold/8 via-transparent to-primary/8" />
                    <div className="relative z-10">
                      <h2 className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-4">Net Annual Impact ({checkedAnalyses.length} selected)</h2>
                      <div className={`font-mono-data text-6xl sm:text-7xl font-bold mb-3 ${netImpact >= 0 ? 'gradient-text-gold' : 'text-red-400'}`}>
                        <CountUp value={Math.round(netImpact)} format={signedUSD} />
                      </div>
                      <p className="text-text-muted">per year</p>
                    </div>
                  </m.div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <GlassCard className="rounded-3xl p-7">
                      <h2 id="select-policies" className="font-display text-xl font-semibold text-text-primary mb-4">Select Policies</h2>
                      <div role="group" aria-labelledby="select-policies">
                        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                          {analyses.map(analysis => (
                            <label key={analysis.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-all">
                              <input type="checkbox" checked={checkedIds.has(analysis.id)}
                                onChange={e => { const next = new Set(checkedIds); if (e.target.checked) next.add(analysis.id); else next.delete(analysis.id); setCheckedIds(next); }}
                                className="w-4 h-4 accent-primary rounded" />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm text-text-primary truncate">{analysis.policy_title}</span>
                                <span className="block text-xs text-text-muted">{analysis.category}</span>
                              </span>
                              <span className={`font-mono-data text-xs font-bold flex-shrink-0 ${impactTone(analysis.dollar_impact || 0)}`}>
                                {formatUSD(analysis.dollar_impact || 0, { signed: true })}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </GlassCard>

                    <GlassCard className="rounded-3xl p-7">
                      <h2 className="font-display text-xl font-semibold text-text-primary mb-4">Combined Impact by Category</h2>
                      <CumulativeStackedBar data={stackedData} series={stackedSeries} height={320} title="Combined impact by category" />
                    </GlassCard>
                  </div>

                  <GlassCard className="rounded-3xl p-7">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
                      <h2 className="font-display text-xl font-semibold text-text-primary">1 / 3 / 5-Year Projection</h2>
                      <dl className="flex gap-5">
                        {[1, 3, 5].map(yr => (
                          <div key={yr} className="text-right">
                            <dt className="text-meta font-mono-data text-text-muted uppercase">{yr}yr<span className="sr-only"> total</span></dt>
                            <dd className={`font-mono-data text-sm font-bold ${impactTone(netImpact)}`}>
                              <CountUp value={Math.round(netImpact * yr)} format={signedUSD} duration={1000} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <p className="text-xs text-text-muted mb-4">One line per policy, with a gold total line.</p>
                    <CumulativeProjectionLines data={projectionData} series={projectionSeries} height={340} title="1, 3 and 5-year projection" />
                  </GlassCard>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <GlassCard className="rounded-3xl p-7">
                      <h2 className="font-display text-xl font-semibold text-text-primary mb-5">Ranked by Contribution</h2>
                      {ranked.length === 0 ? (
                        <p className="text-sm text-text-muted">Select policies to rank their contribution.</p>
                      ) : (
                        <ol className="space-y-4">
                          {ranked.map((a, i) => {
                            const share = Math.round((Math.abs(a.dollar_impact || 0) / totalAbs) * 100);
                            return (
                              <li key={a.id}>
                                <div className="flex items-center justify-between gap-3 mb-1.5">
                                  <span className="text-sm text-text-primary truncate flex items-center gap-2">
                                    <span className="text-meta font-mono-data text-text-muted" aria-hidden>#{i + 1}</span>{a.policy_title}
                                  </span>
                                  <span className={`font-mono-data text-xs font-bold flex-shrink-0 ${impactTone(a.dollar_impact || 0)}`}>
                                    {formatUSD(a.dollar_impact || 0, { signed: true, suffix: '/yr' })}
                                    <span className="sr-only">, {share}% of the total</span>
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-white/6 overflow-hidden" aria-hidden>
                                  <m.div className="h-full rounded-full" style={{ backgroundColor: (a.dollar_impact || 0) >= 0 ? '#10B981' : '#EF4444' }}
                                    initial={{ width: 0 }} animate={{ width: `${share}%` }} transition={{ duration: 0.7, delay: Math.min(i, 8) * 0.05 }} />
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </GlassCard>

                    <GlassCard className="rounded-3xl p-7">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center">
                          <Sparkles className="w-3.5 h-3.5 text-primary-300" aria-hidden />
                        </div>
                        <h2 className="font-display text-xl font-semibold text-text-primary">AI Combined Summary</h2>
                      </div>
                      {/* Live region: the outlook arrives a while after the selection changes. */}
                      <div role="status" aria-live="polite" aria-busy={cumLoading}>
                        {checkedAnalyses.length === 0 ? (
                          <p className="text-sm text-text-muted">Select policies to generate a combined financial outlook.</p>
                        ) : cumLoading ? (
                          <p className="flex items-center gap-2 text-sm text-text-muted">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden /> Generating combined outlook…
                          </p>
                        ) : cumSummary ? (
                          <>
                            <p className="text-sm text-text-muted leading-relaxed">{cumSummary}</p>
                            <AiDisclaimer className="mt-3" />
                          </>
                        ) : (
                          <p className="text-sm text-text-muted">Adjust your selection to generate a combined outlook.</p>
                        )}
                      </div>
                    </GlassCard>
                  </div>
                </>
              )}
            </TabPanel>
          </Tabs>
        </main>
      </div>
    </div>
  );
}

export default function ImpactPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen relative">
        <AmbientBackground />
        <div className="relative z-10">
          <Navbar />
          <main id="main" tabIndex={-1} aria-busy="true" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
            <span className="sr-only">Loading your impact analysis…</span>
          </main>
        </div>
      </div>
    }>
      <ImpactContent />
    </Suspense>
  );
}
