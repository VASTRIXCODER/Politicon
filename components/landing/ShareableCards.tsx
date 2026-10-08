import { Share2, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import Logo from '@/components/ui/Logo';
import Reveal from './Reveal';

const exampleCards = [
  {
    policy: 'Student Loan Rate Adjustment',
    impact: '-$85/month',
    annual: '-$1,020/year',
    direction: 'positive' as const,
    category: 'Education',
    gradient: 'from-primary/20 to-secondary/10',
    borderColor: 'border-primary/20',
    tilt: '-rotate-2',
  },
  {
    policy: 'First-Time Homebuyer Credit',
    impact: '+$15,000',
    annual: 'One-time credit',
    direction: 'positive' as const,
    category: 'Housing',
    gradient: 'from-emerald-500/20 to-emerald-500/5',
    borderColor: 'border-emerald-500/20',
    tilt: '',
  },
  {
    policy: 'Capital Gains Tax Increase',
    impact: '-$340/month',
    annual: '-$4,080/year',
    direction: 'negative' as const,
    category: 'Taxes',
    gradient: 'from-red-500/20 to-red-500/5',
    borderColor: 'border-red-500/15',
    tilt: 'rotate-2',
  },
];

export default function ShareableCards() {
  return (
    <section aria-labelledby="share-heading" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-16">
          <p className="text-xs font-mono-data text-secondary uppercase tracking-widest mb-4">Share Your Impact</p>
          <h2 id="share-heading" className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            Your impact,
            <span className="gradient-text"> shareable in seconds</span>
          </h2>
          <p className="text-text-muted text-lg max-w-xl mx-auto">
            After any analysis, generate a branded card showing your dollar impact. Download as PNG or copy a link.
          </p>
        </Reveal>

        {/* Illustrations of the share card; screen readers get the summary instead. */}
        <p className="sr-only">
          Example share cards show a policy name, its category, the dollar impact per month or year, and a link back to Politicon.
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
                  <p className="text-meta text-text-muted">{card.annual}</p>

                  <div className="flex items-center gap-1.5 mt-5 pt-4 border-t border-white/6">
                    <Share2 className="w-3 h-3 text-text-muted" />
                    <span className="text-meta text-text-muted">politicon.com/impact</span>
                  </div>
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
            Generate yours free
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
