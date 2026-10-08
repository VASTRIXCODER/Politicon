import { ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import HeroSearch from './HeroSearch';
import ImpactCardDemo from './ImpactCardDemo';

/**
 * Rendered on the server and shown at once: the headline is the page's LCP
 * element, so it isn't hidden behind an entrance animation. Only the search
 * box and the demo card hydrate.
 */
export default function HeroSection() {
  return (
    <section aria-labelledby="hero-heading" className="relative min-h-screen flex items-center pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left content */}
          <div>
            {/* Pre-headline badge */}
            <div className="inline-flex items-center gap-2 glass border-primary/20 rounded-full px-4 py-2 mb-8">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
              <span className="text-xs text-text-muted font-mono-data">AI-Powered Policy Analysis</span>
            </div>

            {/* Headline */}
            <h1 id="hero-heading" className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] mb-6 text-text-primary">
              Your money. Every policy. <span className="gradient-text">Crystal clear.</span>
            </h1>

            {/* Subheadline */}
            <p className="text-text-muted text-lg leading-relaxed mb-8 max-w-lg">
              Not political opinion — just the dollar answer to “what does this policy actually cost or save me?”
              Personalized to your income, location, and life situation.
            </p>

            {/* Search bar */}
            <HeroSearch />

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3">
              <Button href="/auth/signup" variant="primary" size="lg" icon={<ArrowRight className="w-4 h-4" />}>
                Get My Impact Report
              </Button>
              <Button href="/explorer" variant="ghost" size="lg">
                Explore Public Data
              </Button>
            </div>

            {/* Trust signals */}
            <dl className="flex items-center gap-6 mt-8">
              {[
                { stat: '2,400+', label: 'Policies tracked' },
                { stat: '$4,200', label: 'Avg annual impact found' },
                { stat: '50', label: 'States covered' },
              ].map(item => (
                <div key={item.label} className="flex flex-col-reverse">
                  <dt className="text-xs text-text-muted">{item.label}</dt>
                  <dd className="font-mono-data text-sm font-semibold text-primary">{item.stat}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Right (below the CTAs on phones): the example impact card */}
          <div className="flex justify-center items-center">
            <ImpactCardDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
