'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const brackets = [
  { label: 'Under $25k', taxes: -12, healthcare: 48, housing: 22, employment: 8 },
  { label: '$25k–$50k', taxes: -8, healthcare: 38, housing: 18, employment: 14 },
  { label: '$50k–$75k', taxes: 15, healthcare: 28, housing: 35, employment: 25 },
  { label: '$75k–$100k', taxes: 22, healthcare: 18, housing: 48, employment: 32 },
  { label: '$100k+', taxes: -28, healthcare: 8, housing: 65, employment: 42 },
];

const categories = [
  { key: 'taxes', label: 'Taxes', color: '#7B61FF' },
  { key: 'healthcare', label: 'Healthcare', color: '#00D4FF' },
  { key: 'housing', label: 'Housing', color: '#F5C842' },
  { key: 'employment', label: 'Employment', color: '#10B981' },
];

export default function PublicExplorer() {
  return (
    <section className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-xs font-mono-data text-gold uppercase tracking-widest mb-4">No Login Required</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            Policy impact by
            <span className="gradient-text-gold"> income bracket</span>
          </h2>
          <p className="text-text-muted text-lg max-w-xl mx-auto">
            Average impact score for top policies across income brackets. Sign up to see your personalized numbers.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="glass-strong rounded-3xl p-8"
        >
          {/* Legend */}
          <div className="flex flex-wrap gap-6 mb-8 justify-center">
            {categories.map(cat => (
              <div key={cat.key} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} />
                <span className="text-xs text-text-muted">{cat.label}</span>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="space-y-6">
            {brackets.map((bracket, i) => (
              <motion.div
                key={bracket.label}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <p className="text-xs font-mono-data text-text-muted mb-2">{bracket.label}</p>
                <div className="flex gap-1.5">
                  {categories.map(cat => {
                    const raw = bracket[cat.key as keyof typeof bracket] as number;
                    const pct = Math.max(5, Math.abs(raw));
                    return (
                      <div key={cat.key} className="flex-1">
                        <div className="h-6 rounded-md bg-white/4 overflow-hidden">
                          <motion.div
                            className="h-full rounded-md"
                            style={{ backgroundColor: cat.color + (raw < 0 ? '60' : '99') }}
                            initial={{ width: 0 }}
                            whileInView={{ width: `${pct}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: i * 0.06 + 0.3, ease: 'easeOut' }}
                          />
                        </div>
                        <p className="text-[9px] text-text-muted text-center mt-1">
                          {raw > 0 ? '+' : ''}{raw}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>

          <div className="border-t border-white/6 mt-8 pt-6 flex items-center justify-between">
            <p className="text-xs text-text-muted">Based on top 10 policies by impact magnitude. Average across all states.</p>
            <Link
              href="/explorer"
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Full explorer <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
