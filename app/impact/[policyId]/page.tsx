'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus, Check, ChevronDown, ExternalLink,
  Home, Briefcase, Heart, PiggyBank, GraduationCap, Landmark, Waves, ShieldAlert,
  Target, Sparkles, Loader2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { FullAnalysis, ImpactDirection } from '@/types';
import { getStatusColor } from '@/lib/utils';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import GsapCounter from '@/components/ui/GsapCounter';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';
import {
  CategoryImpactBar, ImpactDonut, MonthlyTimeline, ProjectionBars, BeforeAfterBar, CATEGORY_COLOR,
} from '@/components/charts/Charts';

// ---------------------------------------------------------------------------
// formatting helpers
// ---------------------------------------------------------------------------
const money = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(Math.round(n)).toLocaleString()}`;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n}%`;
const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const TABS = ['overview', 'breakdown', 'timeline', 'deepdive', 'action'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  breakdown: 'Financial Breakdown',
  timeline: 'Timeline',
  deepdive: 'Deep Dive',
  action: 'Action Plan',
};

interface ProfileSnapshot {
  income_range?: string;
  state?: string;
  filing_status?: string;
  housing_situation?: string;
  employment_status?: string;
  has_dependents?: boolean;
}

function DirIcon({ d, className = 'w-5 h-5' }: { d: ImpactDirection; className?: string }) {
  if (d === 'positive') return <TrendingUp className={`${className} text-emerald-400`} />;
  if (d === 'negative') return <TrendingDown className={`${className} text-red-400`} />;
  return <Minus className={`${className} text-text-muted`} />;
}

function StatRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/6 last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`font-mono-data text-sm font-semibold ${positive === undefined ? 'text-text-primary' : positive ? 'text-emerald-400' : 'text-red-400'}`}>
        {value}
      </span>
    </div>
  );
}

export default function PolicyDetailPage({ params }: { params: { policyId: string } }) {
  const policyId = decodeURIComponent(params.policyId);
  const router = useRouter();

  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setNotFound(true); setLoading(false); return; }

        // profile snapshot (best-effort)
        try {
          const { data: prof } = await supabase
            .from('user_profiles')
            .select('income_range, state, filing_status, housing_situation, employment_status, has_dependents')
            .eq('id', user.id)
            .single();
          if (prof && !cancelled) setProfile(prof);
        } catch { /* optional */ }

        // 1) existing rich analysis?
        try {
          const { data: row } = await supabase
            .from('analyzed_policies')
            .select('analysis, updated_at')
            .eq('user_id', user.id)
            .eq('policy_id', policyId)
            .maybeSingle();
          if (row?.analysis && !cancelled) {
            setAnalysis(row.analysis as FullAnalysis);
            setAnalyzedAt(row.updated_at);
            setLoading(false);
            return;
          }
        } catch { /* fall through to generate */ }

        // 2) generate it — try to enrich metadata from the cached feed
        if (cancelled) return;
        setGenerating(true);

        let meta: { title: string; description: string; category: string; region: string } = {
          title: titleCase(policyId),
          description: titleCase(policyId),
          category: 'taxes',
          region: 'Federal',
        };
        try {
          const { data: feed } = await supabase
            .from('user_policy_feed')
            .select('policies')
            .eq('user_id', user.id)
            .maybeSingle();
          if (feed?.policies && Array.isArray(feed.policies)) {
            const match = feed.policies.find((p: { id?: string }) => p.id === policyId);
            if (match) {
              meta = {
                title: match.title || meta.title,
                description: match.summary || match.description || meta.description,
                category: match.category || meta.category,
                region: match.region || meta.region,
              };
            }
          }
        } catch { /* optional */ }

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            policy: {
              id: policyId, title: meta.title, summary: meta.description, description: meta.description,
              category: meta.category, status: 'proposed', date: new Date().toISOString(),
              source: 'Politicon', sourceUrl: '', governingBody: meta.region, region: meta.region,
              confidenceLevel: 'medium', impacts: [], assumptions: [], tags: [],
            },
          }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (data?.analysis) {
          setAnalysis(data.analysis as FullAnalysis);
          setAnalyzedAt(new Date().toISOString());
        } else {
          setNotFound(true);
        }
      } catch (e) {
        console.error('Detail load error:', e);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) { setGenerating(false); setLoading(false); }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [policyId]);

  // ----- loading / generating / not-found states -----
  if (loading) {
    return (
      <Shell>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
          {generating && (
            <div className="flex items-center gap-3 mb-8 text-sm text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Compiling your full financial analysis…
            </div>
          )}
          <div className="h-10 w-2/3 bg-white/10 rounded-2xl animate-pulse mb-6" />
          <div className="h-40 bg-white/10 rounded-3xl animate-pulse mb-6" />
          <div className="grid sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-white/10 rounded-2xl animate-pulse" />)}
          </div>
        </div>
      </Shell>
    );
  }

  if (notFound || !analysis) {
    return (
      <Shell>
        <div className="max-w-2xl mx-auto px-4 pt-40 pb-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
            <Target className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold text-text-primary mb-2">Analysis unavailable</h1>
          <p className="text-sm text-text-muted mb-6">We couldn&apos;t load a full analysis for this policy. Try analyzing it again from your dashboard.</p>
          <button onClick={() => router.push('/dashboard')} className="bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-3 rounded-xl text-sm font-medium transition-all">
            Back to Dashboard
          </button>
        </div>
      </Shell>
    );
  }

  return <DetailView analysis={analysis} profile={profile} analyzedAt={analyzedAt} tab={tab} setTab={setTab} onBack={() => router.back()} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        {children}
      </div>
    </div>
  );
}

// ===========================================================================
// DETAIL VIEW
// ===========================================================================
function DetailView({
  analysis: a, profile, analyzedAt, tab, setTab, onBack,
}: {
  analysis: FullAnalysis; profile: ProfileSnapshot | null; analyzedAt: string | null;
  tab: Tab; setTab: (_t: Tab) => void; onBack: () => void;
}) {
  const categoryBars = useMemo(
    () => Object.entries(a.categoryImpacts)
      .map(([k, v]) => ({ name: titleCase(k), value: v, color: CATEGORY_COLOR[k] || '#6B7280' }))
      .filter((d) => d.value !== 0),
    [a.categoryImpacts]
  );

  const profileChips = useMemo(() => {
    if (!profile) return [];
    return [
      profile.income_range && titleCase(profile.income_range).replace(/k/gi, 'K'),
      profile.state,
      profile.filing_status && titleCase(profile.filing_status),
      profile.housing_situation && titleCase(profile.housing_situation),
      profile.employment_status && titleCase(profile.employment_status),
      profile.has_dependents ? 'Has dependents' : undefined,
    ].filter(Boolean) as string[];
  }, [profile]);

  return (
    <Shell>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-24">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors mb-6 group text-sm">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
        </button>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge variant="primary">{titleCase(a.category)}</Badge>
            <span className={`text-[11px] font-mono-data px-2.5 py-0.5 rounded-full border capitalize ${getStatusColor(a.status)}`}>{a.status}</span>
            {a.billNumber && <Badge variant="default">{a.billNumber}</Badge>}
            <span className="text-[11px] text-text-muted font-mono-data flex items-center gap-1 ml-1">
              <Sparkles className="w-3 h-3 text-primary" /> {a.confidenceScore}% confidence
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-text-primary leading-tight">{a.policyTitle}</h1>
          {analyzedAt && (
            <p className="text-xs text-text-muted mt-2">Last analyzed {new Date(analyzedAt).toLocaleString()}</p>
          )}
        </motion.div>

        {/* Hero impact card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
          className="glass-strong rounded-3xl p-8 mb-8 relative overflow-hidden">
          <div className={`absolute inset-0 ${a.direction === 'negative' ? 'bg-gradient-to-br from-red-500/10' : 'bg-gradient-to-br from-gold/10'} via-transparent to-primary/5`} />
          <div className="relative z-10 grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
            <div>
              <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-3">Net Annual Impact</p>
              <div className={`font-mono-data text-5xl sm:text-6xl font-bold flex items-center gap-3 ${a.netAnnualImpact >= 0 ? 'gradient-text-gold' : 'text-red-400'}`}>
                <span>{a.netAnnualImpact >= 0 ? '+' : '-'}</span>
                <GsapCounter value={Math.abs(a.netAnnualImpact)} prefix="$" />
              </div>
              <div className="flex items-center gap-4 mt-3">
                <p className="text-sm text-text-muted">
                  <span className={`font-mono-data font-semibold ${a.netMonthlyImpact >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(a.netMonthlyImpact)}</span> / month
                </p>
                <span className="flex items-center gap-1.5 text-sm capitalize">
                  <DirIcon d={a.direction} className="w-4 h-4" />
                  <span className="text-text-muted">{a.direction}</span>
                </span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-mono-data text-text-muted uppercase tracking-widest mb-2">Driven by your profile</p>
              <div className="flex flex-wrap gap-2">
                {profileChips.length > 0 ? profileChips.map((c) => (
                  <span key={c} className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-text-muted">{c}</span>
                )) : <span className="text-xs text-text-muted">Complete your profile for a sharper analysis.</span>}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 glass rounded-2xl p-1 mb-8 overflow-x-auto scrollbar-hide w-full sm:w-fit">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${tab === t ? 'bg-primary/20 text-primary border border-primary/20' : 'text-text-muted hover:text-text-primary'}`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab a={a} categoryBars={categoryBars} />}
        {tab === 'breakdown' && <BreakdownTab a={a} categoryBars={categoryBars} />}
        {tab === 'timeline' && <TimelineTab a={a} />}
        {tab === 'deepdive' && <DeepDiveTab a={a} />}
        {tab === 'action' && <ActionTab a={a} />}
      </main>
    </Shell>
  );
}

// ----- Tab 1: Overview -----
function OverviewTab({ a, categoryBars }: { a: FullAnalysis; categoryBars: { name: string; value: number }[] }) {
  return (
    <div className="space-y-6">
      <GlassCard className="rounded-3xl p-7" animate={false}>
        <h2 className="font-display text-lg font-semibold text-text-primary mb-3">What this means for you</h2>
        <p className="text-sm text-text-muted leading-relaxed">{a.plainEnglishSummary}</p>
      </GlassCard>

      <div className="grid lg:grid-cols-2 gap-6">
        <GlassCard className="rounded-3xl p-7" animate={false}>
          <h3 className="font-display text-base font-semibold text-text-primary mb-4">Immediate Effects</h3>
          <StatRow label="Monthly budget impact" value={`${money(a.immediate.monthlyBudgetImpact)}/mo`} positive={a.immediate.monthlyBudgetImpact >= 0} />
          <StatRow label="Annual budget impact" value={`${money(a.immediate.annualBudgetImpact)}/yr`} positive={a.immediate.annualBudgetImpact >= 0} />
          <StatRow label="Take-home per paycheck" value={money(a.immediate.takeHomePerPaycheck)} positive={a.immediate.takeHomePerPaycheck >= 0} />
          <StatRow label="Effective tax rate change" value={pct(a.immediate.effectiveTaxRateChange)} positive={a.immediate.effectiveTaxRateChange <= 0} />
          {a.immediate.spendingCategories.slice(0, 5).map((s, i) => (
            <StatRow key={i} label={s.label} value={money(s.value)} positive={s.value >= 0} />
          ))}
        </GlassCard>

        <GlassCard className="rounded-3xl p-7" animate={false}>
          <h3 className="font-display text-base font-semibold text-text-primary mb-4">Impact by Category</h3>
          <CategoryImpactBar data={categoryBars} height={280} />
        </GlassCard>
      </div>

      {/* Trade-offs */}
      <GlassCard className="rounded-3xl p-7" animate={false}>
        <h3 className="font-display text-base font-semibold text-text-primary mb-4">Trade-offs</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-mono-data uppercase tracking-widest text-emerald-400 mb-3">You gain</p>
            <div className="space-y-2">
              {a.tradeoffs.gains.length ? a.tradeoffs.gains.map((g, i) => (
                <div key={i} className="flex items-center justify-between gap-3 glass rounded-xl px-4 py-2.5">
                  <span className="text-sm text-text-primary">{g.label}</span>
                  <span className="font-mono-data text-sm font-semibold text-emerald-400">{money(g.value)}</span>
                </div>
              )) : <p className="text-xs text-text-muted">No notable gains identified.</p>}
            </div>
          </div>
          <div>
            <p className="text-xs font-mono-data uppercase tracking-widest text-red-400 mb-3">You lose</p>
            <div className="space-y-2">
              {a.tradeoffs.losses.length ? a.tradeoffs.losses.map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-3 glass rounded-xl px-4 py-2.5">
                  <span className="text-sm text-text-primary">{l.label}</span>
                  <span className="font-mono-data text-sm font-semibold text-red-400">{money(l.value)}</span>
                </div>
              )) : <p className="text-xs text-text-muted">No notable losses identified.</p>}
            </div>
          </div>
        </div>
        {a.tradeoffs.netAssessment && (
          <p className="text-sm text-text-muted leading-relaxed mt-5 pt-5 border-t border-white/8">{a.tradeoffs.netAssessment}</p>
        )}
      </GlassCard>

      {/* Top recommendations */}
      <GlassCard className="rounded-3xl p-7" animate={false}>
        <h3 className="font-display text-base font-semibold text-text-primary mb-4">Top Recommendations</h3>
        <div className="space-y-3">
          {a.recommendations.slice(0, 3).map((r, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[11px] font-mono-data text-primary">{i + 1}</span>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">{r.step}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

// ----- Tab 2: Financial Breakdown -----
function BreakdownTab({ a, categoryBars }: { a: FullAnalysis; categoryBars: { name: string; value: number; color?: string }[] }) {
  const donutData = categoryBars.map((c) => ({ name: c.name, value: c.value, color: c.color || '#6B7280' }));
  const beforeAfter = [{ label: 'Effective Tax Rate', before: a.tax.effectiveRateBefore, after: a.tax.effectiveRateAfter }];
  return (
    <div className="space-y-6">
      <GlassCard className="rounded-3xl p-7" animate={false}>
        <h3 className="font-display text-base font-semibold text-text-primary mb-4">Annual Impact by Category</h3>
        <CategoryImpactBar data={categoryBars} height={320} />
      </GlassCard>

      <div className="grid lg:grid-cols-2 gap-6">
        <GlassCard className="rounded-3xl p-7" animate={false}>
          <h3 className="font-display text-base font-semibold text-text-primary mb-4">Proportion of Impact</h3>
          <ImpactDonut data={donutData} height={320} />
        </GlassCard>

        <GlassCard className="rounded-3xl p-7" animate={false}>
          <h3 className="font-display text-base font-semibold text-text-primary mb-4">Before vs After — Effective Tax Rate</h3>
          <BeforeAfterBar items={beforeAfter} unit="%" height={240} />
          <div className="mt-4 space-y-1">
            <StatRow label="Take-home per paycheck" value={money(a.immediate.takeHomePerPaycheck)} positive={a.immediate.takeHomePerPaycheck >= 0} />
            <StatRow label="Monthly budget" value={`${money(a.immediate.monthlyBudgetImpact)}/mo`} positive={a.immediate.monthlyBudgetImpact >= 0} />
            <StatRow label="Federal tax liability" value={money(a.tax.federalLiabilityChange)} positive={a.tax.federalLiabilityChange >= 0} />
            <StatRow label="State tax liability" value={money(a.tax.stateLiabilityChange)} positive={a.tax.stateLiabilityChange >= 0} />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

// ----- Tab 3: Timeline -----
function TimelineTab({ a }: { a: FullAnalysis }) {
  const milestones = [
    { label: 'Month 1', value: a.timeline.monthly[0]?.impact ?? 0 },
    { label: 'Month 6', value: a.timeline.monthly[5]?.impact ?? 0 },
    { label: 'Year 1', value: a.timeline.year1 },
    { label: 'Year 3', value: a.timeline.year3 },
    { label: 'Year 5', value: a.timeline.year5 },
  ];
  return (
    <div className="space-y-6">
      <GlassCard className="rounded-3xl p-7" animate={false}>
        <h3 className="font-display text-base font-semibold text-text-primary mb-1">Year One — Month by Month</h3>
        <p className="text-xs text-text-muted mb-4">Cumulative dollar impact as the policy takes effect.</p>
        <MonthlyTimeline data={a.timeline.monthly} height={320} />
      </GlassCard>

      <div className="grid lg:grid-cols-2 gap-6">
        <GlassCard className="rounded-3xl p-7" animate={false}>
          <h3 className="font-display text-base font-semibold text-text-primary mb-4">1 / 3 / 5-Year Cumulative</h3>
          <ProjectionBars year1={a.timeline.year1} year3={a.timeline.year3} year5={a.timeline.year5} height={280} />
        </GlassCard>

        <GlassCard className="rounded-3xl p-7" animate={false}>
          <h3 className="font-display text-base font-semibold text-text-primary mb-5">Milestones</h3>
          <div className="relative pl-6">
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
            {milestones.map((m, i) => (
              <div key={i} className="relative mb-5 last:mb-0">
                <div className={`absolute -left-[22px] top-0.5 w-3.5 h-3.5 rounded-full border-2 ${m.value >= 0 ? 'border-emerald-400 bg-emerald-400/20' : 'border-red-400 bg-red-400/20'}`} />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-primary font-medium">{m.label}</span>
                  <span className={`font-mono-data text-sm font-semibold ${m.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(m.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

// ----- Tab 4: Deep Dive -----
const SECTION_DEFS = [
  { key: 'housing', title: 'Housing', icon: Home },
  { key: 'employment', title: 'Employment', icon: Briefcase },
  { key: 'healthcare', title: 'Healthcare', icon: Heart },
  { key: 'retirement', title: 'Retirement', icon: PiggyBank },
  { key: 'education', title: 'Education', icon: GraduationCap },
  { key: 'tax', title: 'Taxes', icon: Landmark },
  { key: 'ripple', title: 'Ripple Effects', icon: Waves },
] as const;

function DeepDiveTab({ a }: { a: FullAnalysis }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ housing: true });

  function rows(key: string): { label: string; value: string; positive?: boolean }[] {
    switch (key) {
      case 'housing': return [
        { label: 'Monthly housing effect', value: `${money(a.housing.monthlyHousingEffect)}/mo`, positive: a.housing.monthlyHousingEffect >= 0 },
        { label: 'Property value change', value: pct(a.housing.propertyValueChangePct), positive: a.housing.propertyValueChangePct >= 0 },
        { label: 'Affordability index change', value: `${a.housing.affordabilityIndexChange >= 0 ? '+' : ''}${a.housing.affordabilityIndexChange}` },
        ...(a.housing.firstTimeBuyerImpact ? [{ label: 'First-time buyer', value: a.housing.firstTimeBuyerImpact }] : []),
      ];
      case 'employment': return [
        { label: 'Job security risk', value: `${a.employment.jobSecurityRisk}/100` },
        { label: 'Wage growth projection', value: pct(a.employment.wageGrowthPct), positive: a.employment.wageGrowthPct >= 0 },
        { label: 'Benefit change value', value: money(a.employment.benefitChangeValue), positive: a.employment.benefitChangeValue >= 0 },
        ...(a.employment.industryEffects ? [{ label: 'Industry effects', value: a.employment.industryEffects }] : []),
      ];
      case 'healthcare': return [
        { label: 'Monthly premium change', value: `${money(a.healthcare.monthlyPremiumChange)}/mo`, positive: a.healthcare.monthlyPremiumChange >= 0 },
        { label: 'Out-of-pocket max change', value: money(a.healthcare.outOfPocketMaxChange), positive: a.healthcare.outOfPocketMaxChange >= 0 },
        { label: 'Prescription cost change', value: money(a.healthcare.prescriptionCostChange), positive: a.healthcare.prescriptionCostChange >= 0 },
        ...(a.healthcare.coverageChange ? [{ label: 'Coverage', value: a.healthcare.coverageChange }] : []),
      ];
      case 'retirement': return [
        { label: '401k / IRA limit change', value: money(a.retirement.contributionLimitChange), positive: a.retirement.contributionLimitChange >= 0 },
        { label: 'Social Security change', value: money(a.retirement.socialSecurityChange), positive: a.retirement.socialSecurityChange >= 0 },
        { label: 'Retirement timeline', value: `${a.retirement.timelineImpactYears >= 0 ? '+' : ''}${a.retirement.timelineImpactYears} yrs`, positive: a.retirement.timelineImpactYears <= 0 },
      ];
      case 'education': return [
        { label: 'Student loan payment', value: `${money(a.education.studentLoanPaymentChange)}/mo`, positive: a.education.studentLoanPaymentChange >= 0 },
        { label: 'Tuition assistance change', value: money(a.education.tuitionAssistanceChange), positive: a.education.tuitionAssistanceChange >= 0 },
        { label: 'Child education cost change', value: money(a.education.childEducationCostChange), positive: a.education.childEducationCostChange >= 0 },
      ];
      case 'tax': return [
        { label: 'Federal liability change', value: money(a.tax.federalLiabilityChange), positive: a.tax.federalLiabilityChange >= 0 },
        { label: 'State liability change', value: money(a.tax.stateLiabilityChange), positive: a.tax.stateLiabilityChange >= 0 },
        { label: 'Effective rate', value: `${a.tax.effectiveRateBefore}% → ${a.tax.effectiveRateAfter}%`, positive: a.tax.effectiveRateAfter <= a.tax.effectiveRateBefore },
        ...(a.tax.bracketChange ? [{ label: 'Bracket', value: a.tax.bracketChange }] : []),
        ...(a.tax.deductionChanges ? [{ label: 'Deductions', value: a.tax.deductionChanges }] : []),
        ...(a.tax.creditChanges ? [{ label: 'Credits', value: a.tax.creditChanges }] : []),
      ];
      case 'ripple': return [
        { label: 'Inflation impact', value: pct(a.ripple.inflationImpactPct), positive: a.ripple.inflationImpactPct <= 0 },
        { label: 'Cost of living change', value: `${money(a.ripple.costOfLivingChange)}/yr`, positive: a.ripple.costOfLivingChange >= 0 },
        { label: 'Purchasing power change', value: `${money(a.ripple.purchasingPowerChange)}/yr`, positive: a.ripple.purchasingPowerChange >= 0 },
        ...(a.ripple.interestRateEffect ? [{ label: 'Interest rates on debt', value: a.ripple.interestRateEffect }] : []),
      ];
      default: return [];
    }
  }

  return (
    <div className="space-y-4">
      {SECTION_DEFS.map(({ key, title, icon: Icon }) => {
        const isOpen = !!open[key];
        return (
          <GlassCard key={key} className="rounded-2xl overflow-hidden" animate={false}>
            <button onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} className="w-full flex items-center gap-3 p-5 text-left">
              <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <span className="font-display font-semibold text-text-primary flex-1">{title}</span>
              <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="px-5 pb-5">
                <div className="border-t border-white/8 pt-2">
                  {rows(key).map((r, i) => <StatRow key={i} {...r} />)}
                </div>
              </motion.div>
            )}
          </GlassCard>
        );
      })}
    </div>
  );
}

// ----- Tab 5: Action Plan -----
const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-500/10 border-red-500/20 text-red-400',
  medium: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  low: 'bg-white/5 border-white/10 text-text-muted',
};

function resourceLinks(category: string, billNumber: string) {
  const links: { label: string; url: string }[] = [
    { label: billNumber ? `Track ${billNumber} on Congress.gov` : 'Search Congress.gov', url: billNumber ? `https://www.congress.gov/search?q=${encodeURIComponent(billNumber)}` : 'https://www.congress.gov' },
  ];
  const c = category.toLowerCase();
  if (c.includes('tax')) links.push({ label: 'IRS — Tax updates', url: 'https://www.irs.gov/newsroom' });
  if (c.includes('health')) links.push({ label: 'HealthCare.gov', url: 'https://www.healthcare.gov' });
  if (c.includes('hous')) links.push({ label: 'HUD — Housing programs', url: 'https://www.hud.gov' });
  if (c.includes('retire')) links.push({ label: 'SSA — Benefits', url: 'https://www.ssa.gov' });
  if (c.includes('educat')) links.push({ label: 'Federal Student Aid', url: 'https://studentaid.gov' });
  links.push({ label: 'Benefits.gov — Eligibility', url: 'https://www.benefits.gov' });
  return links;
}

function ActionTab({ a }: { a: FullAnalysis }) {
  const storageKey = `politicon:checklist:${a.policyId}`;
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setChecked(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [storageKey]);

  const toggle = useCallback((i: number) => {
    setChecked((prev) => {
      const next = { ...prev, [i]: !prev[i] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  const doneCount = a.recommendations.filter((_, i) => checked[i]).length;
  const links = resourceLinks(a.category, a.billNumber);

  return (
    <div className="space-y-6">
      <GlassCard className="rounded-3xl p-7" animate={false}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-base font-semibold text-text-primary">Your Action Plan</h3>
          <span className="text-xs font-mono-data text-text-muted">{doneCount}/{a.recommendations.length} done</span>
        </div>
        <div className="space-y-3">
          {a.recommendations.map((r, i) => (
            <button key={i} onClick={() => toggle(i)}
              className={`w-full flex items-start gap-3 p-4 rounded-2xl text-left transition-all ${checked[i] ? 'glass opacity-60' : 'glass hover:border-white/16'}`}>
              <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${checked[i] ? 'bg-primary border-primary' : 'border-white/20'}`}>
                {checked[i] && <Check className="w-3.5 h-3.5 text-white" />}
              </span>
              <span className="flex-1">
                <span className={`text-sm ${checked[i] ? 'line-through text-text-muted' : 'text-text-primary'}`}>{r.step}</span>
              </span>
              <span className={`text-[10px] font-mono-data uppercase px-2 py-0.5 rounded-full border flex-shrink-0 ${PRIORITY_STYLES[r.priority]}`}>{r.priority}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="rounded-3xl p-7" animate={false}>
        <h3 className="font-display text-base font-semibold text-text-primary mb-2 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" /> Things that could change this projection
        </h3>
        <ul className="space-y-2 mb-6">
          {a.riskFactors.uncertainties.map((u, i) => (
            <li key={i} className="text-sm text-text-muted flex items-start gap-2">
              <span className="text-primary mt-1">•</span><span>{u}</span>
            </li>
          ))}
        </ul>
        <h3 className="font-display text-base font-semibold text-text-primary mb-3">Government resources</h3>
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 glass hover:border-white/16 text-text-muted hover:text-text-primary px-3 py-2 rounded-xl text-xs transition-all">
              <ExternalLink className="w-3 h-3" /> {l.label}
            </a>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
