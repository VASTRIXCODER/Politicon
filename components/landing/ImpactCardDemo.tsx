'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp, BarChart2, Zap } from 'lucide-react';

const impacts = [
  {
    policy: 'Capital Gains Tax Increase',
    bracket: 'Mid-level investor • $120k income',
    monthly: '-$340/month',
    direction: 'negative' as const,
    bars: [
      { label: 'Tax on gains', pct: 72 },
      { label: 'Portfolio growth', pct: 54 },
      { label: 'Net take-home', pct: 38 },
    ],
    sparkline: [40, 42, 38, 44, 36, 38, 34, 30],
    color: '#EF4444',
  },
  {
    policy: 'First-Time Homebuyer Credit',
    bracket: 'First-time buyer • $75k income',
    monthly: '+$1,250/month equiv.',
    direction: 'positive' as const,
    bars: [
      { label: 'Tax credit', pct: 85 },
      { label: 'Affordability', pct: 68 },
      { label: 'Net savings', pct: 79 },
    ],
    sparkline: [30, 35, 38, 44, 50, 55, 62, 70],
    color: '#10B981',
  },
  {
    policy: 'Student Loan Rate Cut',
    bracket: 'Recent grad • $48k income',
    monthly: '-$85/month saved',
    direction: 'positive' as const,
    bars: [
      { label: 'Interest savings', pct: 65 },
      { label: 'Monthly relief', pct: 55 },
      { label: 'Lifetime impact', pct: 90 },
    ],
    sparkline: [60, 55, 58, 52, 48, 44, 40, 35],
    color: '#10B981',
  },
];

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const normalize = (v: number) => ((v - min) / (max - min)) * 36;

  const points = data.map((v, i) => `${(i / (data.length - 1)) * 120},${40 - normalize(v)}`).join(' ');

  return (
    <svg viewBox="0 0 120 44" className="w-full h-10" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.8"
      />
      <polyline
        points={`0,44 ${points} 120,44`}
        fill={color}
        opacity="0.08"
      />
    </svg>
  );
}

export default function ImpactCardDemo() {
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setIndex(i => (i + 1) % impacts.length), 4000);
    return () => clearInterval(id);
  }, []);

  const current = impacts[index];

  return (
    <div className="animate-float relative">
      {/* Glow behind card */}
      <div
        className="absolute inset-0 rounded-3xl blur-3xl opacity-30"
        style={{ background: `radial-gradient(circle, ${current.color}44 0%, transparent 70%)` }}
      />

      <div className="glass-strong rounded-3xl p-6 w-[360px] relative z-10 animate-pulse-glow">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-text-muted font-mono-data uppercase tracking-widest">AI Impact Analysis</p>
              <p className="text-xs text-text-primary font-medium">Politicon</p>
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        {/* Policy name */}
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-text-muted text-xs mb-1 font-mono-data">{current.bracket}</p>
          <h3 className="font-display text-sm font-semibold text-text-primary mb-1 leading-snug">
            {current.policy}
          </h3>

          {/* Big impact number */}
          <div className="flex items-baseline gap-2 mb-5">
            <span
              className="font-mono-data text-3xl font-bold"
              style={{ color: current.color }}
            >
              {current.monthly}
            </span>
            {current.direction === 'negative'
              ? <TrendingDown className="w-5 h-5" style={{ color: current.color }} />
              : <TrendingUp className="w-5 h-5" style={{ color: current.color }} />}
          </div>

          {/* Bar chart */}
          <div className="space-y-3 mb-5">
            {current.bars.map((bar, i) => (
              <div key={bar.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-text-muted font-mono-data">{bar.label}</span>
                  <span className="text-[10px] font-mono-data" style={{ color: current.color }}>{bar.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: current.color + '99' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${bar.pct}%` }}
                    transition={{ duration: 0.8, delay: i * 0.12, ease: 'easeOut' }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Sparkline */}
          <div className="border-t border-white/6 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart2 className="w-3 h-3 text-text-muted" />
              <span className="text-[10px] text-text-muted font-mono-data">12-month trend</span>
            </div>
            {mounted && <MiniSparkline data={current.sparkline} color={current.color} />}
          </div>
        </motion.div>

        {/* Pagination dots */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {impacts.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === index ? 'w-6 bg-primary' : 'w-1.5 bg-white/20'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
