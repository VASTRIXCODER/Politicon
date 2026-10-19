import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import AppShell from '@/components/layout/AppShell';
import { buildLedger, describeLedger } from '@/lib/ledger';
import {
  PROFILE_COLUMNS,
  dayPart,
  extremes,
  ledgerHeadline,
  ledgerSummary,
  receiptTotal,
  type PolicyAnalysisRow,
} from '@/app/dashboard/_components/dashboardModel';
import { householdFromRow } from '@/app/dashboard/_components/profileHousehold';
import CumulativeView from '@/app/dashboard/_components/CumulativeView';
import LedgerSection from '@/app/dashboard/_components/LedgerSection';
import RecentAnalyses from '@/app/dashboard/_components/RecentAnalyses';

const row = (over: Partial<PolicyAnalysisRow> & Pick<PolicyAnalysisRow, 'id' | 'dollar_impact'>): PolicyAnalysisRow => ({
  policy_id: `policy-${over.id}`,
  policy_title: `Policy ${over.id}`,
  analysis_text: '',
  category: 'healthcare',
  status: 'enacted',
  created_at: '2026-10-01T12:00:00Z',
  ...over,
});

const ROWS = [
  row({ id: 'a', dollar_impact: 1200, category: 'healthcare', policy_title: 'Lower Drug Costs Act' }),
  row({ id: 'b', dollar_impact: -300, category: 'energy', policy_title: 'Grid Fee Act', status: 'proposed' }),
  row({ id: 'c', dollar_impact: 40, category: 'taxes', policy_id: 'S 12/2026' }),
];

describe('dayPart', () => {
  it('greets by the visitor’s clock: morning before noon, afternoon until five, then evening', () => {
    expect([0, 11, 12, 16, 17, 23].map(dayPart)).toEqual(['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening']);
  });
});

describe('householdFromRow', () => {
  it('reads the saved profile the way Settings does', () => {
    const m = householdFromRow({
      housing_situation: 'own_mortgage',
      filing_status: 'married_joint',
      has_dependents: true,
      dependents_count: null,
      dependent_age_bands: ['under_5'],
      debt_types: ['student_loans'],
      state: 'Ohio',
    });
    expect(m).toMatchObject({ dwelling: 'house', owns: true, adults: 2, figures: 1, dependentsCount: 1, youngDependents: true, state: 'Ohio' });
    expect(m?.props).toEqual(['mortgage-key', 'grad-cap']);
  });

  it('draws no avatar without a profile or before housing is answered', () => {
    expect(householdFromRow(null)).toBeNull();
    expect(householdFromRow(undefined)).toBeNull();
    expect(householdFromRow({ first_name: 'Avery', state: 'Ohio' })).toBeNull();
    expect(householdFromRow({ housing_situation: 'not-a-choice' })).toBeNull();
  });

  it('asks the database only for the columns it reads', () => {
    for (const col of ['first_name', 'housing_situation', 'filing_status', 'has_dependents', 'dependents_count', 'dependent_age_bands', 'debt_types', 'state']) {
      expect(PROFILE_COLUMNS).toContain(col);
    }
    expect(PROFILE_COLUMNS).not.toContain('*');
  });
});

describe('ledgerHeadline', () => {
  it('is the ledger’s own net and count, whatever the totals say', () => {
    const cases: [PolicyAnalysisRow[], { count: number; netAnnual: number } | null][] = [
      [ROWS, { count: 3, netAnnual: 940 }],
      [ROWS, null],
      // The totals cover more than the list: their net, over their count.
      [ROWS, { count: 30, netAnnual: -2210.6 }],
      // Totals behind the list (a realtime refetch in flight): the list wins.
      [ROWS, { count: 2, netAnnual: 5 }],
      [[], { count: 4, netAnnual: 120 }],
      [[], null],
      [[row({ id: 'z', dollar_impact: -0.3 })], null],
    ];
    for (const [analyses, totals] of cases) {
      const ledger = buildLedger({ analyses, totals });
      expect(ledgerHeadline(analyses, totals), JSON.stringify(totals)).toEqual({ analysed: ledger.analysed, net: ledger.net });
    }
  });
});

describe('ledgerSummary', () => {
  it('says what to do first when nothing is analyzed', () => {
    expect(ledgerSummary({ analysed: 0, net: 0 })).toMatch(/^Nothing analyzed yet/);
  });

  it('states the direction in words and the rounded amount, singular and plural', () => {
    expect(ledgerSummary({ analysed: 1, net: 1240 })).toBe('The policy you analyzed saves you about $1,240 a year.');
    expect(ledgerSummary({ analysed: 1, net: -90 })).toBe('The policy you analyzed costs you about $90 a year.');
    expect(ledgerSummary({ analysed: 3, net: 940 })).toBe('On balance, your 3 analyzed policies save you about $940 a year.');
    expect(ledgerSummary({ analysed: 3, net: -940 })).toBe('On balance, your 3 analyzed policies cost you about $940 a year.');
    expect(ledgerSummary({ analysed: 2, net: 0 })).toMatch(/no net change/);
  });

  it('never prints a sign that contradicts its words', () => {
    expect(ledgerSummary({ analysed: 2, net: -5000 })).not.toMatch(/[+−-]\$/);
  });
});

describe('extremes and receiptTotal', () => {
  it('finds the biggest gain and the biggest cost, or none', () => {
    expect(extremes(ROWS)).toMatchObject({ gain: { id: 'a' }, cost: { id: 'b' } });
    expect(extremes([ROWS[0]])).toMatchObject({ gain: { id: 'a' }, cost: null });
    expect(extremes([])).toEqual({ gain: null, cost: null });
  });

  it('totals the listed analyses, and says so when they are only the latest few', () => {
    expect(receiptTotal(ROWS, 3)).toEqual({ value: 940, label: 'Net yearly impact' });
    expect(receiptTotal(ROWS, 30)).toEqual({ value: 940, label: 'Net of these 3 (of 30 analyzed)' });
    expect(receiptTotal([{ dollar_impact: -0.2 }], 1).value).toBe(0);
    expect(Object.is(receiptTotal([{ dollar_impact: -0.2 }], 1).value, -0)).toBe(false);
  });

  it('agrees with the ledger when the list is everything', () => {
    const ledger = buildLedger({ analyses: ROWS, totals: { count: 3, netAnnual: 940 } });
    expect(receiptTotal(ROWS, ledger.analysed).value).toBe(ledger.net);
  });
});

describe('AppShell', () => {
  it('renders the page’s one main landmark, the skip link’s focusable target', () => {
    const html = renderToString(h(AppShell, { hideNav: true, children: h('p', null, 'Hello') }));
    expect(html).toMatch(/<main id="main" tabindex="-1" class="[^"]*max-w-7xl/);
    expect(html).toContain('<p>Hello</p>');
    expect(html).not.toContain('data-night');
  });

  it('turns the whole page to night, for the tokens and for the stage', () => {
    const html = renderToString(h(AppShell, { hideNav: true, night: true, mainClassName: 'max-w-3xl', children: 'x' }));
    expect(html).toMatch(/^<div class="[^"]*bg-canvas[^"]*" data-night="" data-scene-night="">/);
    // The caller's width wins over the default column.
    expect(html).toMatch(/<main id="main" tabindex="-1" class="[^"]*max-w-3xl/);
    expect(html).not.toMatch(/<main[^>]*max-w-7xl/);
  });
});

describe('RecentAnalyses', () => {
  it('prints each analysis with its sign and its words, linked to the full analysis', () => {
    const html = renderToString(h(RecentAnalyses, { loading: false, analyses: ROWS, analysed: 3 }));
    expect(html).toContain('+$1,200/yr');
    expect(html).toContain('−$300/yr');
    expect(html).toContain('saves you');
    expect(html).toContain('costs you');
    expect(html).toContain('href="/impact/S%2012%2F2026"');
    expect(html).toContain('Net yearly impact');
    expect(html).toContain('+$940/yr');
    expect(html.match(/<li /g)).toHaveLength(3);
  });

  it('says when the receipt is only the latest analyses', () => {
    const html = renderToString(h(RecentAnalyses, { loading: false, analyses: ROWS, analysed: 12 }));
    expect(html).toContain('Net of these 3 (of 12 analyzed)');
  });

  it('has an empty state and a loading state, with no figures', () => {
    const empty = renderToString(h(RecentAnalyses, { loading: false, analyses: [], analysed: 0 }));
    expect(empty).toContain('No policies analyzed yet');
    expect(empty).not.toMatch(/\$\d/);
    const loading = renderToString(h(RecentAnalyses, { loading: true, analyses: [], analysed: 0 }));
    expect(loading).toContain('role="status"');
    expect(loading).toContain('Loading your analyses');
  });
});

describe('CumulativeView', () => {
  it('adds each yearly estimate up over 1, 3 and 5 years, and says it is not a forecast', () => {
    const html = renderToString(h(CumulativeView, { analyses: ROWS, insight: '' }));
    expect(html).toContain('+$3,600');
    expect(html).toContain('+$6,000');
    // Totals: 940 a year.
    expect(html).toContain('+$2,820');
    expect(html).toContain('+$4,700');
    expect(html).toMatch(/not a forecast/);
    expect(html).not.toContain('AI portfolio summary');
  });

  it('shows the insight when there is one, and an empty state without analyses', () => {
    expect(renderToString(h(CumulativeView, { analyses: ROWS, insight: 'A small net gain.' }))).toContain('A small net gain.');
    expect(renderToString(h(CumulativeView, { analyses: [], insight: '' }))).toContain('No data yet');
  });
});

describe('LedgerSection on the server', () => {
  const noop = () => {};

  const totals = { count: 3, netAnnual: 940 };
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  it('labels the model with the ledger in words, shows its poster and its legend, and the stats', () => {
    const ledger = buildLedger({ analyses: ROWS, totals });
    const html = renderToString(h(LedgerSection, { loading: false, analyses: ROWS, totals, onGoToFeed: noop }));
    const label = esc(describeLedger(ledger));
    expect(html).toContain(`role="img" aria-label="${label}"`);
    expect(html).toContain('data-scene-view="poster"');
    expect(html).toContain('Teal slabs save you money');
    expect(html).toContain('Biggest gain');
    expect(html).toContain('Lower Drug Costs Act');
    expect(html).toContain('Biggest cost');
    expect(html).toContain('Grid Fee Act');
  });

  it('says which policies aren’t law, over every analysis, from the totals’ split', () => {
    // The three listed: one proposal (−$300). Two more analyses, not listed, net +$500, of which +$500 isn't law.
    const all = { count: 5, netAnnual: 1440, pendingAnnual: 200 };
    const html = renderToString(h(LedgerSection, { loading: false, analyses: ROWS, totals: all, onGoToFeed: noop }));
    expect(html).toContain('1 of your latest analyses isn’t law, so its amount is what it would mean if enacted.');
    expect(html).toContain('Of your other 2 analyses, +$500 a year is from policies that aren’t law or have no recorded status.');
    // The household isn't drawn beside the column (the greeting's avatar carries it), so the label doesn't name it.
    expect(html).not.toContain('household');
  });

  it('while loading, holds a placeholder instead of an empty ledger', () => {
    const html = renderToString(h(LedgerSection, { loading: true, analyses: [], totals: null, onGoToFeed: noop }));
    expect(html).not.toContain('role="img"');
    expect(html).toContain('Loading your ledger');
    expect(html).not.toContain('Biggest gain');
  });

  it('empty, it says so and offers the feed, with no figures', () => {
    const html = renderToString(h(LedgerSection, { loading: false, analyses: [], totals: { count: 0, netAnnual: 0 }, onGoToFeed: noop }));
    expect(html).toContain('Pick a policy from your feed');
    expect(html).not.toContain('Biggest gain');
    expect(html).not.toContain('Teal slabs save you money');
  });
});
