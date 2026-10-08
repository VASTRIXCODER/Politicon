import { BarChart2, Compass, MessageSquare, PieChart, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Reveal from './Reveal';

const features = [
  {
    icon: BarChart2,
    tag: 'Core Feature',
    title: 'Personalized Impact Analysis',
    description: 'Every policy runs through our AI reasoning engine, calibrated to your exact income bracket, location, housing situation, and life stage. No generic estimates.',
    bullets: [
      'Immediate dollar effects in your pocket',
      '1, 3, and 5-year projections',
      'Transparent methodology — no black boxes',
      'Confidence scoring on every estimate',
    ],
    color: '#7B61FF',
    href: '/policies',
    mockup: 'analysis',
    preview: 'Example preview: a student loan rate change shown as before-and-after monthly payments and lifetime savings.',
  },
  {
    icon: Compass,
    tag: 'Discovery',
    title: 'AI Policy Discovery',
    description: 'Stop missing policies that could save or cost you thousands. Our AI continuously scans legislation and ranks them by relevance to your financial profile.',
    bullets: [
      'Relevance score for your situation',
      'Alerts when high-impact bills move',
      'Coverage across all 50 states',
      'Updated within 24 hours of news',
    ],
    color: '#00D4FF',
    href: '/policies',
    mockup: 'discovery',
    preview: 'Example preview: three policies ranked by how relevant they are to a profile, each with its dollar impact.',
  },
  {
    icon: MessageSquare,
    tag: 'AI Policy Guide',
    title: 'Your AI Policy Guide',
    description: "Ask anything about how policies affect your life. The AI knows your profile and answers with dollar specifics, not political talking points.",
    bullets: [
      'Full profile context in every answer',
      'Compare two policies side-by-side',
      'Actionable recommendations',
      'Scenario modeling (what if?)',
    ],
    color: '#F5C842',
    href: '/advisor',
    mockup: 'advisor',
    preview: 'Example preview: a question about capital gains tax and the guide’s answer in dollars for a sample profile.',
  },
  {
    icon: PieChart,
    tag: 'Dashboard',
    title: 'Cumulative Impact Dashboard',
    description: 'Track every policy you\'ve analyzed. See your total net annual impact, broken down by category, with an exportable summary card.',
    bullets: [
      'Net annual impact in big gold numbers',
      'Breakdown by category (taxes, housing...)',
      'Sortable policy tracker',
      'Shareable PNG summary card',
    ],
    color: '#7B61FF',
    href: '/impact',
    mockup: 'dashboard',
    preview: 'Example preview: a net annual impact total with a breakdown by category.',
  },
];

// The mockups below are illustrations; FeatureShowcase hides them from screen
// readers and gives each a one-line summary instead. Inner glass panels skip
// backdrop-filter: they already sit on a blurred glass-strong panel.
const nestedGlass = 'glass backdrop-filter-none';

const MockupAnalysis = () => (
  <div className={`${nestedGlass} rounded-2xl p-5 text-left`}>
    <p className="text-meta font-mono-data text-text-muted uppercase tracking-widest mb-3">Student Loan Rate Adjustment</p>
    <div className="space-y-3">
      {[
        { label: 'Monthly payment', before: '$487', after: '$402', delta: '-$85/mo' },
        { label: 'Interest (10yr)', before: '$12,580', after: '$7,400', delta: '-$5,180' },
        { label: 'Take-home impact', before: '$0', after: '+$85', delta: '+$85/mo' },
      ].map(row => (
        <div key={row.label} className="flex items-center justify-between">
          <span className="text-meta text-text-muted">{row.label}</span>
          <div className="flex items-center gap-2">
            <span className="text-meta text-text-muted line-through">{row.before}</span>
            <span className="text-meta font-mono-data font-semibold text-positive">{row.delta}</span>
          </div>
        </div>
      ))}
    </div>
    <div className="mt-4 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
      <p className="text-meta text-positive font-mono-data">+$12,500 lifetime savings at current balance</p>
    </div>
  </div>
);

const MockupDiscovery = () => (
  <div className="space-y-2">
    {[
      { title: 'Healthcare Subsidy Extension', score: 96, impact: '+$2,160/yr', positive: true },
      { title: 'First-Time Homebuyer Credit', score: 91, impact: '+$15,000', positive: true },
      { title: 'Capital Gains Tax Increase', score: 44, impact: '-$340/mo', positive: false },
    ].map(item => (
      <div key={item.title} className={`${nestedGlass} rounded-xl p-3 flex items-center justify-between`}>
        <div>
          <p className="text-meta font-medium text-text-primary">{item.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1 w-16 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${item.score}%` }} />
            </div>
            <span className="text-meta text-text-muted">{item.score}% relevant</span>
          </div>
        </div>
        <span className={`text-xs font-mono-data font-bold ${item.positive ? 'text-positive' : 'text-negative'}`}>{item.impact}</span>
      </div>
    ))}
  </div>
);

const MockupAdvisor = () => (
  <div className="space-y-3">
    <div className="flex justify-end">
      <div className="bg-primary/20 border border-primary/20 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%]">
        <p className="text-meta text-primary-300">How does the new capital gains tax affect my investments?</p>
      </div>
    </div>
    <div className="flex justify-start">
      <div className={`${nestedGlass} rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%]`}>
        <p className="text-meta text-text-muted leading-relaxed">
          Based on your <span className="text-text-primary">$120k income</span> and investment profile, the proposed 28% capital gains rate would increase your annual tax burden by approximately <span className="text-negative font-mono-data font-semibold">$4,080/year</span> on a typical $50k gain...
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2 pl-2">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      <span className="text-meta text-text-muted">Analyzing your profile...</span>
    </div>
  </div>
);

const MockupDashboard = () => (
  <div className={`${nestedGlass} rounded-2xl p-5`}>
    <div className="text-center mb-4">
      <p className="text-meta text-text-muted font-mono-data mb-1">Net Annual Impact</p>
      <p className="font-mono-data text-3xl font-bold gradient-text-gold">+$6,420</p>
      <p className="text-meta text-text-muted mt-1">across 4 tracked policies</p>
    </div>
    <div className="space-y-2">
      {[
        { cat: 'Healthcare', pct: 78, val: '+$2,160' },
        { cat: 'Housing', pct: 94, val: '+$3,750' },
        { cat: 'Taxes', pct: 22, val: '+$510' },
      ].map(item => (
        <div key={item.cat}>
          <div className="flex justify-between mb-1">
            <span className="text-meta text-text-muted">{item.cat}</span>
            <span className="text-meta font-mono-data text-positive">{item.val}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
            <div className="h-full rounded-full bg-positive/50" style={{ width: `${item.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const mockups: Record<string, React.ComponentType> = {
  analysis: MockupAnalysis,
  discovery: MockupDiscovery,
  advisor: MockupAdvisor,
  dashboard: MockupDashboard,
};

export default function FeatureShowcase() {
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
                    <p className="text-meta font-mono-data text-text-muted uppercase tracking-widest mb-5">Preview</p>
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
