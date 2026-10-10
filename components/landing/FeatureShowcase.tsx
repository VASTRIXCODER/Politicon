import { BarChart2, Compass, MessageSquare, PieChart, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Reveal from './Reveal';
import { formatUSD, impactSign } from '@/lib/format';
import { BRACKET_ROWS, CATEGORIES, EXAMPLE_POLICIES, bracketByKey, exampleImpact, formatAnnual } from '@/lib/explorerData';

interface Feature {
  icon: typeof BarChart2;
  tag: string;
  title: string;
  description: string;
  bullets: string[];
  color: string;
  href: string;
  mockup: string;
  preview: string;
}

// Only what ships today. The mockups' example figures come from the explorer's
// illustrative dataset (lib/explorerData), picked so that, taken together,
// they show gains and costs for both lower and higher incomes from policy
// types across the spectrum.
const ANALYSIS = exampleImpact('income-tax-rate-cut', '75to100k');
const DISCOVERY_BRACKET = bracketByKey('25to50k');
const DISCOVERY = [
  { impact: exampleImpact('premium-subsidy-extension', DISCOVERY_BRACKET.key), score: 94 },
  { impact: exampleImpact('import-tariff', DISCOVERY_BRACKET.key), score: 88 },
  { impact: exampleImpact('income-tax-rate-cut', DISCOVERY_BRACKET.key), score: 81 },
];
const ADVISOR_LOW = exampleImpact('minimum-wage-increase', 'under25k');
const ADVISOR_MID = exampleImpact('minimum-wage-increase', '50to75k');
const DASHBOARD = BRACKET_ROWS.find(r => r.key === '50to75k') ?? BRACKET_ROWS[0];

const TONE = { gain: 'text-positive', loss: 'text-negative', neutral: 'text-text-muted' } as const;
const BAR = { gain: 'bg-positive/50', loss: 'bg-negative/50', neutral: 'bg-white/20' } as const;

function buildFeatures(stateBills: boolean): Feature[] {
  return [
    {
      icon: BarChart2,
      tag: 'Core Feature',
      title: 'Personalized Impact Analysis',
      description: 'Each policy is analyzed by AI for your income range, location, housing situation, and life stage, with the assumptions behind every number written out. Educational estimates, not financial advice.',
      bullets: [
        'Immediate effects on your monthly budget',
        '1, 3, and 5-year projections',
        'The assumptions behind every estimate',
        'A confidence level on every analysis',
      ],
      color: '#7B61FF',
      href: '/policies',
      mockup: 'analysis',
      preview: `Example with illustrative figures: the “${ANALYSIS.policy.title}” example for a sample ${ANALYSIS.bracket.label} household, shown per month, for one year and over five years, with a confidence level.`,
    },
    {
      icon: Compass,
      tag: 'Discovery',
      title: 'AI Policy Discovery',
      description: stateBills
        ? 'Your feed starts from recent bills in Congress and your state legislature, taken from official records, and the AI ranks them by how likely they are to affect your finances.'
        : 'Your feed starts from recent bills in Congress, taken from official records, and the AI ranks them by how likely they are to affect your finances.',
      bullets: [
        'Relevance score for your situation',
        stateBills ? 'Federal bills plus your state’s' : 'Federal bills from Congress.gov',
        'Official status and a link to each bill',
        'Hide what isn’t relevant to you',
      ],
      color: '#00D4FF',
      href: '/policies',
      mockup: 'discovery',
      preview: `Example with illustrative figures: three example policies ranked by how relevant they are to a sample ${DISCOVERY_BRACKET.label} household, two gains and one cost, each with an estimated yearly impact.`,
    },
    {
      icon: MessageSquare,
      tag: 'AI Policy Guide',
      title: 'Your AI Policy Guide',
      description: 'Ask how a policy could affect you. The guide uses the ranges in your profile and answers with educational dollar estimates, not political talking points.',
      bullets: [
        'Your profile ranges in every answer',
        'Ask about any policy in your feed',
        'Simple or Expert reading mode',
        'Educational estimates, not advice',
      ],
      color: '#F5C842',
      href: '/advisor',
      mockup: 'advisor',
      preview: 'Example with illustrative figures: a what-if question about a minimum wage increase, answered in dollars for two sample households, one that gains and one that pays a little more.',
    },
    {
      icon: PieChart,
      tag: 'Dashboard',
      title: 'Cumulative Impact Dashboard',
      description: 'Track every policy you\'ve analyzed. See your combined estimated net annual impact, broken down by category.',
      bullets: [
        'Combined net annual impact',
        'Breakdown by category (taxes, housing...)',
        'Sort by impact or date',
        'Export or delete your data anytime',
      ],
      color: '#7B61FF',
      href: '/impact',
      mockup: 'dashboard',
      preview: 'Example with illustrative figures: a combined net annual impact with a breakdown by category, some categories gains and some costs.',
    },
  ];
}

// The mockups below are illustrations; FeatureShowcase hides them from screen
// readers and gives each a one-line summary instead. Inner glass panels skip
// backdrop-filter: they already sit on a blurred glass-strong panel.
const nestedGlass = 'glass backdrop-filter-none';

const MockupAnalysis = () => {
  const { policy, bracket, annual } = ANALYSIS;
  const tone = TONE[impactSign(annual)];
  return (
    <div className={`${nestedGlass} rounded-2xl p-5 text-left`}>
      <p className="text-meta font-mono-data text-text-muted uppercase tracking-widest mb-3">{policy.title}</p>
      <div className="space-y-3">
        {[
          { label: 'Monthly budget', value: formatUSD(annual / 12, { signed: true, suffix: '/mo' }) },
          { label: 'Year 1', value: formatUSD(annual, { signed: true }) },
          { label: '5 years, cumulative', value: formatUSD(annual * 5, { signed: true }) },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-meta text-text-muted">{row.label}</span>
            <span className={`text-meta font-mono-data font-semibold ${tone}`}>{row.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 rounded-xl bg-white/4 border border-white/8">
        <p className="text-meta text-text-muted font-mono-data">Sample: {bracket.label} household · Confidence: medium</p>
      </div>
    </div>
  );
};

const MockupDiscovery = () => (
  <div className="space-y-2">
    <p className="text-meta text-text-muted font-mono-data mb-1">Sample: {DISCOVERY_BRACKET.label} household</p>
    {DISCOVERY.map(({ impact: { policy, annual }, score }) => (
      <div key={policy.id} className={`${nestedGlass} rounded-xl p-3 flex items-center justify-between`}>
        <div>
          <p className="text-meta font-medium text-text-primary">{policy.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1 w-16 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
            </div>
            <span className="text-meta text-text-muted">{score}% relevant</span>
          </div>
        </div>
        <span className={`text-xs font-mono-data font-bold ${TONE[impactSign(annual)]}`}>{formatAnnual(annual)}</span>
      </div>
    ))}
  </div>
);

const MockupAdvisor = () => (
  <div className="space-y-3">
    <div className="flex justify-end">
      <div className="bg-primary/20 border border-primary/20 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%]">
        <p className="text-meta text-primary-300">What if my state raised its minimum wage?</p>
      </div>
    </div>
    <div className="flex justify-start">
      <div className={`${nestedGlass} rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%]`}>
        <p className="text-meta text-text-muted leading-relaxed">
          It depends on the household. For a sample household earning <span className="text-text-primary">{ADVISOR_MID.bracket.label}</span>, slightly
          higher prices could cost about <span className="text-negative font-mono-data font-semibold">{formatUSD(Math.abs(ADVISOR_MID.annual))}</span> a year.
          One earning <span className="text-text-primary">{ADVISOR_LOW.bracket.label.toLowerCase()}</span> with a minimum-wage worker could gain
          about <span className="text-positive font-mono-data font-semibold">{formatUSD(ADVISOR_LOW.annual)}</span>...
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2 pl-2">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      <span className="text-meta text-text-muted">Analyzing your profile...</span>
    </div>
  </div>
);

const MockupDashboard = () => {
  const totals = CATEGORIES.map(c => ({ key: c.key, cat: c.label, amount: DASHBOARD.totals[c.key] }));
  const net = totals.reduce((sum, t) => sum + t.amount, 0);
  const scale = Math.max(1, ...totals.map(t => Math.abs(t.amount)));
  return (
    <div className={`${nestedGlass} rounded-2xl p-5`}>
      <div className="text-center mb-4">
        <p className="text-meta text-text-muted font-mono-data mb-1">Net Annual Impact</p>
        <p className="font-mono-data text-3xl font-bold gradient-text-gold">{formatUSD(net, { signed: true })}</p>
        <p className="text-meta text-text-muted mt-1">across {EXAMPLE_POLICIES.length} tracked policies · {DASHBOARD.label} sample</p>
      </div>
      <div className="space-y-2">
        {totals.map(item => {
          const sign = impactSign(item.amount);
          return (
            <div key={item.key}>
              <div className="flex justify-between mb-1">
                <span className="text-meta text-text-muted">{item.cat}</span>
                <span className={`text-meta font-mono-data ${TONE[sign]}`}>{formatUSD(item.amount, { signed: true })}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                <div className={`h-full rounded-full ${BAR[sign]}`} style={{ width: `${Math.round((Math.abs(item.amount) / scale) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const mockups: Record<string, React.ComponentType> = {
  analysis: MockupAnalysis,
  discovery: MockupDiscovery,
  advisor: MockupAdvisor,
  dashboard: MockupDashboard,
};

interface FeatureShowcaseProps {
  /** True when state bills are loaded (Open States is configured). */
  stateBills: boolean;
}

export default function FeatureShowcase({ stateBills }: FeatureShowcaseProps) {
  const features = buildFeatures(stateBills);
  return (
    <section aria-labelledby="features-heading" className="py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-20">
          <p className="text-xs font-mono-data text-primary uppercase tracking-widest mb-4">Features</p>
          <h2 id="features-heading" className="font-display text-4xl sm:text-5xl font-bold text-text-primary">
            Everything you need to
            <br />
            <span className="gradient-text">understand your money</span>
          </h2>
        </Reveal>

        <div className="space-y-24">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            const Mockup = mockups[feature.mockup];
            const isEven = i % 2 === 0;

            return (
              <Reveal
                key={feature.title}
                from={isEven ? 'left' : 'right'}
                className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
              >
                {/* Content */}
                <div className={!isEven ? 'lg:order-2' : ''}>
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      aria-hidden="true"
                      className="w-10 h-10 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: feature.color + '18', border: `1px solid ${feature.color}25` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: feature.color }} />
                    </div>
                    <span className="text-xs font-mono-data uppercase tracking-widest" style={{ color: feature.color }}>
                      {feature.tag}
                    </span>
                  </div>

                  <h3 className="font-display text-3xl sm:text-4xl font-bold text-text-primary mb-4 leading-tight">
                    {feature.title}
                  </h3>
                  <p className="text-text-muted text-base leading-relaxed mb-8">
                    {feature.description}
                  </p>

                  <ul className="space-y-3 mb-8">
                    {feature.bullets.map(bullet => (
                      <li key={bullet} className="flex items-center gap-3">
                        <div
                          aria-hidden="true"
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: feature.color }}
                        />
                        <span className="text-sm text-text-muted">{bullet}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={feature.href}
                    className="inline-flex items-center gap-2 rounded-md text-sm font-medium transition-all group"
                    style={{ color: feature.color }}
                  >
                    Explore feature<span className="sr-only">: {feature.title}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                  </Link>
                </div>

                {/* Mockup (illustrative, so screen readers get a summary instead) */}
                <div className={`${!isEven ? 'lg:order-1' : ''} relative`}>
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-3xl blur-3xl opacity-20"
                    style={{ background: `radial-gradient(circle, ${feature.color}55 0%, transparent 70%)` }}
                  />
                  <p className="sr-only">{feature.preview}</p>
                  <div aria-hidden="true" className="glass-strong rounded-3xl p-8 relative z-10">
                    <p className="text-meta font-mono-data text-text-muted uppercase tracking-widest mb-5">
                      Example · illustrative figures
                    </p>
                    <Mockup />
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
