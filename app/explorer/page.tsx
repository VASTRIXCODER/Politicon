import { Metadata } from 'next';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Reveal from '@/components/landing/Reveal';
import { IllustrativeNote } from '@/components/landing/PublicExplorer';
import { impactSign } from '@/lib/format';
import { CATEGORIES, EXAMPLE_COUNT_LABEL, EXAMPLE_POLICIES, formatAnnual, largestEffect } from '@/lib/explorerData';
import ExplorerClient, { ExplorerCta } from './ExplorerClient';

export const metadata: Metadata = {
  title: 'Public Impact Explorer',
  description:
    'Illustrative examples of how different kinds of policy can cost or save households in each income bracket. No login required.',
};

const TONE = { gain: 'text-positive', loss: 'text-negative', neutral: 'text-text-muted' } as const;
const ICON = { gain: TrendingUp, loss: TrendingDown, neutral: Minus } as const;
const categoryLabel = (key: string) => CATEGORIES.find(c => c.key === key)?.label ?? key;

export default function ExplorerPage() {
  // State bills are only fetched when Open States is configured.
  const stateBills = Boolean(process.env.OPENSTATES_API_KEY);

  return (
    <div className="min-h-screen relative">
      <AmbientBackground animated />
      <div className="relative z-10">
        <Navbar />
        <main id="main" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="gold">No login required</Badge>
              <Badge variant="default">Illustrative examples</Badge>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
              Public Impact Explorer
            </h1>
            <p className="text-text-muted text-lg max-w-2xl mb-6">
              The same policy can help one household and cost another. Explore how {EXAMPLE_COUNT_LABEL} could add up
              for a typical household in each income bracket. The policies are hypothetical and the dollar figures are
              made up to show the idea.
            </p>
            <IllustrativeNote />
          </div>

          <ExplorerClient />

          {/* The policies behind the chart */}
          <section aria-labelledby="example-policies-heading" className="mb-12">
            <h2 id="example-policies-heading" className="font-display text-2xl font-bold text-text-primary mb-2">
              The {EXAMPLE_POLICIES.length} example policies behind the chart
            </h2>
            <p className="text-sm text-text-muted mb-6">
              Each card shows the bracket the policy affects most. Amounts are $ per year from the household’s side: + is a
              gain, − is a cost.
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {EXAMPLE_POLICIES.map((policy, i) => {
                const { bracket, amount } = largestEffect(policy);
                const sign = impactSign(amount);
                const Icon = ICON[sign];
                return (
                  <li key={policy.id}>
                    {/* Repeated cards: no backdrop-filter. */}
                    <Reveal delay={(i % 2) * 60} className="h-full">
                      <GlassCard animate={false} className="h-full rounded-2xl p-5 backdrop-filter-none">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="default">{categoryLabel(policy.category)}</Badge>
                              <span className="text-meta text-text-muted">{policy.scope} example</span>
                            </div>
                            <h3 className="text-sm font-medium text-text-primary leading-snug">{policy.title}</h3>
                            <p className="text-meta text-text-muted mt-1">{policy.summary}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="flex items-center gap-1 justify-end">
                              <Icon className={`w-3.5 h-3.5 ${TONE[sign]}`} aria-hidden="true" />
                              <p className={`font-mono-data text-sm font-bold ${TONE[sign]}`}>{formatAnnual(amount)}</p>
                            </div>
                            <p className="text-meta text-text-muted">{bracket.label} households</p>
                          </div>
                        </div>
                      </GlassCard>
                    </Reveal>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* CTA (auth-aware; signed-out version is rendered on the server) */}
          <Reveal className="glass-strong rounded-3xl p-6 sm:p-10 text-center">
            <ExplorerCta stateBills={stateBills} />
          </Reveal>
        </main>
        <Footer />
      </div>
    </div>
  );
}
