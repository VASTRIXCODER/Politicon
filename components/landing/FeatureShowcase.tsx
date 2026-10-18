import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import KineticHeadline from '@/components/landing/KineticHeadline';
import { cn } from '@/lib/utils';
import { FEED_EXAMPLES, GUIDE_EXAMPLE, LEDGER_POLICY_COUNT, LEDGER_ROW, POLICY_EXAMPLE } from './mockups/data';
import GuideMockup from './mockups/GuideMockup';
import LedgerMockup from './mockups/LedgerMockup';
import PolicyMockup from './mockups/PolicyMockup';
import { toneColor, type Tone } from './tone';

type MockupKind = 'policy' | 'guide' | 'ledger';

interface Feature {
  id: MockupKind;
  /** Short name of the app surface, above the title. */
  tag: string;
  /** Title, with the italic accent words split out. */
  title: { lead: string; accent: string };
  description: string;
  bullets: string[];
  /** The feature's accent light (AA as text on the page). */
  tone: Tone;
  href: string;
  /** What the mockup shows, in words: its visible caption (the mockup itself is decorative). */
  caption: string;
}

const MOCKUPS: Record<MockupKind, (_props: { facing: 'left' | 'right' }) => ReactNode> = {
  policy: PolicyMockup,
  guide: GuideMockup,
  ledger: LedgerMockup,
};

// Only what ships today. The mockups' example figures come from the
// explorer's illustrative dataset (components/landing/mockups/data.ts), and
// every caption says so.
function buildFeatures(stateBills: boolean): Feature[] {
  const feed = FEED_EXAMPLES.map(({ impact }) => impact.policy.title.toLowerCase());
  return [
    {
      id: 'policy',
      tag: 'Policy pages',
      title: { lead: 'Every bill,', accent: 'in plain English.' },
      description: stateBills
        ? 'Your feed starts from recent bills in Congress and your state legislature, ranked by how likely they are to affect your finances. Each verified bill links to its official record and status. Analyze one for a plain-English explanation and a dollar estimate for your income range, location and life stage. Anything the record can’t confirm is marked unverified.'
        : 'Your feed starts from recent bills in Congress, ranked by how likely they are to affect your finances. Each verified bill links to its official record and status. Analyze one for a plain-English explanation and a dollar estimate for your income range, location and life stage. Anything the record can’t confirm is marked unverified.',
      bullets: [
        'Official status and a record link for verified bills',
        'The effect on your monthly budget',
        '1, 3 and 5-year projections',
        'The assumptions, and a confidence level',
      ],
      tone: 'violet-text',
      href: '/policies',
      caption: `A policy page for the hypothetical “${POLICY_EXAMPLE.policy.title}”: its record header, status, plain-English summary and estimate for a sample ${POLICY_EXAMPLE.bracket.label} household, beside a feed that ranks ${feed.join(', ')} by relevance.`,
    },
    {
      id: 'guide',
      tag: 'AI Policy Guide',
      title: { lead: 'Ask anything.', accent: 'Get dollars, not talking points.' },
      description:
        'Ask how a policy could affect you. The guide answers from the ranges in your profile, with educational dollar estimates both ways, and never tells you what to think or how to vote.',
      bullets: [
        'Your profile ranges in every answer',
        'Ask about any policy in your feed',
        'Simple or Expert reading mode',
        'Educational estimates, not advice',
      ],
      tone: 'accent',
      href: '/advisor',
      caption: `The guide answering “${GUIDE_EXAMPLE.question}” in dollars for two sample households: one earning ${GUIDE_EXAMPLE.asker.bracket.label} that pays a little more, and one earning ${GUIDE_EXAMPLE.contrast.bracket.label.toLowerCase()} that gains.`,
    },
    {
      id: 'ledger',
      tag: 'My Impact',
      title: { lead: 'Your ledger,', accent: 'every policy in one number.' },
      description:
        'Track every policy you’ve analyzed. See your combined estimated net yearly impact, broken down by category, with gains and costs side by side.',
      bullets: [
        'Combined net yearly impact',
        'Breakdown by category (taxes, housing…)',
        'Sort by impact or date',
        'Export or delete your data anytime',
      ],
      tone: 'violet-text',
      href: '/impact',
      caption: `A combined net yearly impact across ${LEDGER_POLICY_COUNT} example policies for a sample ${LEDGER_ROW.label} household, with each category as a gain or a cost.`,
    },
  ];
}

interface FeatureShowcaseProps {
  /** True when state bills are loaded (Open States is configured). */
  stateBills: boolean;
}

/**
 * "Live product mockups as heroes": three surfaces of the real app, each a
 * 2.5D pane in perspective beside the copy that explains it (the pane turns
 * toward the copy; under a mouse it tilts toward the pointer and catches the
 * light). The mockups are drawn with the app's own tokens and illustrative
 * figures; each is decorative, with a visible caption that says what it
 * shows and that it's an example. A server component; TiltStage is the only
 * client code here.
 */
export default function FeatureShowcase({ stateBills }: FeatureShowcaseProps) {
  const features = buildFeatures(stateBills);
  return (
    <section aria-labelledby="features-heading" data-scene-section="features" className="relative overflow-x-clip py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <p className="flex items-center gap-3 font-mono-data text-meta uppercase tracking-[0.18em] text-muted">
              <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-transparent to-primary/70" />
              Inside Politicon
            </p>
            <KineticHeadline id="features-heading" className="mt-5 font-display text-display-md font-medium text-ink">
              Everything you need to <em>understand your money.</em>
            </KineticHeadline>
          </div>
          <p className="max-w-md text-lg leading-relaxed text-muted lg:col-span-5 lg:justify-self-end">
            Three surfaces of the product, shown with illustrative figures. Educational estimates, never financial
            advice.
          </p>
        </header>

        <ol className="mt-20 space-y-28 sm:mt-28 sm:space-y-36">
          {features.map((feature, i) => {
            const Mockup = MOCKUPS[feature.id];
            const flip = i % 2 === 1;
            return (
              <li key={feature.id} className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
                {/* The copy. */}
                <div className={cn('lg:col-span-5', flip && 'lg:order-2')}>
                  <p className="flex items-center gap-3 font-mono-data text-meta uppercase tracking-[0.18em]">
                    <span className="text-muted">{String(i + 1).padStart(2, '0')}</span>
                    <span aria-hidden="true" className="h-px w-6 bg-fg/20" />
                    <span style={{ color: toneColor(feature.tone) }}>{feature.tag}</span>
                  </p>
                  <h3 className="mt-5 font-display text-display-sm font-medium text-ink">
                    {feature.title.lead} <em>{feature.title.accent}</em>
                  </h3>
                  <p className="mt-5 text-base leading-relaxed text-muted">{feature.description}</p>

                  <ul className="mt-7 border-t border-fg/10">
                    {feature.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-center gap-3 border-b border-fg/10 py-3 text-sm text-ink">
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 flex-shrink-0 rotate-45"
                          style={{ backgroundColor: toneColor(feature.tone) }}
                        />
                        {bullet}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={feature.href}
                    className="group mt-7 inline-flex items-center gap-2 rounded-md text-sm font-medium"
                    style={{ color: toneColor(feature.tone) }}
                  >
                    Explore feature<span className="sr-only">: {feature.tag}</span>
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-300 ease-civic group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                </div>

                {/* The mockup (decorative) and its caption. */}
                <figure className={cn('lg:col-span-7', flip && 'lg:order-1')}>
                  <Mockup facing={flip ? 'right' : 'left'} />
                  <figcaption className="mt-12 flex items-start gap-3 text-sm leading-relaxed text-muted">
                    <Badge variant="example" className="mt-0.5 flex-shrink-0">
                      Example
                    </Badge>
                    <span>
                      {feature.caption} Illustrative figures, not a real analysis.
                    </span>
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
