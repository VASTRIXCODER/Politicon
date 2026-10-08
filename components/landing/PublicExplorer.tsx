import { ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import Reveal from './Reveal';

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
] as const;

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

export default function PublicExplorer() {
  return (
    <section aria-labelledby="explorer-teaser-heading" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-12">
          <p className="text-xs font-mono-data text-gold uppercase tracking-widest mb-4">No Login Required</p>
          <h2 id="explorer-teaser-heading" className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            Policy impact by
            <span className="gradient-text-gold"> income bracket</span>
          </h2>
          <p className="text-text-muted text-lg max-w-xl mx-auto">
            Average impact score for top policies across income brackets. Sign up to see your personalized numbers.
          </p>
        </Reveal>

        <Reveal delay={200} className="glass-strong rounded-3xl p-8">
          {/* Legend */}
          <ul className="flex flex-wrap gap-6 mb-8 justify-center" aria-label="Categories">
            {categories.map(cat => (
              <li key={cat.key} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} aria-hidden="true" />
                <span className="text-xs text-text-muted">{cat.label}</span>
              </li>
            ))}
          </ul>

          {/* Chart */}
          <div className="space-y-6">
            {brackets.map((bracket, i) => (
              <Reveal key={bracket.label} from="left" delay={i * 80}>
                <p className="text-xs font-mono-data text-text-muted mb-2" id={`bracket-${i}`}>{bracket.label}</p>
                <ul className="flex gap-1.5" aria-labelledby={`bracket-${i}`}>
                  {categories.map(cat => {
                    const raw = bracket[cat.key];
                    const pct = Math.max(5, Math.abs(raw));
                    return (
                      <li key={cat.key} className="flex-1">
                        <div className="h-6 rounded-md bg-white/4 overflow-hidden" aria-hidden="true">
                          {/* Grows in with its row (see Reveal's group). */}
                          <div
                            className="h-full rounded-md origin-left group-data-[reveal=hidden]/reveal:scale-x-0 group-data-[reveal=shown]/reveal:transition-transform group-data-[reveal=shown]/reveal:duration-700 group-data-[reveal=shown]/reveal:ease-out"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: cat.color + (raw < 0 ? '60' : '99'),
                              transitionDelay: `${i * 60 + 300}ms`,
                            }}
                          />
                        </div>
                        <p className="text-meta text-text-muted text-center mt-1">
                          <span className="sr-only">{cat.label}: </span>{signed(raw)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </Reveal>
            ))}
          </div>

          <div className="border-t border-white/6 mt-8 pt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-muted">Based on top 10 policies by impact magnitude. Average across all states.</p>
            <Button
              href="/explorer"
              variant="link"
              icon={<ArrowRight className="w-3 h-3" />}
              iconPosition="end"
              className="text-xs gap-1.5"
            >
              Full explorer
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
