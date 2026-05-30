'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, TrendingUp, Search, MessageSquare, Zap, AlertCircle, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export default function DashboardPage() {
  const [firstName, setFirstName] = useState('');
  const [state, setState] = useState('');
  const [analyses, setAnalyses] = useState<PolicyAnalysisRow[]>([]);
  const [portfolioInsight, setPortfolioInsight] = useState('');
  const [loading, setLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) { setLoading(false); return; }

        // Load profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name, state')
          .eq('id', user.id)
          .single();

        if (profile?.first_name) setFirstName(profile.first_name);
        else if (user.user_metadata?.first_name) setFirstName(user.user_metadata.first_name as string);
        else setFirstName(user.email?.split('@')[0] || 'there');

        if (profile?.state) setState(profile.state);

        // Load analyses
        const { data: analysesData, error: analysesErr } = await supabase
          .from('policy_analyses')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (analysesErr) throw analysesErr;
        setAnalyses(analysesData || []);

        // If we have analyses, request a portfolio insight
        if (analysesData && analysesData.length > 0) {
          setInsightLoading(true);
          try {
            const policyList = analysesData.slice(0, 5).map(a =>
              `${a.policy_title} (${a.category}, $${a.dollar_impact}/yr)`
            ).join('; ');
            const res = await fetch('/api/advisor', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{
                  role: 'user',
                  parts: [{ text: `Based on these ${analysesData.length} policies the user has analyzed: ${policyList} — provide a 2-3 sentence portfolio insight summarizing the net financial picture and one actionable recommendation. Be concise and dollar-specific.` }]
                }]
              }),
            });
            const data = await res.json();
            if (data.response) setPortfolioInsight(data.response);
          } catch { /* insight is optional */ }
          setInsightLoading(false);
        }
      } catch (e) {
        setError('Failed to load dashboard data. Please refresh.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const netImpact = analyses.reduce((sum, a) => sum + (a.dollar_impact || 0), 0);

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          {/* Greeting */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-10">
            {loading ? (
              <div className="animate-pulse">
                <div className="h-8 bg-white/10 rounded w-64 mb-2" />
                <div className="h-4 bg-white/10 rounded w-48" />
              </div>
            ) : (
              <div>
                <h1 className="font-display text-3xl font-bold text-text-primary">
                  Good {getGreeting()},{' '}
                  <span className="gradient-text capitalize">{firstName}</span>
                </h1>
                <p className="text-text-muted text-sm mt-1">Here&apos;s your personalized policy impact overview.</p>
              </div>
            )}
          </motion.div>

          {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Net impact hero card */}
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
                    <div className={`font-mono-data text-5xl sm:text-6xl font-bold ${
                      netImpact >= 0 ? 'gradient-text-gold' : 'text-red-400'
                    }`}>
                      {netImpact >= 0 ? '+' : ''}$<AnimatedCounter end={Math.abs(netImpact)} duration={2000} />/yr
                    </div>
                  )}
                  <p className="text-text-muted text-sm mt-2">
                    {analyses.length === 0
                      ? 'No policies analyzed yet'
                      : `Across ${analyses.length} ${analyses.length === 1 ? 'policy' : 'policies'} analyzed`}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Link href="/explorer">
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

              {/* Quick stats */}
              {analyses.length > 0 && (
                <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/8">
                  {[
                    {
                      label: 'Highest gain',
                      value: analyses.filter(a => a.dollar_impact > 0).sort((a, b) => b.dollar_impact - a.dollar_impact)[0]
                        ? `+$${analyses.filter(a => a.dollar_impact > 0).sort((a, b) => b.dollar_impact - a.dollar_impact)[0].dollar_impact.toLocaleString()}`
                        : 'N/A',
                      sub: analyses.filter(a => a.dollar_impact > 0).sort((a, b) => b.dollar_impact - a.dollar_impact)[0]?.policy_title?.slice(0, 20) || '—',
                    },
                    {
                      label: 'Biggest cost',
                      value: analyses.filter(a => a.dollar_impact < 0).sort((a, b) => a.dollar_impact - b.dollar_impact)[0]
                        ? `-$${Math.abs(analyses.filter(a => a.dollar_impact < 0).sort((a, b) => a.dollar_impact - b.dollar_impact)[0].dollar_impact).toLocaleString()}`
                        : 'N/A',
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main: Analyzed policies */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-text-primary">Analyzed Policies</h2>
                <Link href="/impact" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                  Full analysis <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {loading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : analyses.length === 0 ? (
                <GlassCard className="rounded-2xl p-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-medium text-text-primary mb-2">No policies analyzed yet</h3>
                  <p className="text-sm text-text-muted mb-6 max-w-xs mx-auto">
                    Start by searching for a policy to see how it affects your finances.
                  </p>
                  <Link href="/explorer">
                    <button className="bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-3 rounded-xl text-sm font-medium transition-all">
                      Browse Policies
                    </button>
                  </Link>
                </GlassCard>
              ) : (
                <div className="space-y-4">
                  {analyses.slice(0, 6).map((analysis, i) => (
                    <GlassCard key={analysis.id} delay={i * 0.07} className="rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="default">{analysis.category}</Badge>
                            <span className="text-[10px] text-text-muted">
                              {new Date(analysis.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <h3 className="font-medium text-text-primary text-sm leading-snug mb-1">
                            {analysis.policy_title}
                          </h3>
                          <p className="text-xs text-text-muted line-clamp-2">
                            {analysis.analysis_text?.slice(0, 120)}...
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`font-mono-data text-sm font-bold ${
                            (analysis.dollar_impact || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {(analysis.dollar_impact || 0) >= 0 ? '+' : ''}${Math.abs(analysis.dollar_impact || 0).toLocaleString()}/yr
                          </p>
                          <Link href={`/impact?policy=${analysis.policy_id}`}>
                            <button className="mt-2 text-[10px] text-primary hover:text-primary/80">View full →</button>
                          </Link>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Portfolio Insight */}
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
                ) : analyses.length > 0 ? null : (
                  <GlassCard className="rounded-2xl p-5">
                    <p className="text-xs text-text-muted">Analyze some policies to get an AI-generated portfolio insight.</p>
                  </GlassCard>
                )}
              </div>

              {/* Local News Placeholder */}
              <div>
                <h2 className="font-display text-xl font-semibold text-text-primary mb-4">
                  Policy News{state ? ` for ${state}` : ''}
                </h2>
                <GlassCard className="rounded-2xl p-5">
                  <div className="flex flex-col items-center text-center py-4">
                    <BookOpen className="w-8 h-8 text-text-muted mb-3" />
                    <p className="text-sm font-medium text-text-primary mb-1">Local news feed</p>
                    <p className="text-xs text-text-muted">State and local policy news is coming soon.</p>
                  </div>
                </GlassCard>
              </div>

              {/* AI Advisor CTA */}
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
        </main>
      </div>
    </div>
  );
}
