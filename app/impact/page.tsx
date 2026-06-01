'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Search, ChevronDown, ChevronUp, ArrowUpDown, Sparkles, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import GsapCounter from '@/components/ui/GsapCounter';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';
import ViewFullImpactButton from '@/components/ViewFullImpactButton';
import { CumulativeStackedBar, CumulativeProjectionLines } from '@/components/charts/Charts';
import Link from 'next/link';

interface PolicyAnalysisRow {
  id: string;
  policy_id: string;
  policy_title: string;
  analysis_text: string;
  dollar_impact: number;
  category: string;
  created_at: string;
}

const methodology = [
  { q: 'How are dollar amounts calculated?', a: 'We combine publicly available policy data with your income bracket, filing status, location, and life situation. Calculations draw on CBO, IRS, and academic economic models with transparency into assumptions.' },
  { q: 'What does "net annual impact" mean?', a: 'The sum of all positive and negative policy effects across your selected policies, normalized to an annual dollar figure.' },
  { q: 'How confident are these estimates?', a: 'Each analysis is AI-generated for your specific profile. Proposed policies carry more uncertainty than enacted laws. Always verify with a professional for major decisions.' },
];

const SECTION_HEADERS = ['IMMEDIATE EFFECTS', 'RIPPLE EFFECTS', 'DOLLAR BREAKDOWN', 'TRADE-OFFS', 'TRADEOFFS', 'PROJECTIONS', 'RECOMMENDATIONS'];

function parseAnalysisSections(text: string): { header: string; content: string }[] {
  if (!text) return [];
  const sections: { header: string; content: string }[] = [];
  const lines = text.split('\n');
  let currentHeader = '';
  let currentContent: string[] = [];
  for (const line of lines) {
    const upper = line.trim().toUpperCase().replace(/[^A-Z\s-]/g, '').trim();
    const isHeader = SECTION_HEADERS.some(h => upper.includes(h));
    if (isHeader && line.trim().length < 60) {
      if (currentHeader) sections.push({ header: currentHeader, content: currentContent.join('\n').trim() });
      currentHeader = line.trim().replace(/^#+\s*/, '').replace(/[*_]/g, '');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentHeader) sections.push({ header: currentHeader, content: currentContent.join('\n').trim() });
  if (sections.length === 0 && text.trim()) return [{ header: '', content: text.trim() }];
  return sections;
}

function SkeletonCard() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse">
      <div className="h-4 bg-white/10 rounded w-3/4 mb-3" />
      <div className="h-3 bg-white/10 rounded w-1/2" />
    </div>
  );
}

function AnalysisBody({ text, headingTag = 'h4' }: { text: string; headingTag?: 'h3' | 'h4' }) {
  const sections = parseAnalysisSections(text);
  if (sections.length === 1 && !sections[0].header) {
    return <div className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">{sections[0].content}</div>;
  }
  const H = headingTag;
  return (
    <div className="space-y-5">
      {sections.map((section, i) => (
        <div key={i}>
          {section.header && <H className="text-xs font-mono-data font-bold text-primary uppercase tracking-widest mb-2">{section.header}</H>}
          <div className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">{section.content}</div>
        </div>
      ))}
    </div>
  );
}

function ImpactContent() {
  const searchParams = useSearchParams();
  const policyParam = searchParams.get('policy');

  const [tab, setTab] = useState<'individual' | 'cumulative'>('individual');
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
            .from('policy_analyses')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
          if (dbErr) {
            if ((dbErr as { code?: string }).code !== '42P01') console.error('policy_analyses load error:', dbErr);
          } else {
            const rows = data || [];
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
    const items = checkedAnalyses.map(a => ({ title: a.policy_title, category: a.category, annual: a.dollar_impact || 0 }));
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/cumulative-summary', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
        });
        const data = await res.json();
        if (!cancelled) setCumSummary(data.summary || '');
      } catch {
        if (!cancelled) setCumSummary('');
      } finally {
        if (!cancelled) setCumLoading(false);
      }
    }, 700);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedKey]);

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Impact Analysis</h1>
            <p className="text-text-muted">Your personalized policy financial impact breakdown.</p>
          </motion.div>

          <div className="flex gap-1 glass rounded-2xl p-1 mb-8 w-fit">
            {(['individual', 'cumulative'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all capitalize ${
                  tab === t ? 'bg-primary/20 text-primary border border-primary/20' : 'text-text-muted hover:text-text-primary'
                }`}>
                {t === 'individual' ? 'Individual Analyses' : 'Cumulative Analysis'}
              </button>
            ))}
          </div>

          {/* INDIVIDUAL TAB */}
          {tab === 'individual' && (
            <div className="space-y-6">
              {selectedPolicy && (
                <GlassCard className="rounded-3xl p-8 mb-4 border-primary/20 bg-primary/5">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <Badge variant="default">{selectedPolicy.category}</Badge>
                      <h2 className="font-display text-2xl font-bold text-text-primary mt-2">{selectedPolicy.policy_title}</h2>
                      <p className="text-xs text-text-muted mt-1">{new Date(selectedPolicy.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                      <div className={`font-mono-data text-2xl font-bold ${(selectedPolicy.dollar_impact || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(selectedPolicy.dollar_impact || 0) >= 0 ? '+' : ''}${Math.abs(selectedPolicy.dollar_impact || 0).toLocaleString()}/yr
                      </div>
                      <ViewFullImpactButton policyId={selectedPolicy.policy_id} policyTitle={selectedPolicy.policy_title} category={selectedPolicy.category} variant="chat" />
                    </div>
                  </div>
                  <AnalysisBody text={selectedPolicy.analysis_text} headingTag="h3" />
                </GlassCard>
              )}

              {loading ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
              ) : analyses.length === 0 ? (
                <GlassCard className="rounded-3xl p-12 text-center">
                  <Search className="w-12 h-12 text-text-muted mx-auto mb-4" />
                  <h3 className="font-display text-xl font-semibold text-text-primary mb-2">No policies analyzed yet</h3>
                  <p className="text-sm text-text-muted mb-6 max-w-sm mx-auto">Browse the policy feed on your dashboard to get started.</p>
                  <div className="flex gap-3 justify-center">
                    <Link href="/dashboard"><button className="bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-3 rounded-xl text-sm font-medium transition-all">Go to Dashboard</button></Link>
                    <Link href="/advisor"><button className="glass hover:border-white/16 text-text-muted px-5 py-3 rounded-xl text-sm transition-all">Ask Advisor</button></Link>
                  </div>
                </GlassCard>
              ) : (
                <GlassCard className="rounded-3xl p-7">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="font-display text-xl font-semibold text-text-primary">All Analyzed Policies</h2>
                    <button onClick={() => setSortBy(s => s === 'impact' ? 'date' : 'impact')}
                      className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary glass px-3 py-2 rounded-xl transition-all">
                      <ArrowUpDown className="w-3 h-3" /> Sort by {sortBy === 'impact' ? 'date' : 'impact'}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {sortedAnalyses.map(analysis => (
                      <div key={analysis.id}>
                        <button onClick={() => setSelectedPolicy(a => a?.id === analysis.id ? null : analysis)}
                          className={`w-full flex items-center justify-between gap-4 p-4 rounded-2xl text-left transition-all ${
                            selectedPolicy?.id === analysis.id ? 'bg-primary/10 border border-primary/20' : 'glass hover:border-white/16'
                          }`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{analysis.policy_title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="default">{analysis.category}</Badge>
                              <span className="text-[10px] text-text-muted">{new Date(analysis.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <p className={`font-mono-data text-sm font-bold ${(analysis.dollar_impact || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {(analysis.dollar_impact || 0) >= 0 ? '+' : ''}${Math.abs(analysis.dollar_impact || 0).toLocaleString()}/yr
                            </p>
                            <div onClick={e => e.stopPropagation()}>
                              <ViewFullImpactButton policyId={analysis.policy_id} policyTitle={analysis.policy_title} category={analysis.category} variant="compact" />
                            </div>
                            {(analysis.dollar_impact || 0) >= 0
                              ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                              : (analysis.dollar_impact || 0) < 0 ? <TrendingDown className="w-4 h-4 text-red-400" /> : <Minus className="w-4 h-4 text-text-muted" />}
                          </div>
                        </button>

                        {selectedPolicy?.id === analysis.id && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 glass rounded-2xl p-6 overflow-hidden">
                            <AnalysisBody text={analysis.analysis_text} headingTag="h4" />
                          </motion.div>
                        )}
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}

              {analyses.length > 0 && (
                <GlassCard className="rounded-3xl p-7">
                  <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Methodology &amp; Transparency</h2>
                  <div className="space-y-3">
                    {methodology.map((item, i) => (
                      <div key={i} className="glass rounded-2xl overflow-hidden">
                        <button onClick={() => setExpandedMethod(expandedMethod === i ? null : i)} className="w-full flex items-center justify-between p-5 text-left">
                          <span className="text-sm font-medium text-text-primary">{item.q}</span>
                          {expandedMethod === i ? <ChevronUp className="w-4 h-4 text-text-muted flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />}
                        </button>
                        {expandedMethod === i && <div className="px-5 pb-5"><p className="text-sm text-text-muted leading-relaxed">{item.a}</p></div>}
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}
            </div>
          )}

          {/* CUMULATIVE TAB */}
          {tab === 'cumulative' && (
            <div className="space-y-8">
              {loading ? (
                <div className="space-y-4">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
              ) : analyses.length === 0 ? (
                <GlassCard className="rounded-3xl p-12 text-center">
                  <Search className="w-12 h-12 text-text-muted mx-auto mb-4" />
                  <h3 className="font-display text-xl font-semibold text-text-primary mb-2">No analyses yet</h3>
                  <p className="text-sm text-text-muted mb-6">Analyze some policies first to see cumulative impact.</p>
                  <Link href="/dashboard"><button className="bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-3 rounded-xl text-sm font-medium transition-all">Go to Dashboard</button></Link>
                </GlassCard>
              ) : (
                <>
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-3xl p-10 relative overflow-hidden text-center">
                    <div className="absolute inset-0 bg-gradient-to-br from-gold/8 via-transparent to-primary/8" />
                    <div className="relative z-10">
                      <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-4">Net Annual Impact ({checkedAnalyses.length} selected)</p>
                      <div className={`font-mono-data text-6xl sm:text-7xl font-bold mb-3 ${netImpact >= 0 ? 'gradient-text-gold' : 'text-red-400'}`}>
                        {netImpact >= 0 ? '+' : '-'}<GsapCounter value={Math.abs(netImpact)} prefix="$" />
                      </div>
                      <p className="text-text-muted">per year</p>
                    </div>
                  </motion.div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <GlassCard className="rounded-3xl p-7">
                      <h2 className="font-display text-xl font-semibold text-text-primary mb-4">Select Policies</h2>
                      <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                        {analyses.map(analysis => (
                          <label key={analysis.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-all">
                            <input type="checkbox" checked={checkedIds.has(analysis.id)}
                              onChange={e => { const next = new Set(checkedIds); if (e.target.checked) next.add(analysis.id); else next.delete(analysis.id); setCheckedIds(next); }}
                              className="w-4 h-4 accent-primary rounded" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-text-primary truncate">{analysis.policy_title}</p>
                              <p className="text-xs text-text-muted">{analysis.category}</p>
                            </div>
                            <span className={`font-mono-data text-xs font-bold flex-shrink-0 ${(analysis.dollar_impact || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {(analysis.dollar_impact || 0) >= 0 ? '+' : ''}${Math.abs(analysis.dollar_impact || 0).toLocaleString()}
                            </span>
                          </label>
                        ))}
                      </div>
                    </GlassCard>

                    <GlassCard className="rounded-3xl p-7">
                      <h2 className="font-display text-xl font-semibold text-text-primary mb-4">Combined Impact by Category</h2>
                      <CumulativeStackedBar data={stackedData} series={stackedSeries} height={320} />
                    </GlassCard>
                  </div>

                  <GlassCard className="rounded-3xl p-7">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
                      <h2 className="font-display text-xl font-semibold text-text-primary">1 / 3 / 5-Year Projection</h2>
                      <div className="flex gap-5">
                        {[1, 3, 5].map(yr => (
                          <div key={yr} className="text-right">
                            <p className="text-[10px] font-mono-data text-text-muted uppercase">{yr}yr</p>
                            <p className={`font-mono-data text-sm font-bold ${netImpact >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {netImpact >= 0 ? '+' : '-'}<GsapCounter value={Math.abs(netImpact * yr)} prefix="$" duration={1} />
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-text-muted mb-4">One line per policy, with a gold total line.</p>
                    <CumulativeProjectionLines data={projectionData} series={projectionSeries} height={340} />
                  </GlassCard>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <GlassCard className="rounded-3xl p-7">
                      <h2 className="font-display text-xl font-semibold text-text-primary mb-5">Ranked by Contribution</h2>
                      {ranked.length === 0 ? (
                        <p className="text-sm text-text-muted">Select policies to rank their contribution.</p>
                      ) : (
                        <div className="space-y-4">
                          {ranked.map((a, i) => {
                            const share = Math.round((Math.abs(a.dollar_impact || 0) / totalAbs) * 100);
                            return (
                              <div key={a.id}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-sm text-text-primary truncate flex items-center gap-2">
                                    <span className="text-[10px] font-mono-data text-text-muted">#{i + 1}</span>{a.policy_title}
                                  </span>
                                  <span className={`font-mono-data text-xs font-bold flex-shrink-0 ${(a.dollar_impact || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {(a.dollar_impact || 0) >= 0 ? '+' : ''}${Math.abs(a.dollar_impact || 0).toLocaleString()}/yr
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-white/6 overflow-hidden">
                                  <motion.div className="h-full rounded-full" style={{ backgroundColor: (a.dollar_impact || 0) >= 0 ? '#10B981' : '#EF4444' }}
                                    initial={{ width: 0 }} animate={{ width: `${share}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </GlassCard>

                    <GlassCard className="rounded-3xl p-7">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <h2 className="font-display text-xl font-semibold text-text-primary">AI Combined Summary</h2>
                      </div>
                      {checkedAnalyses.length === 0 ? (
                        <p className="text-sm text-text-muted">Select policies to generate a combined financial outlook.</p>
                      ) : cumLoading ? (
                        <div className="flex items-center gap-2 text-sm text-text-muted">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" /> Generating combined outlook…
                        </div>
                      ) : cumSummary ? (
                        <p className="text-sm text-text-muted leading-relaxed">{cumSummary}</p>
                      ) : (
                        <p className="text-sm text-text-muted">Adjust your selection to generate a combined outlook.</p>
                      )}
                    </GlassCard>
                  </div>
                </>
              )}
            </div>
          )}
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
        <div className="relative z-10"><Navbar /></div>
      </div>
    }>
      <ImpactContent />
    </Suspense>
  );
}
