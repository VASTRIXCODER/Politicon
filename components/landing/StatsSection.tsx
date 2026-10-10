import CountUp from '@/components/ui/CountUp';
import type { PublicStats } from '@/lib/server/publicStats';
import Reveal from './Reveal';

interface LiveStat {
  value: number;
  label: string;
  sublabel: string;
  prefix?: string;
  unit?: string;
  srLabel?: string;
}

interface Fact {
  value: string;
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
 * Measured numbers (only those the database can back, above a minimum
 * count) and plain facts about how Politicon works. Nothing here is a
 * hard-coded figure.
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
      value: 'Official records',
      label: stateBills ? 'Congress.gov and Open States' : 'Congress.gov',
      sublabel: 'Bill titles, numbers and status come from the official record; anything without one is marked unverified',
    },
    ...(stateBills
      ? [{ value: '50 states', label: 'Plus federal bills', sublabel: 'Your state legislature’s recent bills, alongside Congress' }]
      : []),
    {
      value: 'Ranges only',
      label: 'Never exact figures',
      sublabel: 'Your profile uses ranges; your name and email are never sent to the AI',
    },
    {
      value: 'Assumptions shown',
      label: 'With a confidence level',
      sublabel: 'Every analysis lists what it assumes and how sure it is',
    },
  ];

  const liveCols = live.length === 3 ? 'lg:grid-cols-3' : live.length === 2 ? 'sm:grid-cols-2' : '';

  return (
    <section aria-labelledby="stats-heading" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5" />
      <div className="absolute inset-x-0 h-px top-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="absolute inset-x-0 h-px bottom-0 bg-gradient-to-r from-transparent via-secondary/20 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="stats-heading" className="text-center text-xs font-mono-data text-primary-300 uppercase tracking-widest mb-12">
          {live.length > 0 ? 'Politicon in numbers' : 'Built on official records'}
        </h2>

        {live.length > 0 && (
          <div className="mb-16">
            <div className={`grid grid-cols-1 ${liveCols} gap-y-12 gap-x-6 lg:gap-12`}>
              {live.map((stat, i) => (
                <Reveal key={stat.label} delay={i * 100} className="text-center">
                  <div className="font-mono-data font-bold gradient-text-gold mb-1 leading-tight">
                    <CountUp
                      value={stat.value}
                      prefix={stat.prefix}
                      srLabel={stat.srLabel}
                      duration={2200}
                      className="text-3xl sm:text-4xl lg:text-5xl"
                    />
                    {stat.unit && (
                      <span aria-hidden="true" className="block text-base sm:text-lg font-semibold opacity-80">{stat.unit}</span>
                    )}
                  </div>
                  <p className="font-display text-sm font-semibold text-text-primary mb-1">{stat.label}</p>
                  <p className="text-xs text-text-muted leading-snug max-w-[16rem] mx-auto">{stat.sublabel}</p>
                </Reveal>
              ))}
            </div>
            <p className="text-center text-xs text-text-muted mt-8">
              Counted from Politicon’s own records and refreshed every 15 minutes. Impact figures are AI estimates, not measured outcomes.
            </p>
          </div>
        )}

        <ul className={`grid grid-cols-1 sm:grid-cols-2 ${facts.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-y-10 gap-x-6 lg:gap-10`}>
          {facts.map((fact, i) => (
            <li key={fact.value}>
              <Reveal delay={i * 100} className="text-center">
                <p className="font-display text-2xl sm:text-3xl font-bold gradient-text-gold mb-2 leading-tight">{fact.value}</p>
                <p className="font-display text-sm font-semibold text-text-primary mb-1">{fact.label}</p>
                <p className="text-xs text-text-muted leading-snug max-w-[16rem] mx-auto">{fact.sublabel}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
