import { ArrowRight, Info } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import KineticHeadline from '@/components/landing/KineticHeadline';
import MiniSkyline from './mockups/MiniSkyline';
import { formatUSD, impactSign } from '@/lib/format';
import {
  BRACKETS,
  BRACKET_ROWS,
  CATEGORIES,
  EXAMPLE_COUNT_LABEL,
  EXAMPLE_POLICIES,
  ILLUSTRATIVE_NOTE,
  UNIT_LABEL,
  divergingBar,
  formatAnnual,
  type BracketKey,
} from '@/lib/explorerData';
import { cn } from '@/lib/utils';
import styles from './mockups/explorer.module.css';

const VALUE_TONE = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-muted' } as const;

/** The required "these are examples" note, shown with every view of the explorer data. */
function IllustrativeNote({ className }: { className?: string }) {
  return (
    <p className={cn('inline-flex items-start gap-2 rounded-xl border border-dashed border-fg/25 px-3 py-2 text-xs text-muted', className)}>
      <Info className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>{ILLUSTRATIVE_NOTE}</span>
    </p>
  );
}

/** The bracket the teaser opens on. */
const DEFAULT_BRACKET: BracketKey = '50to75k';
/** The radio group's name (one teaser per page). */
const PICKER = 'landing-explorer-bracket';

const DIRECTION = { gain: 'Gain', loss: 'Cost', neutral: 'No change' } as const;

/**
 * The chosen bracket's numbers: one diverging bar per category on the
 * explorer's shared scale, then the net across every example policy, each
 * figure with its sign and a word for its direction.
 */
function BracketPanel({ row }: { row: (typeof BRACKET_ROWS)[number] }) {
  const net = CATEGORIES.reduce((sum, cat) => sum + row.totals[cat.key], 0);
  const netSign = impactSign(net);
  return (
    <div data-bracket={row.key} className={styles.panel}>
      <h3 className="text-sm text-muted">
        A typical <span className="font-medium text-ink">{row.label}</span> household
        <span className="text-muted"> · net per category, {UNIT_LABEL}</span>
      </h3>
      <ul className="mt-5 space-y-4">
        {CATEGORIES.map((cat) => {
          const amount = row.totals[cat.key];
          const bar = divergingBar(amount);
          const sign = impactSign(amount);
          return (
            <li key={cat.key}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink">{cat.label}</span>
                <span className={cn('font-mono-data text-sm font-medium', VALUE_TONE[sign])}>
                  <span className="mr-2 font-body text-meta uppercase tracking-[0.12em]">{DIRECTION[sign]}</span>
                  {formatUSD(amount, { signed: true })}
                  <span className="sr-only"> per year</span>
                </span>
              </div>
              <div aria-hidden="true" className="relative h-2.5 rounded-full bg-fg/6">
                <div className="absolute -inset-y-1 left-1/2 w-px bg-fg/20" />
                {bar.width > 0 && (
                  <div
                    className={cn(
                      'absolute inset-y-0',
                      bar.sign === 'gain' ? 'left-1/2 rounded-r-full bg-gain-fill' : 'right-1/2 rounded-l-full bg-loss-fill'
                    )}
                    style={{ width: `${bar.width}%` }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-fg/10 pt-4">
        <span className="text-sm text-muted">Net across all {EXAMPLE_POLICIES.length} example policies</span>
        <span className={cn('font-mono-data text-lg font-semibold', VALUE_TONE[netSign])}>
          <span className="mr-2 font-body text-meta font-medium uppercase tracking-[0.12em]">{DIRECTION[netSign]}</span>
          {formatAnnual(net)}
        </span>
      </p>
    </div>
  );
}

/**
 * The landing teaser of /explorer, "brackets as a city": the illustrative
 * dataset as a 2.5D skyline of five districts (one per income bracket, a
 * tower per category, gains rising and costs sinking), a bracket picker,
 * and the chosen bracket's numbers in words and bars.
 *
 * No JavaScript: the picker is a native radio group and CSS (:has) shows
 * the chosen bracket's panel and lights its district, so it works the
 * moment the HTML arrives. The 3D city itself lives on /explorer; the
 * landing page stays light. Labelled illustrative, as every view of this
 * data must be.
 */
export default function PublicExplorer() {
  return (
    <section
      aria-labelledby="explorer-teaser-heading"
      data-scene-section="explorer"
      className="relative overflow-x-clip py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex items-center gap-3 font-mono-data text-meta uppercase tracking-[0.18em] text-muted">
                <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-transparent to-primary/70" />
                The explorer
              </p>
              <Badge variant="example" size="md">
                Illustrative
              </Badge>
            </div>
            <KineticHeadline id="explorer-teaser-heading" className="mt-5 font-display text-display-md font-medium text-ink">
              Policy impact by <em>income bracket.</em>
            </KineticHeadline>
          </div>
          <p className="max-w-md text-lg leading-relaxed text-muted lg:col-span-5 lg:justify-self-end">
            The same policy can help one household and cost another. Here is how {EXAMPLE_COUNT_LABEL} could add up
            for a typical household in each bracket.
          </p>
        </header>

        <div className={cn(styles.root, 'mt-14 overflow-hidden rounded-[2rem] border border-fg/10 bg-surface shadow-pane sm:mt-16')}>
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* The city: every bracket at once. */}
            <div className="relative flex flex-col border-b border-fg/8 px-4 pb-8 pt-10 sm:px-8 lg:col-span-7 lg:border-b-0 lg:border-r lg:px-10 lg:py-14">
              <div className="flex flex-1 flex-col justify-center">
                <MiniSkyline />
              </div>
              <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-meta text-muted">
                <ul className="flex flex-wrap items-center gap-4" aria-label="Key">
                  <li className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-gain-fill" aria-hidden="true" />
                    Above the street: gains
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-loss-fill" aria-hidden="true" />
                    Below: costs
                  </li>
                </ul>
                <p className="font-mono-data">One tower per category, {UNIT_LABEL}</p>
              </div>
              <p className="mt-3 text-meta text-muted">
                Towers left to right: {CATEGORIES.map((c) => c.label).join(', ')}.
              </p>
            </div>

            {/* The picker and the chosen bracket's numbers. */}
            <div className="px-4 py-8 sm:px-8 lg:col-span-5 lg:px-10 lg:py-14">
              <fieldset>
                <legend className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Income bracket</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {BRACKETS.map((bracket) => (
                    <label key={bracket.key} className="cursor-pointer">
                      <input
                        type="radio"
                        name={PICKER}
                        value={bracket.key}
                        defaultChecked={bracket.key === DEFAULT_BRACKET}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          'inline-flex min-h-9 items-center rounded-full border border-fg/15 px-3.5 text-sm text-muted',
                          'transition-colors duration-200 ease-civic hover:border-primary/40 hover:text-ink',
                          'peer-checked:border-ink peer-checked:bg-ink peer-checked:text-canvas',
                          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus'
                        )}
                      >
                        {bracket.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-8">
                {BRACKET_ROWS.map((row) => (
                  <BracketPanel key={row.key} row={row} />
                ))}
              </div>

              <IllustrativeNote className="mt-8" />

              <div className="mt-8">
                <Button href="/explorer" variant="secondary" icon={<ArrowRight className="h-4 w-4" />} iconPosition="end">
                  Try the Explorer
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
