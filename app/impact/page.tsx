'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, ChevronDown, ChevronUp, ArrowUpDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { mockPolicies } from '@/mocks/policies';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';

const categoryBreakdown = [
  { cat: 'Housing', value: 3750, pct: 58, color: '#F5C842' },
  { cat: 'Healthcare', value: 2160, pct: 34, color: '#00D4FF' },
  { cat: 'Taxes', value: 850, pct: 13, color: '#7B61FF' },
  { cat: 'Education', value: -1020, pct: 16, color: '#10B981' },
  { cat: 'Employment', value: 680, pct: 11, color: '#8B5CF6' },
];

const methodology = [
  { q: 'How are dollar amounts calculated?', a: 'We use publicly available policy data combined with your income bracket, filing status, location, and life situation. Every calculation is based on CBO, IRS, and academic economic models with transparency into assumptions.' },
  { q: 'What does "net annual impact" mean?', a: 'The sum of all positive and negative policy effects across your tracked policies, normalized to an annual dollar figure. Monthly figures are multiplied by 12.' },
  { q: 'How confident are these estimates?', a: 'Each policy has a confidence score (high/medium/low) based on how far along in the legislative process it is and how well-documented its effects are. Proposed policies carry more uncertainty than enacted laws.' },
  { q: 'Do you account for indirect effects?', a: 'Yes. Our AI identifies both immediate (direct tax/benefit changes) and ripple effects (inflation, employment shifts, market reactions) where data supports those estimates.' },
];

export default function ImpactPage() {
  const [expandedMethod, setExpandedMethod] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'impact' | 'date'>('impact');

  const netAnnual = categoryBreakdown.reduce((sum, c) => sum + c.value, 0);

  const sortedPolicies = [...mockPolicies.slice(0, 6)].sort((a, b) => {
    if (sortBy === 'impact') {
      const aImpact = a.impacts[0]?.value || 0;
      const bImpact = b.impacts[0]?.value || 0;
      return Math.abs(bImpact) - Math.abs(aImpact);
    }
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-10">
            <div>
              <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Cumulative Impact Dashboard</h1>
              <p className="text-text-muted">Your total net financial impact across all tracked policies.</p>
            </div>
            <button className="flex items-center gap-2 glass border border-white/8 hover:border-white/16 text-text-muted hover:text-text-primary px-5 py-3 rounded-xl text-sm transition-all">
              <Download className="w-4 h-4" /> Export summary
            </button>
          </motion.div>

          {/* Hero net impact */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="glass-strong rounded-3xl p-10 mb-8 relative overflow-hidden text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-gold/8 via-transparent to-primary/8" />
            <div className="relative z-10">
              <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-4">Net Annual Impact</p>
              <div className="font-mono-data text-6xl sm:text-7xl font-bold gradient-text-gold mb-3">
                {netAnnual > 0 ? '+' : ''}<AnimatedCounter end={netAnnual} prefix="$" duration={2200} />
              </div>
              <p className="text-text-muted">per year, across {mockPolicies.slice(0, 6).length} tracked policies</p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Category breakdown */}
            <GlassCard className="rounded-3xl p-7">
              <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Breakdown by Category</h2>
              <div className="space-y-5">
                {categoryBreakdown.map((item, i) => (
                  <motion.div key={item.cat} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-text-primary font-medium">{item.cat}</span>
                      <span className={`font-mono-data text-sm font-bold ${
                        item.value > 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>{item.value > 0 ? '+' : ''}${Math.abs(item.value).toLocaleString()}/yr</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/6 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: item.color + (item.value < 0 ? '70' : 'CC') }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${item.pct}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: i * 0.1, ease: 'easeOut' }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </GlassCard>

            {/* Projections */}
            <GlassCard className="rounded-3xl p-7">
              <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Impact Projections</h2>
              <div className="space-y-4">
                {[
                  { year: '1 Year', amount: netAnnual, label: 'Current trajectory' },
                  { year: '3 Years', amount: Math.round(netAnnual * 3.2), label: 'With compounding effects' },
                  { year: '5 Years', amount: Math.round(netAnnual * 5.8), label: 'Full policy maturation' },
                ].map((proj, i) => (
                  <div key={proj.year} className="flex items-center gap-4 p-4 glass rounded-2xl">
                    <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-mono-data text-primary font-bold">{proj.year.split(' ')[0]}<br />yr{i > 0 ? 's' : ''}</span>
                    </div>
                    <div className="flex-1">
                      <p className={`font-mono-data text-xl font-bold ${
                        proj.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>{proj.amount >= 0 ? '+' : ''}${Math.abs(proj.amount).toLocaleString()}</p>
                      <p className="text-xs text-text-muted">{proj.label}</p>
                    </div>
                    {proj.amount >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* Policy tracker */}
          <GlassCard className="rounded-3xl p-7 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold text-text-primary">Policy Tracker</h2>
              <button onClick={() => setSortBy(s => s === 'impact' ? 'date' : 'impact')}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary glass px-3 py-2 rounded-xl transition-all">
                <ArrowUpDown className="w-3 h-3" /> Sort by {sortBy === 'impact' ? 'date' : 'impact'}
              </button>
            </div>
            <div className="space-y-3">
              {sortedPolicies.map((policy, i) => {
                const impact = policy.impacts[0];
                return (
                  <div key={policy.id} className="flex items-center justify-between gap-4 p-4 glass rounded-2xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{policy.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="default">{policy.category}</Badge>
                        <span className="text-[10px] text-text-muted">{policy.date}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`font-mono-data text-sm font-bold ${
                        impact.direction === 'positive' ? 'text-emerald-400' : impact.direction === 'negative' ? 'text-red-400' : 'text-text-muted'
                      }`}>
                        {impact.direction === 'positive' ? '+' : ''}{impact.value}{impact.unit}
                      </p>
                      <p className="text-[10px] text-text-muted">{impact.label}</p>
                    </div>
                    {impact.direction === 'positive' ? <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" /> :
                     impact.direction === 'negative' ? <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" /> :
                     <Minus className="w-4 h-4 text-text-muted flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* Methodology */}
          <GlassCard className="rounded-3xl p-7">
            <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Methodology & Transparency</h2>
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
        </main>
      </div>
    </div>
  );
}
