import CountUp from '@/components/ui/CountUp';
import KineticHeadline from '@/components/landing/KineticHeadline';
import type { PublicStats } from '@/lib/server/publicStats';
import { cn } from '@/lib/utils';

interface LiveStat {
  value: number;
  label: string;
  sublabel: string;
  prefix?: string;
  unit?: string;
  srLabel?: string;
}

interface Fact {
  /** The fact's headline, with its italic accent split out. */
  lead: string;
  accent: string;
  label: string;
  sublabel: string;
}

interface StatsSectionProps {
  /** Measured figures, rendered on the server. A null figure is not shown. */
  stats: PublicStats;
  /** True when state bills are loaded (Open States is configured). */
  stateBills: boolean;
}

/**
 * The ledger: measured numbers (only those the database can back, above a
 * minimum count; lib/server/publicStats.ts) and the plain rules every
 * estimate keeps. Nothing here is a hard-coded figure, and with no measured
 * numbers to show, the rules stand alone.
 *
 * Set like a page of an account book: a double rule at the head, big Geist
 * Mono figures, hairlines between the entries and Fraunces labels with
 * their italic accents. A server component; only the counting figures are
 * client code.
 */
export default function StatsSection({ stats, stateBills }: StatsSectionProps) {
  const live: LiveStat[] = [];
  if (stats.members !== null) {
    live.push({ value: stats.members, label: 'Members', sublabel: 'Accounts with a confirmed email address' });
  }
  if (stats.analyses !== null) {
    live.push({ value: stats.analyses, label: 'Personal analyses', sublabel: 'Each estimated for a member’s own profile' });
  }
  if (stats.medianAnnualImpact !== null) {
    live.push({
      value: stats.medianAnnualImpact,
      prefix: '$',
      unit: '/year',
      srLabel: `$${stats.medianAnnualImpact.toLocaleString('en-US')} per year`,
      label: 'Median estimated impact',
      sublabel: 'Typical size of one bill’s estimated yearly effect on a member, gain or cost',
    });
  }

  const facts: Fact[] = [
    {
      lead: 'Official',
      accent: 'records',
      label: stateBills ? 'Congress.gov and Open States' : 'Congress.gov',
      sublabel: 'Bill titles, numbers and status come from the official record; anything without one is marked unverified',
    },
    ...(stateBills
      ? [{ lead: '50', accent: 'states', label: 'Plus federal bills', sublabel: 'Your state legislature’s recent bills, alongside Congress' }]
      : []),
    {
      lead: 'Ranges',
      accent: 'only',
      label: 'Never exact figures',
      sublabel: 'Your profile uses ranges; your name and email are never sent to the AI',
    },
    {
      lead: 'Assumptions',
      accent: 'shown',
      label: 'With a confidence level',
      sublabel: 'Every analysis lists what it assumes and how sure it is',
    },
  ];

  const measured = live.length > 0;
  const liveCols = live.length === 3 ? 'sm:grid-cols-3' : live.length === 2 ? 'sm:grid-cols-2' : '';

  return (
    <section aria-labelledby="stats-heading" data-scene-section="ledger" className="relative py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8">
        <header className="lg:sticky lg:top-28 lg:col-span-4 lg:self-start">
          <p className="flex items-center gap-3 font-mono-data text-meta uppercase tracking-[0.18em] text-muted">
            <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-transparent to-primary/70" />
            {measured ? 'Measured, not claimed' : 'The ground rules'}
          </p>
          <KineticHeadline id="stats-heading" className="mt-5 font-display text-display-sm font-medium text-ink">
            {measured ? (
              <>
                Politicon <em>in numbers.</em>
              </>
            ) : (
              <>
                Built on <em>official records.</em>
              </>
            )}
          </KineticHeadline>
          <p className="mt-5 max-w-sm leading-relaxed text-muted">
            {measured
              ? 'Each figure is counted from Politicon’s own records, and shown only once enough people stand behind it.'
              : 'The rules every estimate keeps, whichever party wrote the bill.'}
          </p>
        </header>

        <div className="lg:col-span-8">
          {measured && (
            <div className="mb-14">
              {/* The account book's head: a double rule. */}
              <div aria-hidden="true" className="h-[5px] border-y border-fg/25" />
              <dl className={cn('grid grid-cols-1 divide-y divide-fg/10 sm:divide-x sm:divide-y-0', liveCols)}>
                {live.map((stat, i) => (
                  <div key={stat.label} className={cn('flex flex-col gap-3 py-7 sm:px-6 sm:py-8', i === 0 && 'sm:pl-0')}>
                    <dt>
                      <span className="block font-display text-lg font-medium text-ink">{stat.label}</span>
                      <span className="mt-1 block max-w-[17rem] text-sm leading-snug text-muted">{stat.sublabel}</span>
                    </dt>
                    {/* The figure reads first on screen; the label stays first in the markup. */}
                    <dd className="order-first font-mono-data font-medium leading-none tracking-tight text-ink">
                      <CountUp
                        value={stat.value}
                        prefix={stat.prefix}
                        srLabel={stat.srLabel}
                        duration={2200}
                        className="text-[clamp(2.5rem,1.9rem+2.4vw,4rem)]"
                      />
                      {stat.unit && (
                        <span aria-hidden="true" className="ml-1 text-lg font-normal text-muted">
                          {stat.unit}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="border-t border-fg/10 pt-4 font-mono-data text-meta text-muted">
                Counted from Politicon’s own records and refreshed every 15 minutes. Impact figures are AI estimates, not
                measured outcomes.
              </p>
            </div>
          )}

          {/* The rules, as numbered entries in the book. */}
          {!measured && <div aria-hidden="true" className="h-[5px] border-y border-fg/25" />}
          <ol className="divide-y divide-fg/10 border-b border-fg/10">
            {facts.map((fact, i) => (
              <li
                key={fact.lead}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4 gap-y-2 py-6 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.15fr)] sm:items-baseline sm:gap-x-6 sm:py-7"
              >
                <span aria-hidden="true" className="font-mono-data text-sm text-muted">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
                  {fact.lead} <em>{fact.accent}</em>
                </p>
                <div className="col-start-2 sm:col-start-3">
                  <p className="font-mono-data text-meta uppercase tracking-[0.14em] text-ink">{fact.label}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{fact.sublabel}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
