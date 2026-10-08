import CountUp from '@/components/ui/CountUp';
import Reveal from './Reveal';

interface Stat {
  value: number;
  label: string;
  sublabel: string;
  prefix?: string;
  suffix?: string;
  unit?: string;
}

const STATIC_STATS: Stat[] = [
  { value: 2400, suffix: '+', label: 'Policies analyzed', sublabel: 'Federal, state & local' },
  { value: 4200, prefix: '$', label: 'Avg impact found', sublabel: 'Per user across tracked policies', unit: '/year' },
  { value: 50, suffix: ' states', label: 'States covered', sublabel: 'All 50 US states + DC' },
];

interface StatsSectionProps {
  /** Member accounts, rendered on the server. null (or 0) hides the figure. */
  memberCount: number | null;
}

export default function StatsSection({ memberCount }: StatsSectionProps) {
  const stats: Stat[] =
    memberCount !== null && memberCount > 0
      ? [...STATIC_STATS, { value: memberCount, label: 'Members joined', sublabel: 'Real accounts, updated every few minutes' }]
      : STATIC_STATS;

  return (
    <section aria-label="Politicon in numbers" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5" />
      <div className="absolute inset-x-0 h-px top-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="absolute inset-x-0 h-px bottom-0 bg-gradient-to-r from-transparent via-secondary/20 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`grid grid-cols-2 ${stats.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-y-12 gap-x-6 lg:gap-12`}>
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 100} className="text-center">
              <div className="font-mono-data font-bold gradient-text-gold mb-1 leading-tight">
                <CountUp
                  value={stat.value}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  srLabel={stat.unit ? `${stat.prefix ?? ''}${stat.value.toLocaleString('en-US')} per year` : undefined}
                  duration={2200}
                  className="text-3xl sm:text-4xl lg:text-5xl"
                />
                {stat.unit && (
                  <span aria-hidden="true" className="block text-base sm:text-lg font-semibold opacity-80">{stat.unit}</span>
                )}
              </div>
              <p className="font-display text-sm font-semibold text-text-primary mb-1">{stat.label}</p>
              <p className="text-xs text-text-muted leading-snug">{stat.sublabel}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
