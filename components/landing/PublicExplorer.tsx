import { ArrowRight, Info } from 'lucide-react';
import Button from '@/components/ui/Button';
import Reveal from './Reveal';
import { formatUSD, impactSign } from '@/lib/format';
import {
  BRACKET_ROWS,
  CATEGORIES,
  EXAMPLE_COUNT_LABEL,
  ILLUSTRATIVE_NOTE,
  UNIT_LABEL,
  divergingBar,
  type Category,
} from '@/lib/explorerData';

const VALUE_TONE = { gain: 'text-positive', loss: 'text-negative', neutral: 'text-text-muted' } as const;

/** The required "these are examples" note, shown with every view of the explorer data. */
export function IllustrativeNote({ className = '' }: { className?: string }) {
  return (
    <p className={`inline-flex items-start gap-2 rounded-xl border border-gold/20 bg-gold/10 px-3 py-2 text-xs text-gold ${className}`}>
      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
      <span>{ILLUSTRATIVE_NOTE}</span>
    </p>
  );
}

/**
 * The illustrative dataset as diverging bars: one row per income bracket, one
 * cell per category, gains to the right of the zero line and costs to the
 * left. Shared by the landing teaser and /explorer, so both always draw the
 * same numbers on the same scale.
 */
export function BracketChart({
  categories = CATEGORIES,
  idPrefix,
  size = 'sm',
}: {
  categories?: readonly Category[];
  /** Prefix for the bracket label ids (unique per page). */
  idPrefix: string;
  size?: 'sm' | 'md';
}) {
  const columns = { gridTemplateColumns: `repeat(${categories.length}, minmax(0, 1fr))` };
  const md = size === 'md';
  const track = md ? 'h-8 rounded-lg' : 'h-6 rounded-md';
  const gainBar = `left-1/2 origin-left bg-positive/70 ${md ? 'rounded-r-lg' : 'rounded-r-md'}`;
  const lossBar = `right-1/2 origin-right bg-negative/70 ${md ? 'rounded-l-lg' : 'rounded-l-md'}`;

  return (
    <div>
      {/* How to read it */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 mb-6 text-meta text-text-muted">
        <ul className="flex flex-wrap items-center gap-4" aria-label="Key">
          <li className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-negative/70" aria-hidden="true" />
            Left of the line: costs the household
          </li>
          <li className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-positive/70" aria-hidden="true" />
            Right: household gains
          </li>
        </ul>
        <p className="font-mono-data">Net per category, {UNIT_LABEL}</p>
      </div>

      {/* Column headings (visual only: each value names its category for screen readers) */}
      <div aria-hidden="true" className="grid gap-1.5 mb-1" style={columns}>
        {categories.map(cat => (
          <p key={cat.key} className="text-meta text-text-muted text-center truncate">{cat.label}</p>
        ))}
      </div>

      <div className="space-y-5">
        {BRACKET_ROWS.map((row, i) => (
          <Reveal key={row.key} from="left" delay={i * 80}>
            <p className="text-xs font-mono-data text-text-primary mb-2" id={`${idPrefix}-${row.key}`}>{row.label}</p>
            <ul className="grid gap-1.5" style={columns} aria-labelledby={`${idPrefix}-${row.key}`}>
              {categories.map(cat => {
                const amount = row.totals[cat.key];
                const bar = divergingBar(amount);
                return (
                  <li key={cat.key}>
                    <div className={`relative overflow-hidden bg-white/4 ${track}`} aria-hidden="true">
                      {/* Zero line */}
                      <div className="absolute inset-y-0 left-1/2 w-px bg-white/16" />
                      {bar.width > 0 && (
                        // Grows out from the zero line with its row (see Reveal's group).
                        <div
                          className={`absolute inset-y-0 group-data-[reveal=hidden]/reveal:scale-x-0 group-data-[reveal=shown]/reveal:transition-transform group-data-[reveal=shown]/reveal:duration-700 group-data-[reveal=shown]/reveal:ease-out ${
                            bar.sign === 'gain' ? gainBar : lossBar
                          }`}
                          style={{ width: `${bar.width}%`, transitionDelay: `${i * 60 + 300}ms` }}
                        />
                      )}
                    </div>
                    <p className={`text-meta font-mono-data text-center mt-1 ${VALUE_TONE[impactSign(amount)]}`}>
                      <span className="sr-only">{cat.label}: </span>
                      {formatUSD(amount, { signed: true })}
                      <span className="sr-only"> per year</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

export default function PublicExplorer() {
  return (
    <section aria-labelledby="explorer-teaser-heading" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-12">
          <p className="text-xs font-mono-data text-gold uppercase tracking-widest mb-4">Illustrative examples</p>
          <h2 id="explorer-teaser-heading" className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            Policy impact by
            <span className="gradient-text-gold"> income bracket</span>
          </h2>
          <p className="text-text-muted text-lg max-w-xl mx-auto">
            The same policy can help one household and cost another. Here is how {EXAMPLE_COUNT_LABEL} could
            add up for a typical household in each bracket.
          </p>
        </Reveal>

        <Reveal delay={200} className="glass-strong rounded-3xl p-4 sm:p-8">
          <IllustrativeNote className="mb-6" />
          <BracketChart idPrefix="landing-bracket" />

          <div className="border-t border-white/6 mt-8 pt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-muted">Each bar is the sum of the example policies in that category.</p>
            <Button
              href="/explorer"
              variant="link"
              icon={<ArrowRight className="w-3 h-3" />}
              iconPosition="end"
              className="text-xs gap-1.5"
            >
              See the example policies
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
