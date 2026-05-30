'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight, ChevronRight, Lock } from 'lucide-react';
import Button from '@/components/ui/Button';
import ImpactCardDemo from './ImpactCardDemo';
import Link from 'next/link';

const headlineWords = ['Your', 'money.', 'Every', 'policy.', 'Crystal', 'clear.'];

const wordVariants = {
  hidden: { opacity: 0, y: 30, filter: 'blur(8px)' },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.5,
      delay: 0.4 + i * 0.08,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

const teaserPolicies: Record<string, { label: string; impact: string; direction: 'positive' | 'negative' }> = {
  'student loan': { label: 'Student Loan Rate Cut', impact: '-$85/month on payments', direction: 'positive' },
  'minimum wage': { label: 'Minimum Wage to $17/hr', impact: '+$20,280/year if full-time', direction: 'positive' },
  'homebuyer': { label: 'First-Time Homebuyer Credit', impact: '+$15,000 tax credit', direction: 'positive' },
  'healthcare': { label: 'ACA Subsidy Extension', impact: '-$2,160/year in premiums', direction: 'positive' },
  'capital gains': { label: 'Capital Gains Tax Increase', impact: '-$340/month for investors', direction: 'negative' },
  'child tax': { label: 'Child Tax Credit Expansion', impact: '+$3,600 per child/year', direction: 'positive' },
  'clean energy': { label: 'Clean Energy Job Training', impact: '$52,000 avg starting salary', direction: 'positive' },
};

export default function HeroSection() {
  const [query, setQuery] = useState('');
  const [teaser, setTeaser] = useState<{ label: string; impact: string; direction: 'positive' | 'negative' } | null>(null);
  const [showBlurred, setShowBlurred] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const lower = query.toLowerCase();
    let found = null;
    for (const [key, val] of Object.entries(teaserPolicies)) {
      if (lower.includes(key)) { found = val; break; }
    }
    setTeaser(found || { label: query, impact: 'Sign up to see your personalized analysis', direction: 'positive' });
    setShowBlurred(true);
  };

  return (
    <section className="relative min-h-screen flex items-center pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left content */}
          <div>
            {/* Pre-headline badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="inline-flex items-center gap-2 glass border border-primary/20 rounded-full px-4 py-2 mb-8"
            >
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-text-muted font-mono-data">AI-Powered Policy Analysis</span>
            </motion.div>

            {/* Headline */}
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] mb-6">
              {headlineWords.map((word, i) => (
                <motion.span
                  key={i}
                  custom={i}
                  variants={wordVariants}
                  initial="hidden"
                  animate="visible"
                  className={`inline-block mr-3 ${
                    word === 'Crystal' || word === 'clear.'
                      ? 'gradient-text'
                      : 'text-text-primary'
                  }`}
                >
                  {word}
                </motion.span>
              ))}
            </h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.0 }}
              className="text-text-muted text-lg leading-relaxed mb-8 max-w-lg"
            >
              Not political opinion — just the dollar answer to “what does this policy actually cost or save me?”
              Personalized to your income, location, and life situation.
            </motion.p>

            {/* Search bar */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.1 }}
              className="mb-6"
            >
              <form onSubmit={handleSearch} className="relative">
                <div className="relative flex items-center">
                  <Search className="absolute left-4 w-4 h-4 text-text-muted" />
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Try &quot;student loan rate cut&quot; or &quot;minimum wage&quot;..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="input-glass w-full pl-11 pr-32 py-4 text-sm"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                  >
                    Analyze <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>

              {/* Teaser result */}
              <AnimatePresence>
                {showBlurred && teaser && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.25 }}
                    className="mt-3 glass rounded-2xl p-5 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs text-text-muted mb-1 font-mono-data">{teaser.label}</p>
                        <p className={`text-xl font-bold font-mono-data ${
                          teaser.direction === 'positive' ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {teaser.impact}
                        </p>
                        <p className="text-xs text-text-muted mt-1">Avg impact based on your bracket</p>
                      </div>
                      <Lock className="w-4 h-4 text-text-muted flex-shrink-0 mt-1" />
                    </div>

                    {/* Blur overlay */}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface/90 to-transparent flex items-end justify-center pb-3">
                      <Link href="/auth/signup">
                        <button className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                          Sign up to see your full personalized analysis <ChevronRight className="w-3 h-3" />
                        </button>
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.2 }}
              className="flex flex-wrap gap-3"
            >
              <Link href="/auth/signup">
                <Button variant="primary" size="lg" icon={<ArrowRight className="w-4 h-4" />}>
                  Get My Impact Report
                </Button>
              </Link>
              <Link href="/explorer">
                <Button variant="ghost" size="lg">
                  Explore Public Data
                </Button>
              </Link>
            </motion.div>

            {/* Trust signals */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.4 }}
              className="flex items-center gap-6 mt-8"
            >
              {[
                { stat: '2,400+', label: 'Policies tracked' },
                { stat: '$4,200', label: 'Avg annual impact found' },
                { stat: '50', label: 'States covered' },
              ].map(item => (
                <div key={item.label}>
                  <p className="font-mono-data text-sm font-semibold text-primary">{item.stat}</p>
                  <p className="text-xs text-text-muted">{item.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: Floating impact card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(12px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.7, delay: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="hidden lg:flex justify-center items-center"
          >
            <ImpactCardDemo />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
