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
  PRIORITY_STAMP,
  changeRow,
  costRow,
  deepDiveHeadline,
  deepDiveRows,
  milestones,
  netReadout,
  policyFromAnalysis,
  profileChips,
  radarData,
  recordFacts,
  resourceLinks,
  shareText,
  snapshotFromRow,
  taxRatePlate,
  waterfallLevels,
  yearlyLedger,
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
      'Overview', 'Financial breakdown', 'Timeline', 'Economic context', 'Deep dive', 'Things to consider',
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
    expect(levels.map((l) => l.label)).toEqual(['Macro — Economy', expect.stringMatching(/^Corporate — /), 'Personal — Your wallet']);
    expect(levels[2]).toMatchObject({ direction: 'positive', sublabel: '+$100/mo · +$1,200/yr' });
    const cost = waterfallLevels(analysis({ personal: { disposableIncomeMonthly: -30, disposableIncomeAnnual: -360 } }), false, 60000);
    expect(cost[2].direction).toBe('negative');
    levels.forEach((l) => expect(l.magnitude).toBeGreaterThanOrEqual(0));
    levels.forEach((l) => expect(l.magnitude).toBeLessThanOrEqual(100));
  });

  it('draws each bar linear from 0 on its own named scale, and no bar (never teal) for no change', () => {
    // $1,200 a year of a $60,000 income is 2% of it, on a 0–5% scale: 40% of the bar.
    const levels = waterfallLevels(analysis({ macro: { gdpImpactPct: 0.1 }, corporate: { equityPortfolioImpactPct: -2.5 } }), false, 60000);
    expect(levels[0]).toMatchObject({ magnitude: 10, scale: 'Bar: 0 to 1% of GDP, linear', barDirection: 'positive' });
    expect(levels[1]).toMatchObject({ magnitude: 25, scale: 'Bar: 0 to 10% equity change, linear', barDirection: 'negative' });
    expect(levels[2].magnitude).toBeCloseTo(40, 5);
    expect(levels[2].scale).toBe('Bar: 0 to 5% of your income, linear');
    // All three at 0 (what missing figures become): no bars, no direction.
    const flat = waterfallLevels(analysis({ macro: {}, corporate: {}, personal: { disposableIncomeMonthly: 0, disposableIncomeAnnual: 0 } }), false, 60000);
    for (const l of flat) {
      expect(l.magnitude).toBe(0);
      expect(l.scale).toBeUndefined();
      expect(l.barDirection).toBe('neutral');
    }
    expect(flat[0].direction).toBe('neutral');
    expect(flat[2].direction).toBe('neutral');
    expect(waterfallLevels(analysis({ macro: {} }), true, 60000)[0].sublabel).toBe('Growth unchanged · Prices unchanged');
  });

  it('labels the six vulnerability scores for the reading mode', () => {
    const expert = radarData(analysis(), false);
    expect(expert).toHaveLength(6);
    expect(expert[3]).toEqual({ dimension: 'Cost-of-living pressure', score: 70 });
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

  it('says a figure that doesn’t move one way, "No change", and signs the rest with the true minus', () => {
    const still = analysis({
      housing: { monthlyHousingEffect: 0, propertyValueChangePct: 0, affordabilityIndexChange: 0 },
      employment: { jobSecurityRisk: 20, wageGrowthPct: 0, benefitChangeValue: 0 },
      retirement: { contributionLimitChange: 0, socialSecurityChange: 0, timelineImpactYears: 0 },
      ripple: { inflationImpactPct: 0, costOfLivingChange: 0, purchasingPowerChange: 0 },
    });
    for (const key of ['housing', 'employment', 'retirement', 'ripple']) {
      for (const row of deepDiveRows(still, key).filter((r) => r.label !== 'Job security risk')) {
        expect(row, `${key}: ${row.label}`).toMatchObject({ value: 'No change' });
        expect(row.positive, `${key}: ${row.label}`).toBeUndefined();
      }
    }
    const moved = analysis({
      housing: { monthlyHousingEffect: 0, propertyValueChangePct: -1.5, affordabilityIndexChange: -2 },
      retirement: { contributionLimitChange: 500, socialSecurityChange: -40, timelineImpactYears: 1 },
    });
    const row = (key: string, label: string) => deepDiveRows(moved, key).find((r) => r.label === label);
    expect(row('housing', 'Property value change')).toMatchObject({ value: '−1.5%', positive: false });
    // An index with no agreed better way: signed, in ink.
    expect(row('housing', 'Affordability index change')).toEqual({ label: 'Affordability index change', value: '−2' });
    expect(row('retirement', 'Social Security benefits')).toMatchObject({ value: '−$40', positive: false, cue: -40, kind: 'income' });
    expect(row('retirement', 'Retirement timeline')).toMatchObject({ value: '+1 yr', positive: false });
    expect(changeRow('Retirement timeline', -2.5, 'plain', { way: 'down', suffix: ' yrs' })).toMatchObject({ value: '−2.5 yrs', positive: true });
  });

  it('has rows for every section and none for an unknown one', () => {
    for (const key of ['housing', 'employment', 'healthcare', 'retirement', 'education', 'tax', 'ripple']) {
      expect(deepDiveRows(analysis(), key).length).toBeGreaterThan(0);
    }
    expect(deepDiveRows(analysis(), 'nope')).toEqual([]);
  });
});

describe('the yearly ledger, the tax-rate plate and the deep dive glyphs', () => {
  it('itemizes the same flows as the overview, largest first, adding up to the net', () => {
    const ledger = yearlyLedger(analysis());
    expect(ledger.lines.map((l) => [l.label, l.value])).toEqual([['Taxes', 1500], ['Housing', -300]]);
    expect(ledger).toMatchObject({ gains: 1500, costs: 300, gross: 1800, net: 1200, largest: 1500 });
    expect(ledger.lines[1].bar).toBeCloseTo(0.2, 5);
    expect(ledger.lines[0].share).toBeCloseTo(1500 / 1800, 5);
    // A net the categories don't add up to gets its "Other effects" line, so the ledger still sums to it.
    const rest = yearlyLedger(analysis({ netAnnualImpact: 1000 }));
    expect(rest.lines.find((l) => l.rest)).toMatchObject({ label: 'Other effects', value: -200 });
    expect(rest.net).toBe(1000);
    expect(yearlyLedger(analysis({ netAnnualImpact: 0, categoryImpacts: {} })).lines).toEqual([]);
    expect([shareText(0.004), shareText(0.5), shareText(0)]).toEqual(['<1%', '50%', '0%']);
  });

  it('puts the tax rate before and after on one linear track from 0%, and says nothing for an unestimated rate', () => {
    const plate = taxRatePlate(analysis());
    expect(plate).toMatchObject({ before: 12, after: 11.5, top: 15, change: -0.5, tone: 'gain', words: '0.5 points lower', cue: 'saves you' });
    expect(plate!.at.before).toBeCloseTo(0.8, 5);
    expect(taxRatePlate(analysis({ tax: { effectiveRateBefore: 9, effectiveRateAfter: 10 } }))).toMatchObject({ top: 10, tone: 'loss', words: '1 point higher' });
    expect(taxRatePlate(analysis({ tax: {} }))).toBeNull();
  });

  it('heads each deep-dive area with the analysis’s own yearly amount for it', () => {
    const a = analysis({ ripple: { costOfLivingChange: -120 } });
    expect(deepDiveHeadline(a, 'tax')).toBe(1500);
    expect(deepDiveHeadline(a, 'housing')).toBe(-300);
    expect(deepDiveHeadline(a, 'healthcare')).toBe(0);
    expect(deepDiveHeadline(a, 'ripple')).toBe(-120);
    expect(deepDiveHeadline(a, 'nope')).toBe(0);
  });

  it('stamps priorities in the violet family, never gold, caution or danger', () => {
    for (const p of Object.values(PRIORITY_STAMP)) expect(p.className).not.toMatch(/gold|caution|danger/);
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
    // The chip is neutral ink, never gold or a warning colour, and so is the provenance note.
    expect(unverified).toMatch(/<span class="[^"]*border-dashed border-fg\/20[^"]*text-muted"><svg[\s\S]*?<\/svg> Unverified<\/span>/);
    expect(unverified).toContain('Stage not shown');
    expect(unverified).toContain('Not verified against an official source');
    expect(unverified).not.toContain('text-caution');
    // The model's guess at the stage is never shown, nor lights the column as law.
    expect(unverified).not.toContain('Status:');
    const enacted = header(analysis({ status: 'enacted', record: { ...RECORD, verified: false, source: 'ai' } }, { ...POLICY, status: 'enacted', record: undefined }));
    expect(enacted).not.toContain('Status:');
    expect(enacted).toContain('isn’t checked against an official record');
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
    // "Show the whole year" is always there (pressing it never drops focus), quiet while the whole year shows.
    expect(html).toMatch(/<button type="button" aria-disabled="true"[^>]*>Show the whole year<\/button>/);
  });

  it('prints every spending figure with the terrain, as its caption', () => {
    const html = render(h(TerrainView, { a: analysis({ spendingVelocity: [{ category: 'Groceries', dollarImpact: -12 }, { category: 'Fuel', dollarImpact: 0 }] }) }));
    expect(html).toContain('−$12/mo');
    expect(html).toContain('Flat porcelain: no change');
  });

  it('prints the six vulnerability scores the crystal is shaped by, which way they run, and numbers them over the view', () => {
    const html = render(h(CrystalView, { a: analysis(), simple: false }));
    expect(html).toContain('Cost-of-living pressure');
    expect(html).toMatch(/>70<span[^>]*>\/100/);
    expect(html).toContain('higher = more at risk');
    expect(html).toContain('more pressure on you (more at risk)');
    // Six numbers laid over the view (decoration), matching the six numbered rows.
    const marks = html.slice(html.indexOf('data-view-marks'));
    expect((marks.match(/-translate-x-1\/2 -translate-y-1\/2/g) ?? []).length).toBe(6);
  });

  it('numbers the terrain’s tiles as its heatmap numbers their categories', () => {
    const a = analysis({ spendingVelocity: [{ category: 'Groceries', dollarImpact: -12 }, { category: 'Fuel', dollarImpact: 4 }] });
    const html = render(h(TerrainView, { a }));
    expect(html).toContain('data-view-marks');
    expect(html).toMatch(/aria-hidden="true" class="[^"]*rounded-full[^"]*">1<\/span><span class="min-w-0">Groceries/);
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
    // The stale-profile note is violet ink: a note, not a warning.
    expect(html).toMatch(/border-primary\/25 bg-primary\/\[0\.06\][^>]*>[\s\S]*?Your financial profile changed/);
    expect(html).not.toContain('bg-caution');
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
      render(h(OverviewTab, { a, simple: false, income: 60000, applies })),
      render(h(BreakdownTab, { a, simple: false })),
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
    expect(tabs[3]).toContain('Your vulnerability profile');
    expect(tabs[4]).toContain('aria-expanded="true"');
    expect(tabs[5]).toContain('role="checkbox"');
    // The overview's flow states every category: no second category chart under it.
    expect(tabs[0]).not.toContain('Impact by Category');
    // The breakdown is a printed ledger and a tax-rate plate: every figure in text, no chart to load.
    expect(tabs[1]).toContain('Your yearly <em>ledger</em>');
    expect(tabs[1]).toContain('+$1,500/yr');
    expect(tabs[1]).toContain('Altogether, saves you');
    expect(tabs[1]).toContain('0.5 points lower');
    expect(tabs[1]).not.toContain('Loading chart…');
    // Each deep-dive area carries its yearly amount, signed and in words.
    expect(tabs[4]).toMatch(/Housing<\/span><span[^>]*>[\s\S]*?−\$300\/yr/);
    // The checklist's tally and each line's priority stamp, in words.
    expect(tabs[5]).toContain('0 of 1 done');
    expect(tabs[5]).toContain(', priority: </span>Medium');
  });

  it('says so when the analysis has no suggestions or listed uncertainties, rather than heading an empty list', () => {
    const a = analysis({ recommendations: [], riskFactors: { uncertainties: [] } });
    const applies = applicability({ employmentStatus: 'employed_full', housingSituation: 'rent' });
    expect(render(h(OverviewTab, { a, simple: false, income: 60000, applies }))).toContain('This analysis didn’t suggest anything to consider.');
    const action = render(h(ActionTab, { a }));
    expect(action).toContain('This analysis didn’t suggest anything to consider.');
    expect(action).not.toContain('done');
    expect(action).toContain('No specific uncertainties were listed');
  });
});
