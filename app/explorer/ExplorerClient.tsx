'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, BarChart2, TrendingUp, TrendingDown } from 'lucide-react';
import { mockPolicies } from '@/mocks/policies';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import AmbientBackground from '@/components/landing/AmbientBackground';

const brackets = [
  { label: 'Under $25k', data: { taxes: 18, healthcare: 52, housing: 12, employment: 22 } },
  { label: '$25k – $50k', data: { taxes: 28, healthcare: 41, housing: 28, employment: 35 } },
  { label: '$50k – $75k', data: { taxes: 48, healthcare: 32, housing: 52, employment: 48 } },
  { label: '$75k – $100k', data: { taxes: 58, healthcare: 22, housing: 68, employment: 55 } },
  { label: '$100k+', data: { taxes: 72, healthcare: 14, housing: 82, employment: 64 } },
];

const categories = [
  { key: 'taxes', label: 'Taxes', color: '#7B61FF', avgImpact: '+$612/yr' },
  { key: 'healthcare', label: 'Healthcare', color: '#00D4FF', avgImpact: '-$1,800/yr' },
  { key: 'housing', label: 'Housing', color: '#F5C842', avgImpact: '+$3,750 (one-time)' },
  { key: 'employment', label: 'Employment', color: '#10B981', avgImpact: '+$2,100/yr' },
];

export default function ExplorerClient() {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const displayCats = selectedCat ? categories.filter(c => c.key === selectedCat) : categories;

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="gold">No login required</Badge>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
              Public Impact Explorer
            </h1>
            <p className="text-text-muted text-lg max-w-2xl">
              Average financial impact of the top 10 US policies across income brackets. Sign up to see your personalized numbers.
            </p>
          </motion.div>

          {/* Category filter pills */}
          <div className="flex gap-3 mb-10 overflow-x-auto pb-2">
            <button onClick={() => setSelectedCat(null)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                !selectedCat ? 'bg-primary/20 border-primary/40 text-primary' : 'glass border-white/8 text-text-muted'
              }`}>All categories</button>
            {categories.map(cat => (
              <button key={cat.key} onClick={() => setSelectedCat(selectedCat === cat.key ? null : cat.key)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                  selectedCat === cat.key ? 'border-white/30 text-text-primary' : 'glass border-white/8 text-text-muted'
                }`} style={selectedCat === cat.key ? { backgroundColor: cat.color + '20', borderColor: cat.color + '50', color: cat.color } : {}}>
                {cat.label}
              </button>
            ))}
          </div>

          {/* Main chart */}
          <GlassCard className="rounded-3xl p-8 mb-12">
            <div className="flex items-center gap-3 mb-8">
              <BarChart2 className="w-5 h-5 text-primary" />
              <h2 className="font-display text-xl font-semibold text-text-primary">Policy Impact by Income Bracket</h2>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-6 mb-8">
              {displayCats.map(cat => (
                <div key={cat.key} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} />
                  <span className="text-xs text-text-muted">{cat.label}</span>
                  <span className="text-xs font-mono-data text-text-primary">{cat.avgImpact}</span>
                </div>
              ))}
            </div>

            {/* Bars */}
            <div className="space-y-8">
              {brackets.map((bracket, i) => (
                <motion.div key={bracket.label}
                  initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                  <p className="text-sm font-medium text-text-primary mb-3">{bracket.label}</p>
                  <div className="flex gap-2">
                    {displayCats.map(cat => {
                      const pct = bracket.data[cat.key as keyof typeof bracket.data];
                      return (
                        <div key={cat.key} className="flex-1">
                          <div className="h-8 rounded-lg bg-white/4 overflow-hidden relative">
                            <motion.div className="h-full rounded-lg"
                              style={{ backgroundColor: cat.color + 'AA' }}
                              initial={{ width: 0 }} whileInView={{ width: `${pct}%` }}
                              viewport={{ once: true }} transition={{ duration: 0.8, delay: i * 0.06 + 0.2, ease: 'easeOut' }} />
                          </div>
                          <p className="text-[9px] text-text-muted text-center mt-1">{pct}%</p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          </GlassCard>

          {/* Top policies table */}
          <div className="mb-12">
            <h2 className="font-display text-2xl font-bold text-text-primary mb-6">Top 8 Policies by Average Impact</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mockPolicies.map((policy, i) => {
                const impact = policy.impacts[0];
                return (
                  <GlassCard key={policy.id} delay={i * 0.06} className="rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="default">{policy.category}</Badge>
                          <span className="text-[10px] text-text-muted">{policy.region}</span>
                        </div>
                        <h3 className="text-sm font-medium text-text-primary leading-snug">{policy.title}</h3>
                        <p className="text-[11px] text-text-muted mt-1 line-clamp-2">{policy.summary}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1 justify-end">
                          {impact.direction === 'positive' ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                          <p className={`font-mono-data text-sm font-bold ${
                            impact.direction === 'positive' ? 'text-emerald-400' : 'text-red-400'
                          }`}>{impact.value > 0 ? '+' : ''}{impact.value}{impact.unit.length <= 5 ? impact.unit : ''}</p>
                        </div>
                        <p className="text-[10px] text-text-muted">{impact.label}</p>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>

          {/* CTA */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="glass-strong rounded-3xl p-10 text-center">
            <p className="text-xs font-mono-data text-primary uppercase tracking-widest mb-4">Go deeper</p>
            <h2 className="font-display text-3xl font-bold text-text-primary mb-4">
              See your <span className="gradient-text">personalized numbers</span>
            </h2>
            <p className="text-text-muted mb-8 max-w-lg mx-auto">
              These are averages. Sign up free and get impact calculations specific to your income, state, family situation, and financial profile.
            </p>
            <Link href="/auth/signup">
              <button className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-8 py-4 rounded-2xl font-medium transition-colors">
                Get my personalized report <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </motion.div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
