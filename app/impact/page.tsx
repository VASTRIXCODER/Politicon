'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Search, ChevronDown, ChevronUp, ArrowUpDown, ExternalLink, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';
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

const CATEGORY_COLORS: Record<string, string> = {
  Taxes: '#7B61FF',
  Healthcare: '#00D4FF',
  Housing: '#F5C842',
  Education: '#10B981',
  Employment: '#8B5CF6',
  Energy: '#F97316',
  'Social Security': '#EC4899',
  Other: '#6B7280',
};

const methodology = [
  { q: 'How are dollar amounts calculated?', a: 'We use publicly available policy data combined with your income bracket, filing status, location, and life situation. Every calculation is based on CBO, IRS, and academic economic models with transparency into assumptions.' },
  { q: 'What does "net annual impact" mean?', a: 'The sum of all positive and negative policy effects across your analyzed policies, normalized to an annual dollar figure.' },
  { q: 'How confident are these estimates?', a: 'Each analysis is AI-generated based on your specific profile. Proposed policies carry more uncertainty than enacted laws. Always verify with a financial professional for major decisions.' },
];

// Section headers to parse from analysis_text
const SECTION_HEADERS = [
  'IMMEDIATE EFFECTS',
  'RIPPLE EFFECTS',
  'DOLLAR BREAKDOWN',
  'TRADE-OFFS',
  'TRADEOFFS',
  'PROJECTIONS',
  'RECOMMENDATIONS',
];

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
      if (currentHeader) {
        sections.push({ header: currentHeader, content: currentContent.join('\n').trim() });
      }
      currentHeader = line.trim().replace(/^#+\s*/, '').replace(/[*_]/g, '');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentHeader) {
    sections.push({ header: currentHeader, content: currentContent.join('\n').trim() });
  }

  // If no sections were detected, return the full text as one block
  if (sections.length === 0 && text.trim()) {
    return [{ header: '', content: text.trim() }];
  }
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

function ViewFullImpactButton({ policyId, policyTitle, category }: { policyId: string; policyTitle: string; category?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push(`/impact?policy=${policyId}`); return; }

      const { data: existing, error: checkErr } = await supabase
        .from('policy_analyses')
        .select('id')
        .eq('user_id', user.id)
        .eq('policy_id', policyId)
        .maybeSingle();

      if (!checkErr && existing) {
        router.push(`/impact?policy=${policyId}`);
        return;
      }

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: {
            id: policyId,
            title: policyTitle,
            summary: policyTitle,
            description: policyTitle,
            category: category || 'General',
            status: 'proposed',
            date: new Date().toISOString(),
            source: '',
            sourceUrl: '',
            governingBody: 'Federal',
            region: 'Federal',
            confidenceLevel: 'medium',
            impacts: [],
            assumptions: [],
            tags: [],
          }
        }),
      });
      await res.json();
      router.push(`/impact?policy=${policyId}`);
    } catch (e) {
      console.error('View full impact error:', e);
      router.push(`/impact?policy=${policyId}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary px-3 py-1.5 rounded-xl text-[10px] font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
      {loading ? 'Loading...' : 'View Full Impact'}
    </button>
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
            if ((dbErr as { code?: string }).code !== '42P01') {
              console.error('policy_analyses load error:', dbErr);
            }
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

  const checkedAnalyses = analyses.filter(a => checkedIds.has(a.id));
  const netImpact = checkedAnalyses.reduce((sum, a) => sum + (a.dollar_impact || 0), 0);

  const categoryMap: Record<string, number> = {};
  for (const a of checkedAnalyses) {
    const cat = a.category || 'Other';
    categoryMap[cat] = (categoryMap[cat] || 0) + (a.dollar_impact || 0);
  }
  const categoryBreakdown = Object.entries(categoryMap)
    .map(([cat, value]) => ({ cat, value, color: CATEGORY_COLORS[cat] || '#6B7280' }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const maxCatAbsValue = Math.max(...categoryBreakdown.map(c => Math.abs(c.value)), 1);

  const sortedAnalyses = [...analyses].sort((a, b) => {
    if (sortBy === 'impact') return Math.abs(b.dollar_impact || 0) - Math.abs(a.dollar_impact || 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

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

          {/* Tabs */}
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
              {/* Auto-highlighted policy from URL param */}
              {selectedPolicy && (
                <GlassCard className="rounded-3xl p-8 mb-4 border-primary/20 bg-primary/5">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <Badge variant="default">{selectedPolicy.category}</Badge>
                      <h2 className="font-display text-2xl font-bold text-text-primary mt-2">{selectedPolicy.policy_title}</h2>
                      <p className="text-xs text-text-muted mt-1">{new Date(selectedPolicy.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className={`font-mono-data text-2xl font-bold flex-shrink-0 ${
                      (selectedPolicy.dollar_impact || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {(selectedPolicy.dollar_impact || 0) >= 0 ? '+' : ''}${Math.abs(selectedPolicy.dollar_impact || 0).toLocaleString()}/yr
                    </div>
                  </div>

                  {/* Formatted analysis sections */}
                  {(() => {
                    const sections = parseAnalysisSections(selectedPolicy.analysis_text);
                    if (sections.length === 1 && !sections[0].header) {
                      return (
                        <div className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                          {sections[0].content}
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-5">
                        {sections.map((section, i) => (
                          <div key={i}>
                            {section.header && (
                              <h3 className="text-xs font-mono-data font-bold text-primary uppercase tracking-widest mb-2">
                                {section.header}
                              </h3>
                            )}
                            <div className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                              {section.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </GlassCard>
              )}

              {loading ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
              ) : analyses.length === 0 ? (
                <GlassCard className="rounded-3xl p-12 text-center">
                  <Search className="w-12 h-12 text-text-muted mx-auto mb-4" />
                  <h3 className="font-display text-xl font-semibold text-text-primary mb-2">No policies analyzed yet</h3>
                  <p className="text-sm text-text-muted mb-6 max-w-sm mx-auto">
                    You haven&apos;t analyzed any policies yet. Browse the policy feed below to get started.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Link href="/explorer">
                      <button className="bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-3 rounded-xl text-sm font-medium transition-all">
                        Browse Policies
                      </button>
                    </Link>
                    <Link href="/advisor">
                      <button className="glass hover:border-white/16 text-text-muted px-5 py-3 rounded-xl text-sm transition-all">
                        Ask Advisor
                      </button>
                    </Link>
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
                            <div className="text-right">
                              <p className={`font-mono-data text-sm font-bold ${
                                (analysis.dollar_impact || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}>
                                {(analysis.dollar_impact || 0) >= 0 ? '+' : ''}${Math.abs(analysis.dollar_impact || 0).toLocaleString()}/yr
                              </p>
                            </div>
                            <ViewFullImpactButton
                              policyId={analysis.policy_id}
                              policyTitle={analysis.policy_title}
                              category={analysis.category}
                            />
                            {(analysis.dollar_impact || 0) >= 0
                              ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                              : (analysis.dollar_impact || 0) < 0
                              ? <TrendingDown className="w-4 h-4 text-red-400" />
                              : <Minus className="w-4 h-4 text-text-muted" />}
                          </div>
                        </button>

                        {/* Inline expanded analysis when selected */}
                        {selectedPolicy?.id === analysis.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-2 glass rounded-2xl p-6 overflow-hidden"
                          >
                            {(() => {
                              const sections = parseAnalysisSections(analysis.analysis_text);
                              if (sections.length === 1 && !sections[0].header) {
                                return (
                                  <div className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                                    {sections[0].content}
                                  </div>
                                );
                              }
                              return (
                                <div className="space-y-5">
                                  {sections.map((section, i) => (
                                    <div key={i}>
                                      {section.header && (
                                        <h4 className="text-xs font-mono-data font-bold text-primary uppercase tracking-widest mb-2">
                                          {section.header}
                                        </h4>
                                      )}
                                      <div className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                                        {section.content}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </motion.div>
                        )}
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}

              {/* Methodology */}
              {analyses.length > 0 && (
                <GlassCard className="rounded-3xl p-7">
                  <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Methodology &amp; Transparency</h2>
                  <div className="space-y-3">
                    {methodology.map((item, i) => (
                      <div key={i} className="glass rounded-2xl overflow-hidden">
                        <button onClick={() => setExpandedMethod(expandedMethod === i ? null : i)}
                          className="w-full flex items-center justify-between p-5 text-left">
                          <span className="text-sm font-medium text-text-primary">{item.q}</span>
                          {expandedMethod === i ? <ChevronUp className="w-4 h-4 text-text-muted flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />}
                        </button>
                        {expandedMethod === i && (
                          <div className="px-5 pb-5">
                            <p className="text-sm text-text-muted leading-relaxed">{item.a}</p>
                          </div>
                        )}
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
                  <Link href="/explorer">
                    <button className="bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-3 rounded-xl text-sm font-medium transition-all">
                      Browse Policies
                    </button>
                  </Link>
                </GlassCard>
              ) : (
                <>
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="glass-strong rounded-3xl p-10 relative overflow-hidden text-center">
                    <div className="absolute inset-0 bg-gradient-to-br from-gold/8 via-transparent to-primary/8" />
                    <div className="relative z-10">
                      <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-4">Net Annual Impact ({checkedAnalyses.length} selected)</p>
                      <div className={`font-mono-data text-6xl sm:text-7xl font-bold mb-3 ${
                        netImpact >= 0 ? 'gradient-text-gold' : 'text-red-400'
                      }`}>
                        {netImpact >= 0 ? '+' : ''}<AnimatedCounter end={Math.abs(netImpact)} prefix="$" duration={1500} />
                      </div>
                      <p className="text-text-muted">per year</p>
                    </div>
                  </motion.div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <GlassCard className="rounded-3xl p-7">
                      <h2 className="font-display text-xl font-semibold text-text-primary mb-4">Select Policies</h2>
                      <div className="space-y-2">
                        {analyses.map(analysis => (
                          <label key={analysis.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-all">
                            <input
                              type="checkbox"
                              checked={checkedIds.has(analysis.id)}
                              onChange={e => {
                                const next = new Set(checkedIds);
                                if (e.target.checked) next.add(analysis.id);
                                else next.delete(analysis.id);
                                setCheckedIds(next);
                              }}
                              className="w-4 h-4 accent-primary rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-text-primary truncate">{analysis.policy_title}</p>
                              <p className="text-xs text-text-muted">{analysis.category}</p>
                            </div>
                            <span className={`font-mono-data text-xs font-bold flex-shrink-0 ${
                              (analysis.dollar_impact || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {(analysis.dollar_impact || 0) >= 0 ? '+' : ''}${Math.abs(analysis.dollar_impact || 0).toLocaleString()}
                            </span>
                          </label>
                        ))}
                      </div>
                    </GlassCard>

                    <GlassCard className="rounded-3xl p-7">
                      <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Breakdown by Category</h2>
                      {categoryBreakdown.length === 0 ? (
                        <p className="text-sm text-text-muted">Select policies to see breakdown.</p>
                      ) : (
                        <div className="space-y-5">
                          {categoryBreakdown.map((item, i) => (
                            <motion.div key={item.cat} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-text-primary font-medium">{item.cat}</span>
                                <span className={`font-mono-data text-sm font-bold ${
                                  item.value >= 0 ? 'text-emerald-400' : 'text-red-400'
                                }`}>{item.value >= 0 ? '+' : ''}${Math.abs(item.value).toLocaleString()}/yr</span>
                              </div>
                              <div className="h-2.5 rounded-full bg-white/6 overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: item.color + (item.value < 0 ? '70' : 'CC') }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(Math.abs(item.value) / maxCatAbsValue) * 100}%` }}
                                  transition={{ duration: 0.8, delay: i * 0.08, ease: 'easeOut' }}
                                />
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </GlassCard>
                  </div>

                  <GlassCard className="rounded-3xl p-7">
                    <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Impact Projections</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { year: '1 Year', amount: netImpact, label: 'Current trajectory' },
                        { year: '3 Years', amount: Math.round(netImpact * 3), label: 'Compounded over 3 years' },
                        { year: '5 Years', amount: Math.round(netImpact * 5), label: 'Full policy maturation' },
                      ].map(proj => (
                        <div key={proj.year} className="flex items-center gap-4 p-5 glass rounded-2xl">
                          <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-mono-data text-primary font-bold text-center leading-tight">{proj.year}</span>
                          </div>
                          <div>
                            <p className={`font-mono-data text-xl font-bold ${
                              proj.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {proj.amount >= 0 ? '+' : ''}<AnimatedCounter end={Math.abs(proj.amount)} prefix="$" duration={1000} />
                            </p>
                            <p className="text-xs text-text-muted">{proj.label}</p>
                          </div>
                          {proj.amount >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-400 ml-auto" /> : <TrendingDown className="w-5 h-5 text-red-400 ml-auto" />}
                        </div>
                      ))}
                    </div>
                  </GlassCard>
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
