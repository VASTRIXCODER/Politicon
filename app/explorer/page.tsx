import { Metadata } from 'next';
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import { mockPolicies } from '@/mocks/policies';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Reveal from '@/components/landing/Reveal';
import { formatUSD, signPrefix } from '@/lib/format';
import type { PolicyImpact } from '@/types';
import ExplorerClient from './ExplorerClient';

export const metadata: Metadata = {
  title: 'Public Impact Explorer — Politicon',
  description: 'Explore the average financial impact of top US policies across income brackets and states. No login required.',
};

/**
 * An example impact signed from the user's side: the sample data stores some
 * savings as negative cost changes (−$85 loan payment, marked positive), so
 * the direction decides the sign and the value only the size.
 */
function exampleImpact(impact: PolicyImpact): string {
  const signed = (impact.direction === 'negative' ? -1 : 1) * Math.abs(impact.value);
  if (impact.unit.startsWith('$')) return formatUSD(signed, { signed: true, suffix: impact.unit.slice(1) });
  const unit = impact.unit.length > 5 ? '' : impact.unit.startsWith('%') ? impact.unit : ` ${impact.unit}`;
  return `${signPrefix(signed)}${Math.abs(impact.value).toLocaleString()}${unit}`;
}

export default function ExplorerPage() {
  return (
    <div className="min-h-screen relative">
      <AmbientBackground animated />
      <div className="relative z-10">
        <Navbar />
        <main id="main" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="gold">No login required</Badge>
              <Badge variant="default">Illustrative examples</Badge>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
              Public Impact Explorer
            </h1>
            <p className="text-text-muted text-lg max-w-2xl">
              Illustrative examples of how policies can affect households across income brackets. The bills and figures below are samples, not real
              legislation or estimates for you. Sign up to see your personalized numbers for real bills.
            </p>
          </div>

          <ExplorerClient />

          {/* Top policies table */}
          <section aria-labelledby="example-policies-heading" className="mb-12">
            <h2 id="example-policies-heading" className="font-display text-2xl font-bold text-text-primary mb-6">Example policies (sample figures)</h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mockPolicies.map((policy, i) => {
                const impact = policy.impacts[0];
                const positive = impact.direction === 'positive';
                return (
                  <li key={policy.id}>
                    {/* Repeated cards: no backdrop-filter. */}
                    <Reveal delay={(i % 2) * 60} className="h-full">
                      <GlassCard animate={false} className="h-full rounded-2xl p-5 backdrop-filter-none">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="default">{policy.category}</Badge>
                              <span className="text-meta text-text-muted">{policy.region}</span>
                            </div>
                            <h3 className="text-sm font-medium text-text-primary leading-snug">{policy.title}</h3>
                            <p className="text-meta text-text-muted mt-1 line-clamp-2">{policy.summary}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="flex items-center gap-1 justify-end">
                              {positive
                                ? <TrendingUp className="w-3.5 h-3.5 text-positive" aria-hidden="true" />
                                : <TrendingDown className="w-3.5 h-3.5 text-negative" aria-hidden="true" />}
                              <p className={`font-mono-data text-sm font-bold ${positive ? 'text-positive' : 'text-negative'}`}>
                                {exampleImpact(impact)}
                              </p>
                            </div>
                            <p className="text-meta text-text-muted">{impact.label}</p>
                          </div>
                        </div>
                      </GlassCard>
                    </Reveal>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* CTA */}
          <Reveal className="glass-strong rounded-3xl p-10 text-center">
            <p className="text-xs font-mono-data text-primary-300 uppercase tracking-widest mb-4">Go deeper</p>
            <h2 className="font-display text-3xl font-bold text-text-primary mb-4">
              See your <span className="gradient-text">personalized numbers</span>
            </h2>
            <p className="text-text-muted mb-8 max-w-lg mx-auto">
              These are averages. Sign up free and get impact calculations specific to your income, state, family situation, and financial profile.
            </p>
            <Button
              href="/auth/signup"
              size="lg"
              icon={<ArrowRight className="w-4 h-4" />}
              iconPosition="end"
              className="rounded-2xl"
            >
              Get my personalized report
            </Button>
          </Reveal>
        </main>
        <Footer />
      </div>
    </div>
  );
}
