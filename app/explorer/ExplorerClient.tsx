'use client';

import { useState } from 'react';
import { BarChart2 } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Reveal from '@/components/landing/Reveal';

const brackets = [
  { label: 'Under $25k', data: { taxes: 18, healthcare: 52, housing: 12, employment: 22 } },
  { label: '$25k – $50k', data: { taxes: 28, healthcare: 41, housing: 28, employment: 35 } },
  { label: '$50k – $75k', data: { taxes: 48, healthcare: 32, housing: 52, employment: 48 } },
  { label: '$75k – $100k', data: { taxes: 58, healthcare: 22, housing: 68, employment: 55 } },
  { label: '$100k+', data: { taxes: 72, healthcare: 14, housing: 82, employment: 64 } },
];

// `textColor` is the pill's label colour on its own tint (all at least 4.5:1);
// the brand violet is too dark for small text there, so Taxes uses primary-300.
const categories = [
  { key: 'taxes', label: 'Taxes', color: '#7B61FF', textColor: '#A996FF', avgImpact: '+$612/yr' },
  { key: 'healthcare', label: 'Healthcare', color: '#00D4FF', textColor: '#00D4FF', avgImpact: '-$1,800/yr' },
  { key: 'housing', label: 'Housing', color: '#F5C842', textColor: '#F5C842', avgImpact: '+$3,750 (one-time)' },
  { key: 'employment', label: 'Employment', color: '#10B981', textColor: '#10B981', avgImpact: '+$2,100/yr' },
] as const;

type CategoryKey = (typeof categories)[number]['key'];

/** The category filter and bracket chart: the only interactive part of /explorer. */
export default function ExplorerClient() {
  const [selectedCat, setSelectedCat] = useState<CategoryKey | null>(null);

  const displayCats = selectedCat ? categories.filter(c => c.key === selectedCat) : categories;

  return (
    <>
      {/* Category filter pills (toggle buttons) */}
      <div role="group" aria-label="Filter by category" className="flex gap-3 mb-10 overflow-x-auto scrollbar-hide pb-2">
        <button
          type="button"
          aria-pressed={!selectedCat}
          onClick={() => setSelectedCat(null)}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
            !selectedCat ? 'bg-primary/20 border-primary/40 text-primary-300' : 'bg-white/4 border-white/8 text-text-muted hover:text-text-primary'
          }`}
        >
          All categories
        </button>
        {categories.map(cat => {
          const selected = selectedCat === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelectedCat(selected ? null : cat.key)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                selected ? 'text-text-primary' : 'bg-white/4 border-white/8 text-text-muted hover:text-text-primary'
              }`}
              style={selected ? { backgroundColor: cat.color + '20', borderColor: cat.color + '50', color: cat.textColor } : undefined}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Main chart */}
      <GlassCard animate={false} className="rounded-3xl p-8 mb-12">
        <div className="flex items-center gap-3 mb-8">
          <BarChart2 className="w-5 h-5 text-primary" aria-hidden="true" />
          <h2 className="font-display text-xl font-semibold text-text-primary">Policy Impact by Income Bracket</h2>
        </div>

        {/* Legend */}
        <ul className="flex flex-wrap gap-6 mb-8" aria-label="Average impact by category">
          {displayCats.map(cat => (
            <li key={cat.key} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} aria-hidden="true" />
              <span className="text-xs text-text-muted">{cat.label}</span>
              <span className="text-xs font-mono-data text-text-primary">{cat.avgImpact}</span>
            </li>
          ))}
        </ul>

        {/* Bars */}
        <div className="space-y-8">
          {brackets.map((bracket, i) => (
            <Reveal key={bracket.label} from="left" delay={i * 80}>
              <p className="text-sm font-medium text-text-primary mb-3" id={`explorer-bracket-${i}`}>{bracket.label}</p>
              <ul className="flex gap-2" aria-labelledby={`explorer-bracket-${i}`}>
                {displayCats.map(cat => {
                  const pct = bracket.data[cat.key];
                  return (
                    <li key={cat.key} className="flex-1">
                      <div className="h-8 rounded-lg bg-white/4 overflow-hidden relative" aria-hidden="true">
                        {/* Grows in with its row (see Reveal's group). */}
                        <div
                          className="h-full rounded-lg origin-left group-data-[reveal=hidden]/reveal:scale-x-0 group-data-[reveal=shown]/reveal:transition-transform group-data-[reveal=shown]/reveal:duration-700 group-data-[reveal=shown]/reveal:ease-out"
                          style={{ width: `${pct}%`, backgroundColor: cat.color + 'AA', transitionDelay: `${i * 60 + 200}ms` }}
                        />
                      </div>
                      <p className="text-meta text-text-muted text-center mt-1">
                        <span className="sr-only">{cat.label}: </span>{pct}%
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          ))}
        </div>
      </GlassCard>
    </>
  );
}
