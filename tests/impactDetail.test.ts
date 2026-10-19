import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { coerceFullAnalysis } from '@/lib/analysisSchema';
import { FILING_STATUSES, labelOf } from '@/lib/profileOptions';
import type { FullAnalysis, Policy, PolicyRecord } from '@/types';
import {
  TABS,
  TAB_LABELS,
  better,
  costRow,
  deepDiveRows,
  milestones,
  netReadout,
  policyFromAnalysis,
  profileChips,
  radarData,
  recordFacts,
  resourceLinks,
  snapshotFromRow,
  waterfallLevels,
} from '@/app/impact/[policyId]/_components/detailModel';
import { DetailSkeleton, NoAnalysis } from '@/app/impact/[policyId]/_components/DetailStates';
import TransmissionHeader from '@/app/impact/[policyId]/_components/TransmissionHeader';
import { CrystalView, FlowView, RibbonView, TerrainView } from '@/app/impact/[policyId]/_components/visuals';
import DetailView from '@/app/impact/[policyId]/_components/DetailView';
import OverviewTab from '@/app/impact/[policyId]/_components/OverviewTab';
import BreakdownTab from '@/app/impact/[policyId]/_components/BreakdownTab';
import TimelineTab from '@/app/impact/[policyId]/_components/TimelineTab';
import EconomicTab from '@/app/impact/[policyId]/_components/EconomicTab';
import DeepDiveTab from '@/app/impact/[policyId]/_components/DeepDiveTab';
import ActionTab from '@/app/impact/[policyId]/_components/ActionTab';
import type { ImpactDetail } from '@/app/impact/[policyId]/_components/useImpactDetail';
import { applicability } from '@/lib/applicability';

// ---------------------------------------------------------------------------
// Fixtures: an analysis normalized exactly as the page normalizes a stored one
// ---------------------------------------------------------------------------

const RECORD: PolicyRecord = {
  verified: true,
  source: 'congress.gov',
  sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1001',
  latestActionDate: '2026-09-15',
  latestAction: 'Referred to the Committee on Ways and Means.',
  asOf: '2026-10-18T12:00:00Z',
  status: 'proposed',
  billNumber: 'H.R. 1001',
  region: 'Federal',
  congress: 119,
  billType: 'hr',
  number: '1001',
};

const POLICY: Policy = {
  id: 'us-119-hr-1001', title: 'Working Families Tax Credit Act', summary: '', description: '', category: 'taxes',
  status: 'proposed', date: '2026-09-15', source: 'congress.gov', sourceUrl: RECORD.sourceUrl!, governingBody: 'H.R. 1001',
  region: 'Federal', confidenceLevel: 'medium', impacts: [], assumptions: [], tags: [], record: RECORD,
};

function analysis(over: Record<string, unknown> = {}, policy: Policy = POLICY): FullAnalysis {
  return coerceFullAnalysis(
    {
      plainEnglishSummary: 'If it passes as written, your refundable credit could rise by about $1,200 a year.',
      netAnnualImpact: 1200,
      netMonthlyImpact: 100,
      confidenceScore: 64,
      direction: 'positive',
      categoryImpacts: { taxes: 1500, housing: -300 },
      timeline: {
        year1: 1200, year3: 3900, year5: 6100,
        monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, impact: (i + 1) * 100 })),
      },
      tax: { federalLiabilityChange: 50, stateLiabilityChange: -20, effectiveRateBefore: 12, effectiveRateAfter: 11.5 },
      vulnerability: { incomeStability: 30, housingSecurity: 55, employmentRisk: 20, costOfLivingPressure: 70, investmentExposure: 10, debtBurden: 40 },
      personal: { disposableIncomeMonthly: 100, disposableIncomeAnnual: 1200 },
      recommendations: [{ step: 'Check your withholding next year', priority: 'medium' }],
      record: RECORD,
      ...over,
    },
    policy,
  );
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

describe('the detail tabs', () => {
  it('keep their ids, order and labels (the journey, deep links and the keyboard tests use them)', () => {
    expect(TABS).toEqual(['overview', 'breakdown', 'timeline', 'economic', 'deepdive', 'action']);
    expect(TABS.map((t) => TAB_LABELS[t])).toEqual([
      'Overview', 'Financial Breakdown', 'Timeline', 'Economic Context', 'Deep Dive', 'Things to Consider',
    ]);
  });
});

describe('policyFromAnalysis / snapshotFromRow', () => {
  it('normalizes a stored analysis with the policy id as the title of last resort', () => {
    expect(policyFromAnalysis('oh-2025-sb-1', {})).toMatchObject({ id: 'oh-2025-sb-1', title: 'oh-2025-sb-1', category: 'taxes' });
    expect(policyFromAnalysis('x', { policyTitle: 'A Bill', billNumber: 'S. 2', category: 'housing' }))
      .toMatchObject({ title: 'A Bill', governingBody: 'S. 2', category: 'housing' });
  });

  it('reads the profile row the analysis falls back to', () => {
    expect(snapshotFromRow({ state: 'Ohio', income_range: '50k_75k', dependents_count: 2, debt_types: ['mortgage'] }))
      .toEqual({ state: 'Ohio', incomeRange: '50k_75k', filingStatus: undefined, housingSituation: undefined, employmentStatus: undefined, dependentsCount: 2, debtTypes: ['mortgage'] });
    expect(snapshotFromRow({ debt_types: 'mortgage' })).toMatchObject({ dependentsCount: null, debtTypes: null });
  });
});

describe('profileChips', () => {
  it('names the answers the estimate used, in words', () => {
    expect(profileChips({ incomeRange: '50k_75k', state: 'Ohio', filingStatus: 'married_joint', dependentsCount: 2 }))
      .toEqual(['$50,000 – $75,000', 'Ohio', labelOf(FILING_STATUSES, 'married_joint'), '2 dependents']);
    expect(profileChips({ dependentsCount: 1 })).toEqual(['1 dependent']);
    expect(profileChips({ dependentsCount: 0 })).toEqual([]);
    expect(profileChips(null)).toEqual([]);
  });
});

describe('recordFacts', () => {
  it('names the source and the chamber only for a verified record', () => {
    const facts = recordFacts(analysis(), 'House');
    expect(facts).toMatchObject({ verified: true, source: 'Congress.gov', billNumber: 'H.R. 1001' });
    expect(facts.line).toBe('Congress.gov · Federal · House');
  });

  it('never borrows the record’s authority for an unverified policy', () => {
    const facts = recordFacts({ record: { ...RECORD, verified: false, source: 'ai' }, billNumber: 'H.R. 9' }, 'House');
    expect(facts.verified).toBe(false);
    expect(facts.source).toBeNull();
    expect(facts.line).toBe('Federal');
    expect(facts.line).not.toContain('House');
    expect(recordFacts({ record: undefined, billNumber: '' }, null)).toMatchObject({ verified: false, billNumber: null, line: '' });
  });
});

describe('netReadout', () => {
  it('pairs the sign and colour with words, so direction never rests on colour', () => {
    expect(netReadout(1200)).toEqual({ sign: 'gain', tone: 'text-gain', words: 'saves you', yearly: '+$1,200/yr' });
    expect(netReadout(-340)).toEqual({ sign: 'loss', tone: 'text-loss', words: 'costs you', yearly: '−$340/yr' });
    expect(netReadout(0.4)).toMatchObject({ sign: 'neutral', tone: 'text-muted', words: 'no change' });
  });
});

describe('milestones', () => {
  it('reads the real 1/3/5-year projections, not a multiple of year one', () => {
    const steps = milestones(analysis(), false);
    expect(steps.map((s) => s.label)).toEqual(['Month 1', 'Month 6', 'Year 1', 'Year 3', 'Year 5']);
    expect(steps.map((s) => s.value)).toEqual([100, 600, 1200, 3900, 6100]);
    expect(milestones(analysis(), true)[0].label).toBe('After the first month');
  });
});

describe('waterfallLevels / radarData', () => {
  it('runs macro → corporate → personal, the personal tier signed by the wallet', () => {
    const levels = waterfallLevels(analysis(), false, 60000);
    expect(levels.map((l) => l.label)).toEqual(['Macro — Economy', expect.stringMatching(/^Corporate — /), 'Personal — Your Wallet']);
    expect(levels[2]).toMatchObject({ direction: 'positive', sublabel: '+$100/mo · +$1,200/yr' });
    const cost = waterfallLevels(analysis({ personal: { disposableIncomeMonthly: -30, disposableIncomeAnnual: -360 } }), false, 60000);
    expect(cost[2].direction).toBe('negative');
    levels.forEach((l) => expect(l.magnitude).toBeGreaterThanOrEqual(0));
    levels.forEach((l) => expect(l.magnitude).toBeLessThanOrEqual(100));
  });

  it('labels the six vulnerability scores for the reading mode', () => {
    const expert = radarData(analysis(), false);
    expect(expert).toHaveLength(6);
    expect(expert[3]).toEqual({ dimension: 'Cost of Living Pressure', score: 70 });
    expect(radarData(analysis(), true)[0].dimension).toBe('Will my paycheck be safe');
  });
});

describe('deepDiveRows', () => {
  it('states what the user pays as higher or lower, never with a sign that reads backwards', () => {
    expect(costRow('Federal income tax', 50)).toEqual({ label: 'Federal income tax', value: '$50 lower', positive: true });
    expect(costRow('State income tax', -20)).toEqual({ label: 'State income tax', value: '$20 higher', positive: false });
    expect(costRow('Rent', 0)).toEqual({ label: 'Rent', value: 'No change', positive: undefined });
    const tax = deepDiveRows(analysis(), 'tax');
    expect(tax[0]).toMatchObject({ label: 'Federal income tax', value: '$50 lower' });
    expect(tax[2]).toMatchObject({ label: 'Effective rate', value: '12% → 11.5%', positive: true });
  });

  it('colours a figure only when it moves: zero stays in ink, not the gain colour', () => {
    expect(better(0.4)).toBe(true);
    expect(better(-0.4)).toBe(false);
    expect(better(0)).toBeUndefined();
    expect(better(0.4, 'down')).toBe(false);
    expect(better(-0.4, 'down')).toBe(true);
    expect(better(Number.NaN)).toBeUndefined();
    const housing = deepDiveRows(analysis(), 'housing');
    const property = housing.find((r) => r.label === 'Property value change');
    expect(property?.positive).toBe(better(analysis().housing.propertyValueChangePct));
  });

  it('has rows for every section and none for an unknown one', () => {
    for (const key of ['housing', 'employment', 'healthcare', 'retirement', 'education', 'tax', 'ripple']) {
      expect(deepDiveRows(analysis(), key).length).toBeGreaterThan(0);
    }
    expect(deepDiveRows(analysis(), 'nope')).toEqual([]);
  });
});

describe('resourceLinks', () => {
  it('links only to https government pages and the record search, with the bill number encoded', () => {
    const links = resourceLinks('taxes', 'H.R. 1001');
    expect(links[0]).toEqual({ label: 'Track H.R. 1001 on Congress.gov', url: 'https://www.congress.gov/search?q=H.R.%201001' });
    expect(links.map((l) => l.label)).toContain('IRS — Tax updates');
    links.forEach((l) => expect(l.url).toMatch(/^https:\/\//));
    expect(resourceLinks('housing', '')[0]).toEqual({ label: 'Search Congress.gov', url: 'https://www.congress.gov' });
  });
});

// ---------------------------------------------------------------------------
// What the server sends before the analysis arrives
// ---------------------------------------------------------------------------

describe('DetailSkeleton / NoAnalysis', () => {
  it('says it is loading, in a status region, and draws only decoration', () => {
    const html = renderToString(h(DetailSkeleton));
    expect(html).toMatch(/role="status"[^>]*>.*Loading your analysis…/);
    expect(html).not.toContain('<h1');
    expect(renderToString(h(DetailSkeleton, { generating: true }))).toContain('Compiling your full financial analysis…');
  });

  it('keeps the h1s the journey checks for, and the generate action', () => {
    const none = renderToString(h(NoAnalysis, { legacy: false, generating: false, error: null, onGenerate: () => {} }));
    expect(none).toMatch(/<h1[^>]*>No analysis yet<\/h1>/);
    expect(none).toContain('Generate analysis');
    expect(none).not.toContain('role="alert"');
    const legacy = renderToString(h(NoAnalysis, { legacy: true, generating: false, error: 'The last attempt failed', onGenerate: () => {} }));
    expect(legacy).toMatch(/<h1[^>]*>Update this analysis<\/h1>/);
    expect(legacy).toContain('Generate full analysis');
    expect(legacy).toMatch(/role="alert"[^>]*>The last attempt failed/);
    const busy = renderToString(h(NoAnalysis, { legacy: false, generating: true, error: null, onGenerate: () => {} }));
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toContain('Generating…');
  });
});

// ---------------------------------------------------------------------------
// The hero and the 3D views, as first rendered (posters, before any 3D)
// ---------------------------------------------------------------------------

/** Server HTML without React's text-node separators, so adjacent strings read as one. */
const render = (el: Parameters<typeof renderToString>[0]) => renderToString(el).replaceAll('<!-- -->', '');

describe('TransmissionHeader', () => {
  const header = (a: FullAnalysis) => render(h(TransmissionHeader, { a, analyzedAt: null, profileChips: ['Ohio'] }));

  it('keeps the title as the page’s h1, with the net, its sign and its words', () => {
    const html = header(analysis());
    expect(html).toMatch(/<h1 id="impact-title"[^>]*>Working Families Tax Credit Act<\/h1>/);
    expect(html).toContain('+$1,200');
    expect(html).toContain('+$1,200 per year, saves you');
    expect(html).toContain('text-gain');
    const cost = header(analysis({ netAnnualImpact: -340, netMonthlyImpact: -28, direction: 'negative', categoryImpacts: { housing: -340 } }));
    expect(cost).toContain('−$340 per year, costs you');
    expect(cost).toContain('text-loss');
  });

  it('shows the archive-gold seal and the chamber only for a verified record, with the bill’s stage as of its date', () => {
    const html = header(analysis());
    expect(html).toContain('Official record');
    expect(html).toContain('H.R. 1001 · Congress.gov · Federal · House');
    expect(html).not.toContain('Unverified');
    expect(html).toMatch(/In committee/);
    expect(html).toContain('as of Oct 18, 2026');

    const unverified = header(analysis({ record: { ...RECORD, verified: false, source: 'ai' } }, { ...POLICY, record: undefined }));
    expect(unverified).toContain('Unverified');
    expect(unverified).not.toContain('Official record');
    expect(unverified).not.toContain('text-gold');
    // The chip is neutral ink, never the caution ochre (which reads as archive gold).
    expect(unverified).toMatch(/<span class="[^"]*border-dashed border-fg\/20[^"]*text-muted"><svg[\s\S]*?<\/svg> Unverified<\/span>/);
    expect(unverified).toContain('Stage not shown');
  });

  it('puts the number before the scene on a phone, the stage full width beside it on a desktop', () => {
    const html = header(analysis());
    // The plate (with the number) is the figure's caption, ordered first below lg.
    expect(html).toMatch(/<figcaption[^>]*max-lg:order-first[^>]*>[\s\S]*Net annual impact/);
    expect(html).toMatch(/<figure[^>]*lg:col-span-12/);
    // The h1 still comes first in the markup.
    expect(html.indexOf('id="impact-title"')).toBeLessThan(html.indexOf('<figure'));
  });

  it('draws the scene’s poster in an aria-hidden layer and names the picture in words', () => {
    const html = header(analysis());
    expect(html).toContain('data-scene-view="poster"');
    expect(html).toMatch(/role="img" aria-label="[^"]*\+\$1,200/);
    expect(html).toContain('data-scene-night=""');
  });
});

describe('the tab visuals', () => {
  it('lists every flow with its sign and words, adding up to the net', () => {
    const html = render(h(FlowView, { a: analysis() }));
    expect(html).toContain('Where the money goes');
    expect(html).toContain('+$1,500/yr');
    expect(html).toContain('−$300/yr');
    expect(html).toContain('costs you');
    expect(html).toContain('Your net');
  });

  it('shows an honest empty state instead of a picture of zeros', () => {
    const empty = analysis({ netAnnualImpact: 0, netMonthlyImpact: 0, categoryImpacts: {}, vulnerability: {}, spendingVelocity: [] });
    expect(render(h(FlowView, { a: empty }))).toContain('no yearly amounts by category');
    expect(render(h(CrystalView, { a: empty, simple: false }))).toContain('no vulnerability scores');
    expect(render(h(TerrainView, { a: empty }))).toContain('no spending categories');
    for (const html of [render(h(FlowView, { a: empty })), render(h(CrystalView, { a: empty, simple: false }))]) {
      expect(html).not.toContain('data-scene-view');
    }
  });

  it('numbers each flow as its channel is numbered beside the view', () => {
    const html = render(h(FlowView, { a: analysis() }));
    // A badge per row, and the same numbers laid over the view (decoration: the list carries them).
    expect(html).toMatch(/aria-hidden="true" class="[^"]*rounded-full border[^"]*">1<\/span>/);
    expect(html).toMatch(/aria-hidden="true" data-decorative="" class="pointer-events-none absolute inset-0 hidden sm:block"/);
  });

  it('labels the ribbon’s width as uncertainty, with a month control as the keyboard way in', () => {
    const html = render(h(RibbonView, { a: analysis(), simple: false }));
    expect(html).toContain('Ribbon width shows uncertainty');
    // Not a range of dollars, and a key that draws the widths in proportion.
    expect(html).toContain('isn’t a range of dollars');
    expect(html).toContain('This estimate');
    expect(html).toContain('wider = less certain');
    expect(html).toContain('64/100');
    expect(html).toMatch(/<input[^>]*type="range"[^>]*min="1"[^>]*max="12"/);
    expect(html).toContain('aria-valuetext="Month 12: +$1,200 so far, saves you"');
    expect(render(h(RibbonView, { a: analysis({ confidenceScore: 0 }), simple: false }))).toContain('wasn’t rated');
  });

  it('prints every spending figure with the terrain, as its caption', () => {
    const html = render(h(TerrainView, { a: analysis({ spendingVelocity: [{ category: 'Groceries', dollarImpact: -12 }, { category: 'Fuel', dollarImpact: 0 }] }) }));
    expect(html).toContain('−$12/mo');
    expect(html).toContain('Flat porcelain: no change');
  });

  it('prints the six vulnerability scores the crystal is shaped by', () => {
    const html = render(h(CrystalView, { a: analysis(), simple: false }));
    expect(html).toContain('Cost of Living Pressure');
    expect(html).toMatch(/>70<span[^>]*>\/100/);
  });
});

describe('DetailView and its tabs', () => {
  const detail = (a: FullAnalysis): ImpactDetail => ({
    analysis: a, profile: { state: 'Ohio', incomeRange: '50k_75k' }, loading: false, generating: false, notFound: false, legacy: false,
    analyzedAt: null, generateError: null, stale: true, tab: 'overview', setTab: () => {}, generate: () => {}, deleteAnalysis: async () => null,
  });

  it('keeps the tab list, the delete control’s name and the stale-profile action', () => {
    const a = analysis();
    const html = render(h(DetailView, { detail: detail(a), analysis: a, policyId: a.policyId }));
    expect(html).toMatch(/role="tablist" aria-label="Analysis sections"/);
    for (const t of TABS) expect(html).toContain(`>${TAB_LABELS[t].replace('&', '&amp;')}</button>`);
    expect(html).toContain('aria-label="Delete this analysis"');
    expect(html).toContain('Re-analyze with my current profile');
    expect(html).toMatch(/<h1 id="impact-title"[^>]*>Working Families Tax Credit Act<\/h1>/);
    // The confirmation is in-app (a closed <dialog>), never window.confirm.
    expect(html).toMatch(/<dialog[^>]*role="alertdialog"/);
  });

  it('gives the vulnerability pair one honest empty state, and an unscored uncertainty as not rated', () => {
    const applies = applicability({ employmentStatus: 'employed_full', housingSituation: 'rent' });
    const empty = analysis({ vulnerability: {}, macro: { economicUncertaintyScore: 0 } });
    const html = render(h(EconomicTab, { a: empty, simple: false, income: 60000, applies }));
    // No radar of zeros beside the crystal's empty state.
    expect(html).toContain('no crystal or chart to draw');
    expect(html).not.toContain('Most pressure');
    expect(html).not.toContain('The vulnerability crystal');
    expect(html).toMatch(/Economic uncertainty<\/span><span class="[^"]*text-ink">Not rated</);
    const scored = render(h(EconomicTab, { a: analysis({ macro: { economicUncertaintyScore: 40 } }), simple: false, income: 60000, applies }));
    expect(scored).toContain('40/100');
    expect(scored).toContain('The vulnerability crystal');
  });

  it('renders every tab from a normalized analysis', () => {
    const a = analysis({ spendingVelocity: [{ category: 'Groceries', dollarImpact: -12, direction: 'negative' }] });
    const applies = applicability({ employmentStatus: 'employed_full', housingSituation: 'rent' });
    const tabs = [
      render(h(OverviewTab, { a, categoryBars: [{ name: 'Taxes', value: 1500 }], simple: false, income: 60000, applies })),
      render(h(BreakdownTab, { a, categoryBars: [{ name: 'Taxes', value: 1500 }], simple: false })),
      render(h(TimelineTab, { a, simple: false })),
      render(h(EconomicTab, { a, simple: false, income: 60000, applies })),
      render(h(DeepDiveTab, { a })),
      render(h(ActionTab, { a })),
    ];
    expect(tabs[0]).toContain('Where the money goes');
    expect(tabs[2]).toContain('wider = less certain');
    expect(tabs[3]).toContain('The vulnerability crystal');
    expect(tabs[3]).toContain('The spending terrain');
    expect(tabs[3]).toContain('−$12/mo');
    expect(tabs[3]).toContain('Your Vulnerability Profile');
    expect(tabs[4]).toContain('aria-expanded="true"');
    expect(tabs[5]).toContain('role="checkbox"');
    // Charts load with their tab (code-split): the server holds their place.
    expect(tabs[1]).toContain('Loading chart…');
  });
});
