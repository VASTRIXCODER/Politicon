'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight, ChevronRight, Lock } from 'lucide-react';
import Button from '@/components/ui/Button';

type Teaser = { label: string; impact: string; direction: 'positive' | 'negative' };

const teaserPolicies: Record<string, Teaser> = {
  'student loan': { label: 'Student Loan Rate Cut', impact: '-$85/month on payments', direction: 'positive' },
  'minimum wage': { label: 'Minimum Wage to $17/hr', impact: '+$20,280/year if full-time', direction: 'positive' },
  'homebuyer': { label: 'First-Time Homebuyer Credit', impact: '+$15,000 tax credit', direction: 'positive' },
  'healthcare': { label: 'ACA Subsidy Extension', impact: '-$2,160/year in premiums', direction: 'positive' },
  'capital gains': { label: 'Capital Gains Tax Increase', impact: '-$340/month for investors', direction: 'negative' },
  'child tax': { label: 'Child Tax Credit Expansion', impact: '+$3,600 per child/year', direction: 'positive' },
  'clean energy': { label: 'Clean Energy Job Training', impact: '$52,000 avg starting salary', direction: 'positive' },
};

/** The hero's policy search and its teaser result (the only interactive part of the hero). */
export default function HeroSearch() {
  const [query, setQuery] = useState('');
  const [teaser, setTeaser] = useState<Teaser | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const lower = query.toLowerCase();
    let found: Teaser | null = null;
    for (const [key, val] of Object.entries(teaserPolicies)) {
      if (lower.includes(key)) { found = val; break; }
    }
    setTeaser(found || { label: query, impact: 'Sign up to see your personalized analysis', direction: 'positive' });
  };

  return (
    <div className="mb-6">
      <form onSubmit={handleSearch} role="search" className="relative">
        <label htmlFor="hero-policy-search" className="sr-only">Search a policy</label>
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-4 h-4 text-text-muted" aria-hidden="true" />
          <input
            id="hero-policy-search"
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Try &quot;student loan rate cut&quot; or &quot;minimum wage&quot;..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="input-glass w-full pl-11 pr-32 py-4 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            icon={<ArrowRight className="w-3.5 h-3.5" />}
            iconPosition="end"
            className="absolute right-2 rounded-lg gap-1.5"
          >
            Analyze
          </Button>
        </div>
      </form>

      {/* Teaser result, announced when it appears */}
      <div role="status">
        <AnimatePresence>
          {teaser && (
            <m.div
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
                    teaser.direction === 'positive' ? 'text-positive' : 'text-negative'
                  }`}>
                    {teaser.impact}
                  </p>
                  <p className="text-xs text-text-muted mt-1">Avg impact based on your bracket</p>
                </div>
                <Lock className="w-4 h-4 text-text-muted flex-shrink-0 mt-1" aria-hidden="true" />
              </div>

              {/* Blur overlay */}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface/90 to-transparent flex items-end justify-center pb-3">
                <Button
                  href="/auth/signup"
                  variant="link"
                  icon={<ChevronRight className="w-3 h-3" />}
                  iconPosition="end"
                  className="text-xs gap-1"
                >
                  Sign up to see your full personalized analysis
                </Button>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
