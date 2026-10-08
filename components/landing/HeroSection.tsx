import Form from 'next/form';
import { ArrowRight, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import ImpactCardDemo from './ImpactCardDemo';

/** Longest question the hero hands to the AI Policy Guide (the guide caps it too). */
const MAX_QUESTION = 500;

interface HeroSectionProps {
  /** True when state bills are loaded (Open States is configured), so the hero may say so. */
  stateBills: boolean;
}

/**
 * Rendered on the server and shown at once: the headline is the page's LCP
 * element, so it isn't hidden behind an entrance animation. Only the search
 * form (next/form, which works before hydration too) and the example card hydrate.
 */
export default function HeroSection({ stateBills }: HeroSectionProps) {
  // Facts about where the data comes from; no counts that nothing measures.
  const facts = [
    { stat: 'Congress.gov', label: 'Federal bill records' },
    ...(stateBills ? [{ stat: 'Open States', label: 'All 50 state legislatures' }] : []),
    { stat: 'Free', label: 'No credit card' },
  ];

  return (
    <section aria-labelledby="hero-heading" className="relative min-h-screen flex items-center pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left content */}
          <div>
            {/* Pre-headline badge */}
            <div className="inline-flex items-center gap-2 glass border-primary/20 rounded-full px-4 py-2 mb-8">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
              <span className="text-xs text-text-muted font-mono-data">AI Policy Guide · Educational, non-partisan</span>
            </div>

            {/* Headline */}
            <h1 id="hero-heading" className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] mb-6 text-text-primary">
              Your money. Real bills. <span className="gradient-text">Crystal clear.</span>
            </h1>

            {/* Subheadline */}
            <p className="text-text-muted text-lg leading-relaxed mb-8 max-w-lg">
              Not political opinion — a plain-English estimate, in dollars, of what a bill could cost or save you.
              Personalized to your income range, location, and life situation.
            </p>

            {/* Search: hands the question to the AI Policy Guide, which fills it in
                without sending it. Signed-out visitors sign in first and come back. */}
            <Form action="/advisor" prefetch={false} role="search" className="mb-6">
              <label htmlFor="hero-policy-search" className="sr-only">Ask about a policy</label>
              <div className="relative flex items-center">
                <Search className="absolute left-4 w-4 h-4 text-text-muted" aria-hidden="true" />
                <input
                  id="hero-policy-search"
                  name="q"
                  type="text"
                  required
                  maxLength={MAX_QUESTION}
                  enterKeyHint="go"
                  autoComplete="off"
                  placeholder="Ask about a policy, e.g. “minimum wage”"
                  aria-describedby="hero-search-hint"
                  className="input-glass w-full pl-11 pr-32 py-4 text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                  iconPosition="end"
                  className="absolute right-2 rounded-lg gap-1.5"
                >
                  Ask
                </Button>
              </div>
              <p id="hero-search-hint" className="mt-2 text-xs text-text-muted">
                Opens the AI Policy Guide with your question ready to send. Free account required.
              </p>
            </Form>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3">
              <Button href="/auth/signup" variant="primary" size="lg" icon={<ArrowRight className="w-4 h-4" />}>
                Get My Impact Report
              </Button>
              <Button href="/explorer" variant="ghost" size="lg">
                Try the Explorer
              </Button>
            </div>

            <p className="mt-4 text-xs text-text-muted max-w-lg">
              Educational estimates, not financial, tax or legal advice. For adults 18+.
            </p>

            {/* Trust signals */}
            <dl className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-8">
              {facts.map(item => (
                <div key={item.label} className="flex flex-col-reverse">
                  <dt className="text-xs text-text-muted">{item.label}</dt>
                  <dd className="font-mono-data text-sm font-semibold text-primary-300">{item.stat}</dd>
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
