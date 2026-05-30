'use client';

import { motion } from 'framer-motion';
import { Share2, Download } from 'lucide-react';
import Link from 'next/link';

const exampleCards = [
  {
    policy: 'Student Loan Rate Adjustment',
    impact: '-$85/month',
    annual: '-$1,020/year',
    direction: 'positive' as const,
    category: 'Education',
    gradient: 'from-primary/20 to-secondary/10',
    borderColor: 'border-primary/20',
  },
  {
    policy: 'First-Time Homebuyer Credit',
    impact: '+$15,000',
    annual: 'One-time credit',
    direction: 'positive' as const,
    category: 'Housing',
    gradient: 'from-emerald-500/20 to-emerald-500/5',
    borderColor: 'border-emerald-500/20',
  },
  {
    policy: 'Capital Gains Tax Increase',
    impact: '-$340/month',
    annual: '-$4,080/year',
    direction: 'negative' as const,
    category: 'Taxes',
    gradient: 'from-red-500/20 to-red-500/5',
    borderColor: 'border-red-500/15',
  },
];

export default function ShareableCards() {
  return (
    <section className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <p className="text-xs font-mono-data text-secondary uppercase tracking-widest mb-4">Share Your Impact</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            Your impact,
            <span className="gradient-text"> shareable in seconds</span>
          </h2>
          <p className="text-text-muted text-lg max-w-xl mx-auto">
            After any analysis, generate a branded card showing your dollar impact. Download as PNG or copy a link.
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-6 mb-12">
          {exampleCards.map((card, i) => (
            <motion.div
              key={card.policy}
              initial={{ opacity: 0, y: 24, rotate: i === 0 ? -3 : i === 2 ? 3 : 0 }}
              whileInView={{ opacity: 1, y: 0, rotate: i === 0 ? -2 : i === 2 ? 2 : 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: -8, rotate: 0, transition: { duration: 0.2 } }}
              className={`glass border ${card.borderColor} rounded-3xl p-6 w-64 relative overflow-hidden`}
            >
              {/* Background gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-50`} />

              <div className="relative z-10">
                {/* Logo */}
                <div className="flex items-center gap-1.5 mb-5">
                  <div className="w-5 h-5 rounded-md bg-primary/30 border border-primary/30 flex items-center justify-center">
                    <span className="text-primary text-[8px] font-bold">P</span>
                  </div>
                  <span className="text-[10px] font-display text-text-muted">Politicon</span>
                </div>

                <p className="text-[10px] font-mono-data text-text-muted uppercase tracking-wide mb-1">{card.category}</p>
                <p className="text-xs font-medium text-text-primary mb-4 leading-snug">{card.policy}</p>

                <div className={`font-mono-data text-2xl font-bold mb-1 ${
                  card.direction === 'positive' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {card.impact}
                </div>
                <p className="text-[10px] text-text-muted">{card.annual}</p>

                <div className="flex items-center gap-1.5 mt-5 pt-4 border-t border-white/6">
                  <Share2 className="w-3 h-3 text-text-muted" />
                  <span className="text-[10px] text-text-muted">politicon.com/impact</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary px-8 py-4 rounded-2xl text-sm font-medium transition-all"
          >
            <Download className="w-4 h-4" />
            Generate yours free
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
