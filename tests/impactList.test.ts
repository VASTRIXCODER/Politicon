import { describe, expect, it, vi } from 'vitest';
import { createElement as h, type ReactElement } from 'react';
import { renderToString as renderHtml } from 'react-dom/server';
import {
  categoryName,
  latestDate,
  lineNumber,
  receiptTotals,
  shortDate,
  spokenYearly,
  yearly,
} from '@/components/impact/receipt/receiptModel';
import PolicyReceipt from '@/components/impact/receipt/PolicyReceipt';
import ReceiptSeal from '@/components/impact/receipt/ReceiptSeal';
import SkylineReadout from '@/components/impact/receipt/SkylineReadout';
import SkylineSection from '@/components/impact/receipt/SkylineSection';
import { skylineTowers } from '@/lib/skyline';
import { METHODOLOGY, ROW_COLUMNS, shownRows, sortRows, type PolicyAnalysisRow } from '@/app/impact/_components/impactModel';
import { horizonTotals, projectionLines, rankedShares, stackedByCategory, titleList } from '@/app/impact/_components/cumulativeModel';
import AnalysisBody from '@/app/impact/_components/AnalysisBody';
import CumulativeView from '@/app/impact/_components/CumulativeView';
import { LoadFailed, NoAnalyses, ReceiptSkeleton } from '@/app/impact/_components/ImpactStates';

// ViewFullImpactButton (in an opened line's summary) asks for the app router.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }) }));

/** Server HTML without React's text-node separators, so copy reads as it does on the page. */
const renderToString = (el: ReactElement) => renderHtml(el).replace(/<!-- -->/g, '');

const row = (over: Partial<PolicyAnalysisRow> & Pick<PolicyAnalysisRow, 'id'>): PolicyAnalysisRow => ({
  policy_id: `policy-${over.id}`,
  policy_title: `Policy ${over.id}`,
  dollar_impact: 0,
  category: 'taxes',
  created_at: '2026-10-01T12:00:00.000Z',
  summary: null,
  timeline: null,
  tradeoffs: null,
  recommendations: null,
  legacy: null,
  analysis_title: `Policy ${over.id}`,
  ...over,
});

const ROWS: PolicyAnalysisRow[] = [
  row({ id: 'a', policy_title: 'Child Tax Credit Expansion', dollar_impact: 1240, category: 'taxes', created_at: '2026-10-12T10:00:00Z', timeline: { year1: 1200, year3: 3900, year5: 6100 } }),
  row({ id: 'b', policy_title: 'Housing Supply Act', dollar_impact: -340, category: 'housing', created_at: '2026-10-14T10:00:00Z', timeline: { year1: -340, year3: -900, year5: -1400 } }),
  row({ id: 'c', policy_title: 'Clean Energy Rebates', dollar_impact: 0, category: 'energy', created_at: '2026-09-30T10:00:00Z', timeline: { year1: 0, year3: 250, year5: 400 } }),
  row({ id: 'd', policy_title: 'Earlier short analysis', dollar_impact: 90, category: 'social-security', legacy: true, analysis_title: null, summary: 'An earlier summary.' }),
];

describe('the receipt model', () => {
  it('subtotals the gains and the costs and nets them at the foot', () => {
    expect(receiptTotals(ROWS)).toEqual({ gains: 1330, costs: 340, net: 990, gainCount: 2, costCount: 1, flatCount: 1 });
    expect(receiptTotals([])).toEqual({ gains: 0, costs: 0, net: 0, gainCount: 0, costCount: 0, flatCount: 0 });
    expect(receiptTotals([{ dollar_impact: Number.NaN }]).flatCount).toBe(1);
  });

  it('numbers, signs and words every amount', () => {
    expect(lineNumber(0)).toBe('01');
    expect(lineNumber(11)).toBe('12');
    expect(yearly(1240)).toBe('+$1,240/yr');
    expect(yearly(-340)).toBe('−$340/yr');
    expect(spokenYearly(1240)).toBe('saves you $1,240 a year');
    expect(spokenYearly(-340)).toBe('costs you $340 a year');
    expect(spokenYearly(0)).toBe('no change a year');
  });

  it('names categories and dates', () => {
    expect(categoryName('social-security')).toBe('Social security');
    expect(categoryName('')).toBe('Other');
    expect(shortDate('2026-10-12T10:00:00Z')).toBe('Oct 12, 2026');
    expect(shortDate('not a date')).toBe('');
    expect(latestDate(ROWS)).toBe('Oct 14, 2026');
    expect(latestDate([])).toBe('');
  });
});

describe('the page model', () => {
  it('reads the same columns as before, including the real timeline', () => {
    expect(ROW_COLUMNS).toContain('dollar_impact:net_annual_impact');
    expect(ROW_COLUMNS).toContain('timeline:analysis->timeline');
    expect(ROW_COLUMNS).toContain('analysis_title:analysis->>policyTitle');
  });

  it('hides placeholders for jobs still running, keeping earlier short analyses', () => {
    const placeholder = row({ id: 'p', analysis_title: null, legacy: null });
    expect(shownRows([...ROWS, placeholder]).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('orders the receipt by the size of the impact either way, or newest first', () => {
    expect(sortRows(ROWS, 'impact').map((r) => r.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(sortRows(ROWS, 'date').map((r) => r.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it("sums each analysis's own 1, 3 and 5-year estimates, never the yearly figure times the years", () => {
    expect(horizonTotals(ROWS)).toEqual([
      { horizon: 1, total: 860, counted: 3 },
      { horizon: 3, total: 3250, counted: 3 },
      { horizon: 5, total: 5100, counted: 3 },
    ]);
    // 1240 × 3 would be 3720: the analysis said 3900.
    expect(horizonTotals([ROWS[0]])[1].total).toBe(3900);
  });

  it('charts only the policies that have every projection, with a total over the same ones, and names the rest', () => {
    const p = projectionLines(ROWS);
    expect(p.series.map((s) => s.key)).toEqual(['policy-a', 'policy-b', 'policy-c', '__total']);
    expect(p.data).toEqual([
      { name: '1 Year', 'policy-a': 1200, 'policy-b': -340, 'policy-c': 0, __total: 860 },
      { name: '3 Years', 'policy-a': 3900, 'policy-b': -900, 'policy-c': 250, __total: 3250 },
      { name: '5 Years', 'policy-a': 6100, 'policy-b': -1400, 'policy-c': 400, __total: 5100 },
    ]);
    expect(p.missing.map((r) => r.id)).toEqual(['d']);
    expect(projectionLines([ROWS[3]])).toEqual({ data: [], series: [], missing: [ROWS[3]] });
  });

  it('ranks shares of the combined size and stacks by category', () => {
    expect(rankedShares(ROWS).map(({ row: r, share }) => [r.id, share])).toEqual([
      ['a', 74],
      ['b', 20],
      ['d', 5],
      ['c', 0],
    ]);
    const s = stackedByCategory(ROWS);
    expect(s.series).toHaveLength(4);
    expect(s.data.find((d) => d.category === 'taxes')).toEqual({ category: 'taxes', 'policy-a': 1240 });
  });

  it('lists titles for notes', () => {
    expect(titleList([{ policy_title: 'A' }])).toBe('A');
    expect(titleList([{ policy_title: 'A' }, { policy_title: 'B' }])).toBe('A and B');
    expect(titleList([{ policy_title: 'A' }, { policy_title: 'B' }, { policy_title: 'C' }])).toBe('A, B and 1 more');
  });

  it('explains the projections in the methodology', () => {
    expect(METHODOLOGY.some((m) => /1, 3 and 5-year/.test(m.q))).toBe(true);
  });
});

describe('PolicyReceipt', () => {
  const lines = sortRows(ROWS, 'impact');
  const render = (props: Partial<Parameters<typeof PolicyReceipt>[0]> = {}) =>
    renderToString(h(PolicyReceipt, { lines, order: 'impact', onOrderChange: () => {}, ...props }));

  it('prints a numbered line per policy, linking to its full analysis, with sign and words', () => {
    const html = render();
    expect(html.match(/data-receipt-line=/g)).toHaveLength(4);
    expect(html).toContain('href="/impact/policy-a"');
    expect(html).toContain('href="/impact/policy-b"');
    expect(html).toContain('Child Tax Credit Expansion');
    expect(html).toContain('+$1,240/yr');
    expect(html).toContain('−$340/yr');
    expect(html).toContain('saves you $1,240 a year');
    expect(html).toContain('costs you $340 a year');
    expect(html).toContain('>01<');
    expect(html).toContain('>04<');
    expect(html).toContain('Social security');
  });

  it('subtotals gains and costs, and nets them at the foot under the double rule, with the stamp', () => {
    const html = render();
    expect(html).toContain('Subtotal, saves you');
    expect(html).toContain('+$1,330/yr');
    expect(html).toContain('Subtotal, costs you');
    expect(html).toContain('No change');
    expect(html).toContain('Net per year');
    // The server HTML shows the real net (the count-up only plays in the browser).
    expect(html).toContain('+$990/yr');
    expect(html).toContain('Altogether, saves you');
    expect(html).toContain('Estimates · not advice.');
    expect(html).toContain('ESTIMATES · NOT ADVICE');
  });

  it('prints (animates) only when asked, and keeps every line in the HTML either way', () => {
    expect(render({ print: true })).toContain('data-printing=""');
    expect(render({ print: false })).not.toContain('data-printing');
    expect(render({ print: true }).match(/data-receipt-line=/g)).toHaveLength(4);
  });

  it('opens a line in place and marks the focused one', () => {
    const html = render({ openId: 'a', details: (id: string) => h('p', null, `details of ${id}`), focus: 'b' });
    expect(html).toContain('details of a');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Hide details');
    expect(html).toMatch(/data-receipt-line="b" data-focused=""/);
    expect(html).toContain('for Housing Supply Act');
  });

  it('offers its order as a radio group', () => {
    const html = render();
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Order the receipt"');
    expect(html).toContain('Largest first');
  });
});

describe('ReceiptSeal', () => {
  it('is decoration', () => {
    expect(renderToString(h(ReceiptSeal))).toMatch(/^<svg[^>]*aria-hidden="true"/);
  });
});

describe('the skyline section', () => {
  it('states the cumulative figures at the horizon with words, and leaves out unprojected policies', () => {
    const html = renderToString(h(SkylineReadout, { towers: skylineTowers(ROWS, 5), horizon: 5 }));
    expect(html).toContain('Cumulative estimate after 5 years');
    expect(html).toContain('+$6,500');
    expect(html).toContain('−$1,400');
    expect(html).toContain('+$5,100');
    expect(html).toContain('saves you $5,100');
    expect(html).toContain('Left out: 1 policy with no projection after 5 years yet');
    expect(html).toContain('View as table');
  });

  it('server-renders the vitrine, its horizon control and the poster (no 3D on the server)', () => {
    const html = renderToString(h(SkylineSection, { rows: ROWS, initialHorizon: 3 }));
    expect(html).toContain('data-night=""');
    expect(html).toContain('data-scene-night=""');
    expect(html).toContain('How it adds up, <em>after 3 years</em>');
    expect(html).toContain('aria-label="Projection horizon"');
    expect(html).toMatch(/aria-checked="true"[^>]*>3 years/);
    expect(html).toContain('data-scene-view="poster"');
    expect(html).toContain('role="img"');
    expect(html).toContain('Each etched floor is $2,000.');
    expect(html).toContain('Empty lot: no projection yet');
  });
});

describe('the page pieces', () => {
  it('shows a dash for a projection the analysis lacks, and links to the full analysis', () => {
    const html = renderToString(h(AnalysisBody, { row: row({ id: 'x', timeline: { year1: 120 } }) }));
    expect(html).toContain('+$120');
    expect(html).toContain('—');
    expect(html).toContain('href="/impact/policy-x"');
  });

  it('has honest waiting, empty and failed states', () => {
    expect(renderToString(h(ReceiptSkeleton))).toContain('Loading your analyses…');
    expect(renderToString(h(NoAnalyses))).toContain('No policies analyzed yet');
    const failed = renderToString(h(LoadFailed, { onRetry: () => {} }));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("We couldn&#x27;t load your analyses");
    expect(failed).toContain('Try again');
  });

  it('renders the cumulative tab from the real projections', () => {
    const html = renderToString(
      h(CumulativeView, {
        analyses: ROWS,
        checkedIds: new Set(ROWS.map((r) => r.id)),
        setCheckedIds: () => {},
        checkedAnalyses: ROWS,
        netImpact: 990,
        cumSummary: 'A small net gain.',
        cumLoading: false,
      })
    );
    expect(html).toContain('Net annual impact (4 selected)');
    expect(html).toContain('+$990');
    expect(html).toContain('+$3,250');
    expect(html).toContain('Left out, with no projection yet: Earlier short analysis.');
    expect(html).toContain('A small net gain.');
    // Each policy to pick: its category as people read it, and its amount a year in words.
    expect(html).toContain('Social security');
    expect(html).toContain('−$340/yr');
    expect(html).toContain('costs you');
  });
});
