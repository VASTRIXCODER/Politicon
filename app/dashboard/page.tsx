'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, TrendingUp, Search, MessageSquare, Zap, BookOpen, Loader2, RefreshCw, Check, BarChart2, Layers } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/utils';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import ViewFullImpactButton from '@/components/ViewFullImpactButton';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';

interface PolicyAnalysisRow {
  id: string;
  policy_id: string;
  policy_title: string;
  analysis_text: string;
  dollar_impact: number;
  category: string;
  created_at: string;
}

interface FeedPolicy {
  id: string;
  title: string;
  description: string;
  category: string;
  relevance: 'High' | 'Medium' | 'Low';
  relevanceScore?: number;
  estimatedImpact: string;
  region: string;
  direction?: string;
}

function SkeletonCard() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="h-3 bg-white/10 rounded w-1/4 mb-3" />
          <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
          <div className="h-3 bg-white/10 rounded w-1/2" />
        </div>
        <div className="h-6 w-16 bg-white/10 rounded" />
      </div>
    </div>
  );
}

function FeedSkeletonCard() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-16 bg-white/10 rounded-full" />
        <div className="h-5 w-12 bg-white/10 rounded-full" />
      </div>
      <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
      <div className="h-3 bg-white/10 rounded w-full mb-1" />
      <div className="h-3 bg-white/10 rounded w-2/3 mb-4" />
      <div className="flex gap-2">
        <div className="h-9 bg-white/10 rounded-xl flex-1" />
        <div className="h-9 bg-white/10 rounded-xl flex-1" />
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const RELEVANCE_COLORS: Record<string, string> = {
  High: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  Medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  Low: 'text-text-muted bg-white/5 border-white/10',
};

function PolicyFeedCard({ policy, analyzed, onAnalyze, onAskAdvisor, analyzingId }: {
  policy: FeedPolicy;
  analyzed: boolean;
  onAnalyze: (_policy: FeedPolicy) => void;
  onAskAdvisor: (_policy: FeedPolicy) => void;
  analyzingId: string | null;
}) {
  const isAnalyzing = analyzingId === policy.id;
  return (
    <GlassCard className="rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${RELEVANCE_COLORS[policy.relevance] || RELEVANCE_COLORS.Low}`}>
            {policy.relevanceScore ? `${policy.relevanceScore} · ` : ''}{policy.relevance} Relevance
          </span>
          <Badge variant="default">{policy.category}</Badge>
          {analyzed && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-400/10 border-emerald-400/20 flex items-center gap-1">
              <Check className="w-2.5 h-2.5" /> Analyzed
            </span>
          )}
        </div>
        <span className="text-[10px] text-text-muted flex-shrink-0">{policy.region}</span>
      </div>
      <h3 className="font-medium text-text-primary text-sm leading-snug mb-1">{policy.title}</h3>
      <p className="text-xs text-text-muted mb-2 leading-relaxed">{policy.description}</p>
      {policy.estimatedImpact && (
        <p className="text-xs font-mono-data text-primary mb-4">{policy.estimatedImpact} est. impact</p>
      )}
      <div className="flex gap-2">
        {analyzed ? (
          <ViewFullImpactButton
            policyId={policy.id}
            policyTitle={policy.title}
            category={policy.category}
            description={policy.description}
            region={policy.region}
            variant="card"
          />
        ) : (
          <button
            onClick={() => onAnalyze(policy)}
            disabled={isAnalyzing}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
            {isAnalyzing ? 'Analyzing...' : 'Analyze Impact'}
          </button>
        )}
        <button
          onClick={() => onAskAdvisor(policy)}
          className="flex-1 flex items-center justify-center gap-1.5 glass hover:border-white/16 text-text-muted px-3 py-2 rounded-xl text-xs transition-all"
        >
          <MessageSquare className="w-3 h-3" /> Ask Advisor
        </button>
      </div>
    </GlassCard>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [state, setState] = useState('');
  const [analyses, setAnalyses] = useState<PolicyAnalysisRow[]>([]);
  const [portfolioInsight, setPortfolioInsight] = useState('');
  const [loading, setLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(false);
  const [feedPolicies, setFeedPolicies] = useState<FeedPolicy[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<string | null>(null);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'analyzed' | 'cumulative'>('analyzed');

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function refetchAnalyses() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('policy_analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(12);
    if (data) setAnalyses(data);
  }

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) { setLoading(false); return; }

        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('first_name, state')
            .eq('id', user.id)
            .single();
          if (profile?.first_name) setFirstName(profile.first_name);
          else if (user.user_metadata?.first_name) setFirstName(user.user_metadata.first_name as string);
          else setFirstName(user.email?.split('@')[0] || 'there');
          if (profile?.state) setState(profile.state);
        } catch {
          if (user.user_metadata?.first_name) setFirstName(user.user_metadata.first_name as string);
          else setFirstName(user.email?.split('@')[0] || 'there');
        }

        try {
          const { data: analysesData, error: analysesErr } = await supabase
            .from('policy_analyses')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(12);

          if (analysesErr) {
            if ((analysesErr as { code?: string }).code !== '42P01') console.error('policy_analyses load error:', analysesErr);
          } else {
            setAnalyses(analysesData || []);
            if (analysesData && analysesData.length > 0) {
              setInsightLoading(true);
              try {
                const policyList = analysesData.slice(0, 5).map(a => `${a.policy_title} (${a.category}, $${a.dollar_impact}/yr)`).join('; ');
                const res = await fetch('/api/advisor', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    messages: [{ role: 'user', parts: [{ text: `Based on these ${analysesData.length} policies the user has analyzed: ${policyList} — provide a 2-3 sentence portfolio insight summarizing the net financial picture and one actionable recommendation. Be concise and dollar-specific.` }] }],
                  }),
                });
                const data = await res.json();
                if (data.response) setPortfolioInsight(data.response);
              } catch { /* insight optional */ }
              setInsightLoading(false);
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
  }, []);

  // Realtime: keep net impact + analyzed list live as analyses are saved
  useEffect(() => {
    const supabase = createClient();
    // Subscribe without a user filter first; filter by user_id in the callback
    const channel = supabase
      .channel('dashboard-analyses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'policy_analyses' },
        () => { refetchAnalyses(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadFeed(refresh = false) {
    if (refresh) setFeedRefreshing(true); else setFeedLoading(true);
    try {
      const res = await fetch(`/api/policies/feed${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
      if (res.status === 429) {
        showToast('You’re refreshing too often. Please wait a bit and try again.', 'error');
        return;
      }
      const data = await res.json();
      const policies = Array.isArray(data.policies) ? data.policies : Array.isArray(data) ? data : [];
      setFeedPolicies(policies);
      if (data.updatedAt) setFeedUpdatedAt(data.updatedAt);
    } catch (e) {
      console.error('Failed to load policy feed:', e);
      setFeedPolicies([]);
    } finally {
      setFeedLoading(false);
      setFeedRefreshing(false);
    }
  }

  useEffect(() => { loadFeed(false); }, []);

  async function handleAnalyze(policy: FeedPolicy) {
    setAnalyzingId(policy.id);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: {
            id: policy.id, title: policy.title, summary: policy.description, description: policy.description,
            category: policy.category, status: 'proposed', date: new Date().toISOString(),
            source: 'AI Feed', sourceUrl: '', governingBody: policy.region, region: policy.region,
            confidenceLevel: 'medium', impacts: [], assumptions: [], tags: [],
          },
        }),
      });
      if (res.status === 429) {
        showToast('You’ve hit the analysis limit for now. Please try again later.', 'error');
        return;
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(`Analysis complete for "${policy.title}"`);
      await refetchAnalyses();
    } catch (e) {
      console.error('Analyze error:', e);
      showToast('Analysis failed. Please try again.', 'error');
    } finally {
      setAnalyzingId(null);
    }
  }

  function handleAskAdvisor(policy: FeedPolicy) {
    router.push(`/advisor?policy=${encodeURIComponent(policy.title)}&context=${encodeURIComponent(policy.description)}`);
  }

  const netImpact = useMemo(() => analyses.reduce((sum, a) => sum + (a.dollar_impact || 0), 0), [analyses]);
  const analyzedIds = useMemo(() => new Set(analyses.map(a => a.policy_id)), [analyses]);

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/20 border border-red-500/30 text-red-300'
        }`}>
          {toast.message}
        </div>
      )}
      <div className="relative z-10">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-10">
            {loading ? (
              <div className="animate-pulse">
                <div className="h-8 bg-white/10 rounded w-64 mb-2" />
                <div className="h-4 bg-white/10 rounded w-48" />
              </div>
            ) : (
              <div>
                <h1 className="font-display text-3xl font-bold text-text-primary">
                  Good {getGreeting()}, <span className="gradient-text capitalize">{firstName}</span>
                </h1>
                <p className="text-text-muted text-sm mt-1">Here&apos;s your personalized policy impact overview.</p>
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="glass-strong rounded-3xl p-8 mb-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/5" />
            <div className="relative z-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-3">Net Annual Impact — Your Analyzed Policies</p>
                  {loading ? (
                    <div className="h-14 bg-white/10 rounded animate-pulse w-56" />
                  ) : analyses.length === 0 ? (
                    <div className="font-mono-data text-4xl font-bold text-text-muted">$0/yr</div>
                  ) : (
                    <div className={`font-mono-data text-5xl sm:text-6xl font-bold ${netImpact >= 0 ? 'gradient-text-gold' : 'text-red-400'}`}>
                      {netImpact >= 0 ? '+' : ''}$<AnimatedCounter end={Math.abs(netImpact)} duration={2000} />/yr
                    </div>
                  )}
                  <p className="text-text-muted text-sm mt-2">
                    {analyses.length === 0 ? 'No policies analyzed yet' : `Across ${analyses.length} ${analyses.length === 1 ? 'policy' : 'policies'} analyzed`}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Link href="/advisor">
                    <button className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap">
                      <Search className="w-4 h-4" /> Analyze a Policy
                    </button>
                  </Link>
                  <Link href="/advisor">
                    <button className="flex items-center gap-2 glass hover:border-white/16 text-text-muted px-5 py-3 rounded-xl text-sm transition-all whitespace-nowrap">
                      <MessageSquare className="w-4 h-4" /> Ask the Advisor
                    </button>
                  </Link>
                </div>
              </div>

              {analyses.length > 0 && (
                <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/8">
                  {[
                    {
                      label: 'Highest gain',
                      value: analyses.filter(a => a.dollar_impact > 0).sort((a, b) => b.dollar_impact - a.dollar_impact)[0]
                        ? `+$${analyses.filter(a => a.dollar_impact > 0).sort((a, b) => b.dollar_impact - a.dollar_impact)[0].dollar_impact.toLocaleString()}` : 'N/A',
                      sub: analyses.filter(a => a.dollar_impact > 0).sort((a, b) => b.dollar_impact - a.dollar_impact)[0]?.policy_title?.slice(0, 20) || '—',
                    },
                    {
                      label: 'Biggest cost',
                      value: analyses.filter(a => a.dollar_impact < 0).sort((a, b) => a.dollar_impact - b.dollar_impact)[0]
                        ? `-$${Math.abs(analyses.filter(a => a.dollar_impact < 0).sort((a, b) => a.dollar_impact - b.dollar_impact)[0].dollar_impact).toLocaleString()}` : 'N/A',
                      sub: analyses.filter(a => a.dollar_impact < 0).sort((a, b) => a.dollar_impact - b.dollar_impact)[0]?.policy_title?.slice(0, 20) || '—',
                    },
                    { label: 'Policies tracked', value: analyses.length.toString(), sub: 'View all' },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className="font-mono-data text-lg font-bold text-text-primary">{s.value}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">{s.sub}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-6 glass rounded-2xl p-1 w-fit">
            {([
              { id: 'analyzed', label: 'Analyzed Policies', icon: BarChart2 },
              { id: 'cumulative', label: 'Cumulative Impact', icon: Layers },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary/20 text-primary border border-primary/20'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === 'analyzed' && analyses.length > 0 && (
                  <span className="text-[10px] font-mono-data bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{analyses.length}</span>
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'analyzed' && (
              <motion.div key="analyzed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-xl font-semibold text-text-primary">Analyzed Policies</h2>
                      <Link href="/impact" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                        Full analysis <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>

                    {loading ? (
                      <div className="space-y-4">{[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}</div>
                    ) : analyses.length === 0 ? (
                      <GlassCard className="rounded-2xl p-10 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                          <Search className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="font-medium text-text-primary mb-2">No policies analyzed yet</h3>
                        <p className="text-sm text-text-muted mb-6 max-w-xs mx-auto">Browse the policy feed below to get started.</p>
                      </GlassCard>
                    ) : (
                      <div className="space-y-4">
                        {analyses.map((analysis, i) => (
                          <GlassCard key={analysis.id} delay={i * 0.07} className="rounded-2xl p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="default">{analysis.category}</Badge>
                                  <span className="text-[10px] text-text-muted">{new Date(analysis.created_at).toLocaleDateString()}</span>
                                </div>
                                <h3 className="font-medium text-text-primary text-sm leading-snug mb-1">{analysis.policy_title}</h3>
                                <p className="text-xs text-text-muted line-clamp-2">{analysis.analysis_text?.slice(0, 120)}...</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className={`font-mono-data text-sm font-bold ${(analysis.dollar_impact || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {(analysis.dollar_impact || 0) >= 0 ? '+' : ''}${Math.abs(analysis.dollar_impact || 0).toLocaleString()}/yr
                                </p>
                                <Link href={`/impact/${encodeURIComponent(analysis.policy_id)}`}>
                                  <button className="mt-2 text-[10px] text-primary hover:text-primary/80">View full →</button>
                                </Link>
                              </div>
                            </div>
                          </GlassCard>
                        ))}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-display text-xl font-semibold text-text-primary">Policy Feed</h2>
                        <div className="flex items-center gap-3">
                          {feedUpdatedAt && <span className="text-[10px] text-text-muted">Updated {timeAgo(feedUpdatedAt)}</span>}
                          <button onClick={() => loadFeed(true)} disabled={feedRefreshing || feedLoading}
                            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary glass px-3 py-1.5 rounded-xl transition-all disabled:opacity-60">
                            <RefreshCw className={`w-3 h-3 ${feedRefreshing ? 'animate-spin' : ''}`} /> Refresh
                          </button>
                        </div>
                      </div>

                      {feedLoading ? (
                        <div className="space-y-4">{[...Array(3)].map((_, i) => <FeedSkeletonCard key={i} />)}</div>
                      ) : feedPolicies.length === 0 ? (
                        <GlassCard className="rounded-2xl p-10 text-center">
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                            <BookOpen className="w-6 h-6 text-primary" />
                          </div>
                          <h3 className="font-medium text-text-primary mb-2">No policies in feed yet</h3>
                          <p className="text-sm text-text-muted mb-6 max-w-xs mx-auto">Complete your profile to get personalized policy recommendations.</p>
                          <Link href="/onboarding">
                            <button className="bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-3 rounded-xl text-sm font-medium transition-all">Complete Profile →</button>
                          </Link>
                        </GlassCard>
                      ) : (
                        <div className="space-y-4">
                          {feedPolicies.map((policy) => (
                            <PolicyFeedCard
                              key={policy.id}
                              policy={policy}
                              analyzed={analyzedIds.has(policy.id)}
                              onAnalyze={handleAnalyze}
                              onAskAdvisor={handleAskAdvisor}
                              analyzingId={analyzingId}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h2 className="font-display text-xl font-semibold text-text-primary mb-4">AI Portfolio Insight</h2>
                      {insightLoading ? (
                        <GlassCard className="rounded-2xl p-5">
                          <div className="space-y-2 animate-pulse">
                            <div className="h-3 bg-white/10 rounded w-full" />
                            <div className="h-3 bg-white/10 rounded w-5/6" />
                            <div className="h-3 bg-white/10 rounded w-4/6" />
                          </div>
                        </GlassCard>
                      ) : portfolioInsight ? (
                        <GlassCard className="rounded-2xl p-5">
                          <div className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Zap className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <p className="text-xs text-text-muted leading-relaxed">{portfolioInsight}</p>
                          </div>
                        </GlassCard>
                      ) : (
                        <GlassCard className="rounded-2xl p-5">
                          <p className="text-xs text-text-muted">Analyze some policies to get an AI-generated portfolio insight.</p>
                        </GlassCard>
                      )}
                    </div>

                    <GlassCard className="rounded-2xl p-5 bg-gradient-to-br from-primary/10 to-secondary/5 border-primary/20">
                      <h3 className="font-display font-semibold text-text-primary mb-2">Ask the AI Advisor</h3>
                      <p className="text-xs text-text-muted mb-4">Get personalized answers about how any policy affects your specific situation.</p>
                      <Link href="/advisor">
                        <button className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
                          Start chatting <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </Link>
                    </GlassCard>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'cumulative' && (
              <motion.div key="cumulative" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {analyses.length === 0 ? (
                  <GlassCard className="rounded-2xl p-16 text-center">
                    <Layers className="w-12 h-12 text-text-muted mx-auto mb-4" />
                    <h3 className="font-medium text-text-primary mb-2">No data yet</h3>
                    <p className="text-sm text-text-muted max-w-xs mx-auto">Analyze at least one policy to see your cumulative financial picture.</p>
                  </GlassCard>
                ) : (
                  <div className="space-y-6">
                    {/* Category totals */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <GlassCard className="rounded-2xl p-6">
                        <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-5">Policy Breakdown</p>
                        <div className="space-y-3">
                          {[...analyses].sort((a, b) => Math.abs(b.dollar_impact || 0) - Math.abs(a.dollar_impact || 0)).map(a => {
                            const val = a.dollar_impact || 0;
                            const max = Math.max(...analyses.map(x => Math.abs(x.dollar_impact || 0)), 1);
                            const pct = Math.abs(val) / max * 100;
                            return (
                              <div key={a.id}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-text-primary truncate max-w-[200px]">{a.policy_title}</span>
                                  <span className={`text-xs font-mono-data font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {val >= 0 ? '+' : ''}${Math.abs(val).toLocaleString()}/yr
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${val >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </GlassCard>

                      <GlassCard className="rounded-2xl p-6">
                        <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-5">By Category</p>
                        <div className="space-y-3">
                          {Object.entries(
                            analyses.reduce((acc, a) => {
                              const cat = a.category || 'Other';
                              acc[cat] = (acc[cat] || 0) + (a.dollar_impact || 0);
                              return acc;
                            }, {} as Record<string, number>)
                          ).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([cat, val]) => {
                            const allCatVals = Object.values(
                              analyses.reduce((acc, a) => { const c = a.category || 'Other'; acc[c] = (acc[c] || 0) + (a.dollar_impact || 0); return acc; }, {} as Record<string, number>)
                            );
                            const max = Math.max(...allCatVals.map(Math.abs), 1);
                            return (
                              <div key={cat}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-text-primary">{cat}</span>
                                  <span className={`text-xs font-mono-data font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {val >= 0 ? '+' : ''}${Math.abs(val).toLocaleString()}/yr
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${val >= 0 ? 'bg-cyan-500' : 'bg-orange-500'}`}
                                    style={{ width: `${Math.abs(val) / max * 100}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </GlassCard>
                    </div>

                    {/* Projections table */}
                    <GlassCard className="rounded-2xl p-6">
                      <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-5">Cumulative Projections</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/8">
                              <th className="text-left text-xs text-text-muted font-normal pb-3">Policy</th>
                              <th className="text-right text-xs text-text-muted font-normal pb-3">1 Year</th>
                              <th className="text-right text-xs text-text-muted font-normal pb-3">3 Years</th>
                              <th className="text-right text-xs text-text-muted font-normal pb-3">5 Years</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analyses.map(a => {
                              const yr1 = a.dollar_impact || 0;
                              const yr3 = yr1 * 3;
                              const yr5 = yr1 * 5;
                              const fmt = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(Math.round(n)).toLocaleString()}`;
                              return (
                                <tr key={a.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                                  <td className="py-3 text-xs text-text-primary max-w-[200px] truncate">{a.policy_title}</td>
                                  <td className={`py-3 text-right font-mono-data text-xs font-bold ${yr1 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(yr1)}</td>
                                  <td className={`py-3 text-right font-mono-data text-xs font-bold ${yr3 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(yr3)}</td>
                                  <td className={`py-3 text-right font-mono-data text-xs font-bold ${yr5 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(yr5)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-white/12">
                              <td className="pt-4 text-xs font-semibold text-text-primary">Total</td>
                              {[1, 3, 5].map(yrs => {
                                const total = analyses.reduce((s, a) => s + (a.dollar_impact || 0) * yrs, 0);
                                return (
                                  <td key={yrs} className={`pt-4 text-right font-mono-data text-sm font-bold ${total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {total >= 0 ? '+' : '-'}${Math.abs(Math.round(total)).toLocaleString()}
                                  </td>
                                );
                              })}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </GlassCard>

                    {/* AI portfolio insight */}
                    {portfolioInsight && (
                      <GlassCard className="rounded-2xl p-6">
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Zap className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-text-primary mb-1">AI Portfolio Summary</p>
                            <p className="text-xs text-text-muted leading-relaxed">{portfolioInsight}</p>
                          </div>
                        </div>
                      </GlassCard>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
