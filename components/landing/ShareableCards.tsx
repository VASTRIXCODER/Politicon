import { ArrowRight } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Logo from '@/components/ui/Logo';
import Reveal from './Reveal';
import { CATEGORIES, exampleImpact, formatAnnual } from '@/lib/explorerData';

const categoryLabel = (key: string) => CATEGORIES.find(c => c.key === key)?.label ?? key;

// Illustrative designs for a feature that isn't built yet. The figures come
// from the explorer's illustrative dataset (lib/explorerData) and are chosen
// to be even-handed: a gain for a higher-income household, a gain for a
// lower-income one, and a cost that reaches every bracket.
const exampleCards = [
  { impact: exampleImpact('income-tax-rate-cut', '100kPlus'), tilt: '-rotate-2' },
  { impact: exampleImpact('premium-subsidy-extension', '25to50k'), tilt: '' },
  { impact: exampleImpact('import-tariff', '50to75k'), tilt: 'rotate-2' },
].map(({ impact: { policy, bracket, annual }, tilt }) => ({
  policy: policy.title,
  impact: formatAnnual(annual),
  household: `${bracket.label} household`,
  direction: annual < 0 ? ('negative' as const) : ('positive' as const),
  category: categoryLabel(policy.category),
  gradient: annual < 0 ? 'from-red-500/20 to-red-500/5' : 'from-emerald-500/20 to-emerald-500/5',
  borderColor: annual < 0 ? 'border-red-500/15' : 'border-emerald-500/20',
  tilt,
}));

export default function ShareableCards() {
  return (
    <section aria-labelledby="share-heading" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-16">
          <Badge variant="secondary" size="md" className="mb-4 uppercase tracking-widest">Coming soon</Badge>
          <h2 id="share-heading" className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            Your impact,
            <span className="gradient-text"> as a card you can share</span>
          </h2>
          <p className="text-text-muted text-lg max-w-xl mx-auto">
            We&apos;re working on turning an analysis into a branded card you can save or share. It isn&apos;t available yet;
            these are examples of the design.
          </p>
        </Reveal>

        {/* Illustrations of the planned card; screen readers get the summary instead. */}
        <p className="sr-only">
          Example card designs, with illustrative figures, show a policy name, its category and an estimated dollar impact.
        </p>
        <div aria-hidden="true" className="flex flex-wrap justify-center gap-6 mb-12">
          {exampleCards.map((card, i) => (
            <Reveal key={card.policy} delay={i * 100}>
              {/* No backdrop-filter on repeated cards; the tinted gradient carries the look. */}
              <div
                className={`glass backdrop-filter-none ${card.borderColor} ${card.tilt} rounded-3xl p-6 w-64 relative overflow-hidden transition-transform duration-200 hover:rotate-0 hover:-translate-y-2`}
              >
                {/* Background gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-50`} />

                <div className="relative z-10">
                  <Logo variant="full" size="sm" href={null} className="mb-5" />

                  <p className="text-meta font-mono-data text-text-muted uppercase tracking-wide mb-1">{card.category}</p>
                  <p className="text-xs font-medium text-text-primary mb-4 leading-snug">{card.policy}</p>

                  <div className={`font-mono-data text-2xl font-bold mb-1 ${
                    card.direction === 'positive' ? 'text-positive' : 'text-negative'
                  }`}>
                    {card.impact}
                  </div>
                  <p className="text-meta text-text-muted">{card.household}</p>

                  <p className="mt-5 pt-4 border-t border-white/6 text-meta font-mono-data text-text-muted uppercase tracking-wide">
                    Example · illustrative figures
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal from="none" className="text-center">
          <Button
            href="/auth/signup"
            variant="ghost"
            size="lg"
            icon={<ArrowRight className="w-4 h-4" />}
            iconPosition="end"
            className="rounded-2xl bg-primary/10 border-primary/20 text-primary-300 hover:bg-primary/20 hover:border-primary/40"
          >
            Get your impact report
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
