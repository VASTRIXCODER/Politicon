'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, X, ChevronRight, GitCompare, ExternalLink, CheckCircle2 } from 'lucide-react';
import { mockPolicies } from '@/mocks/policies';
import { Policy, PolicyCategory } from '@/types';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';
import { getStatusColor, getCategoryIcon, formatCurrency } from '@/lib/utils';

const categories: PolicyCategory[] = ['All', 'Taxes', 'Healthcare', 'Housing', 'Employment', 'Education', 'Energy', 'Social Security'];

export default function PoliciesPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PolicyCategory>('All');
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareList, setCompareList] = useState<Policy[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState('');

  const filtered = mockPolicies.filter(p => {
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.tags.some(t => t.includes(search.toLowerCase()));
    const matchCat = category === 'All' || p.category === category;
    return matchSearch && matchCat;
  });

  const handleAnalyze = async (policy: Policy) => {
    setSelectedPolicy(policy);
    setAnalyzing(true);
    setAnalysis('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policyId: policy.id, policy }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || 'Analysis unavailable at this time.');
    } catch {
      setAnalysis('Unable to load analysis. Please try again.');
    }
    setAnalyzing(false);
  };

  const toggleCompare = (policy: Policy) => {
    setCompareList(prev => {
      if (prev.find(p => p.id === policy.id)) return prev.filter(p => p.id !== policy.id);
      if (prev.length >= 2) return [prev[1], policy];
      return [...prev, policy];
    });
  };

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
            <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Policy Analysis</h1>
            <p className="text-text-muted">Browse and analyze policies by their financial impact on your situation.</p>
          </motion.div>

          {/* Search + filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input type="text" placeholder="Search policies by name or tag..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-glass w-full pl-11 pr-4 py-3.5 text-sm" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={`flex items-center gap-2 px-5 py-3.5 rounded-xl border text-sm font-medium transition-all ${
                compareMode ? 'bg-secondary/15 border-secondary/30 text-secondary' : 'glass border-white/8 text-text-muted'
              }`}
            >
              <GitCompare className="w-4 h-4" /> Compare {compareMode && compareList.length > 0 ? `(${compareList.length}/2)` : ''}
            </button>
          </div>

          {/* Category filters */}
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                  category === cat ? 'bg-primary/20 border-primary/40 text-primary' : 'glass border-white/8 text-text-muted hover:text-text-primary'
                }`}>
                {cat === 'All' ? cat : `${getCategoryIcon(cat)} ${cat}`}
              </button>
            ))}
          </div>

          {/* Compare banner */}
          <AnimatePresence>
            {compareMode && compareList.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="glass border border-secondary/20 rounded-2xl p-4 mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GitCompare className="w-4 h-4 text-secondary" />
                  <span className="text-sm text-text-primary">
                    {compareList.length === 1 ? `"${compareList[0].title}" selected — pick one more` : `Comparing: ${compareList.map(p => p.title.split(' ').slice(0,3).join(' ')).join(' vs ')}`}
                  </span>
                </div>
                {compareList.length === 2 && (
                  <button className="text-xs bg-secondary/20 border border-secondary/30 text-secondary px-4 py-2 rounded-xl hover:bg-secondary/30 transition-all">
                    View comparison
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Policy grid */}
            <div className={`${selectedPolicy ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filtered.map((policy, i) => {
                  const mainImpact = policy.impacts[0];
                  const isSelected = selectedPolicy?.id === policy.id;
                  const inCompare = compareList.find(p => p.id === policy.id);

                  return (
                    <motion.div key={policy.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      onClick={() => !compareMode && handleAnalyze(policy)}
                      className={`glass rounded-2xl p-5 cursor-pointer transition-all ${
                        isSelected ? 'border-primary/40 shadow-lg' : 'hover:border-white/16'
                      } ${compareMode && inCompare ? 'border-secondary/40' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="default">{policy.category}</Badge>
                          <Badge variant={policy.status === 'enacted' ? 'success' : policy.status === 'proposed' ? 'warning' : 'primary'}>
                            {policy.status}
                          </Badge>
                        </div>
                        {compareMode && (
                          <button onClick={e => { e.stopPropagation(); toggleCompare(policy); }}
                            className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                              inCompare ? 'bg-secondary border-secondary' : 'border-white/20 hover:border-secondary'
                            }`}>
                            {inCompare && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                          </button>
                        )}
                      </div>

                      <h3 className="font-medium text-text-primary text-sm leading-snug mb-2">{policy.title}</h3>
                      <p className="text-[11px] text-text-muted line-clamp-2 mb-4">{policy.summary}</p>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`font-mono-data text-base font-bold ${
                            mainImpact.direction === 'positive' ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {mainImpact.direction === 'positive' ? '' : ''}{Math.abs(mainImpact.value)}{mainImpact.unit.length <= 4 ? mainImpact.unit : ''}
                          </p>
                          <p className="text-[10px] text-text-muted">{mainImpact.label}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-muted" />
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-text-muted">No policies match your search.</p>
                </div>
              )}
            </div>

            {/* Analysis drawer */}
            <AnimatePresence>
              {selectedPolicy && (
                <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.3 }}
                  className="glass-strong rounded-3xl p-6 h-fit sticky top-28">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <Badge variant="default" className="mb-2">{selectedPolicy.category}</Badge>
                      <h3 className="font-display text-lg font-semibold text-text-primary leading-snug">{selectedPolicy.title}</h3>
                    </div>
                    <button onClick={() => setSelectedPolicy(null)} className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0 ml-2">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Impact summary */}
                  <div className="space-y-3 mb-6">
                    {selectedPolicy.impacts.map(impact => (
                      <div key={impact.label} className="flex items-center justify-between">
                        <span className="text-xs text-text-muted">{impact.label}</span>
                        <span className={`font-mono-data text-sm font-semibold ${
                          impact.direction === 'positive' ? 'text-emerald-400' : 'text-red-400'
                        }`}>{impact.value}{impact.unit}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-white/8 pt-5">
                    <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">AI Analysis</p>
                    {analyzing ? (
                      <div className="space-y-2">
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className="h-3 rounded-full bg-white/6 animate-pulse" style={{ width: `${70 + Math.random() * 30}%` }} />
                        ))}
                        <p className="text-xs text-text-muted mt-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />Analyzing your profile...
                        </p>
                      </div>
                    ) : analysis ? (
                      <div className="text-xs text-text-muted leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">{analysis}</div>
                    ) : null}
                  </div>

                  <div className="flex gap-2 mt-6">
                    <a href={selectedPolicy.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 glass rounded-xl py-2.5 text-xs text-text-muted hover:text-text-primary transition-all">
                      Source <ExternalLink className="w-3 h-3" />
                    </a>
                    <button className="flex-1 bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary rounded-xl py-2.5 text-xs font-medium transition-all">
                      Save to Impact
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
