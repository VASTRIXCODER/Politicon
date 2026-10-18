import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import {
  EMPTY_LEDGER,
  LEDGER_WORLD,
  OTHER_ANALYSES_ID,
  buildLedger,
  categoryKey,
  categoryLabel,
  describeLedger,
  ledgerCoverageNote,
  ledgerGeometry,
  ledgerScale,
  ledgerScaleNote,
  ledgerStatusNote,
  ledgerViewBounds,
  niceStep,
  projectLedger,
  unprojectLedger,
} from '@/lib/ledger';
import { householdFromProfile } from '@/lib/household';
import { DIORAMA } from '@/components/three/kit/dioramaLayout';
import LedgerPoster from '@/components/dashboard/LedgerPoster';
import LedgerReadout from '@/components/dashboard/LedgerReadout';

const rows = [
  { category: 'healthcare', dollar_impact: 820 },
  { category: 'Healthcare', dollar_impact: 100 },
  { category: 'taxes', dollar_impact: 600 },
  { category: 'energy', dollar_impact: -180 },
  { category: 'housing', dollar_impact: 0 },
];

describe('buildLedger', () => {
  it('nets each policy category into one slab, gains then costs then no change, largest first', () => {
    const m = buildLedger({ analyses: rows, totals: { count: 5, netAnnual: 1340 } });
    expect(m.slabs.map((s) => [s.id, s.value, s.tone, s.policies])).toEqual([
      ['cat-healthcare', 920, 'gain', 2],
      ['cat-taxes', 600, 'gain', 1],
      ['cat-energy', -180, 'loss', 1],
      ['cat-housing', 0, 'neutral', 1],
    ]);
    expect(m).toMatchObject({ net: 1340, gains: 1520, costs: 180, analysed: 5, listed: 5 });
    expect(m.net).toBe(m.gains - m.costs);
  });

  it('is empty, with no numbers, before anything is analysed', () => {
    for (const input of [{ analyses: [] }, { analyses: null }, { analyses: [], totals: { count: 0, netAnnual: 0 } }]) {
      const m = buildLedger(input);
      expect(m).toEqual({ net: 0, gains: 0, costs: 0, slabs: [], analysed: 0, listed: 0, notLaw: 0 });
    }
    expect(EMPTY_LEDGER.analysed).toBe(0);
  });

  it('works without the totals (still loading, or failed), from the list alone', () => {
    const m = buildLedger({ analyses: rows, totals: null });
    expect(m).toMatchObject({ net: 1340, analysed: 5, listed: 5 });
    expect(m.slabs.some((s) => s.combined)).toBe(false);
  });

  it('puts the analyses the list leaves out into one "Other analyses" slab, so the slabs add up to the net', () => {
    const m = buildLedger({ analyses: rows, totals: { count: 9, netAnnual: 1000 } });
    const rest = m.slabs.find((s) => s.id === OTHER_ANALYSES_ID);
    expect(rest).toMatchObject({ label: 'Other analyses', value: -340, tone: 'loss', policies: 4, combined: true });
    expect(m).toMatchObject({ net: 1000, analysed: 9, listed: 5 });
    expect(m.gains - m.costs).toBe(m.net);
    // The combined rest sits outermost among the costs, after the real categories.
    expect(m.slabs.filter((s) => s.tone === 'loss').map((s) => s.id)).toEqual(['cat-energy', OTHER_ANALYSES_ID]);
    expect(ledgerCoverageNote(m)).toBe('Categories cover your 5 latest analyses; your other 4 analyses are combined as “Other analyses”.');
  });

  it('keeps a combined rest that nets to $0 as "no change", and notes the coverage', () => {
    const m = buildLedger({ analyses: rows, totals: { count: 6, netAnnual: 1340 } });
    expect(m.slabs.find((s) => s.combined)).toMatchObject({ value: 0, tone: 'neutral', policies: 1 });
    expect(ledgerCoverageNote(m)).toMatch(/other analysis is combined/);
  });

  it('trusts the list when the totals cover fewer analyses than it holds (a stale count)', () => {
    const m = buildLedger({ analyses: rows, totals: { count: 2, netAnnual: 99 } });
    expect(m).toMatchObject({ net: 1340, analysed: 5 });
  });

  it('reads amounts as PostgREST sends them, treating missing or broken ones as $0', () => {
    const m = buildLedger({
      analyses: [
        { category: 'taxes', dollar_impact: '250.4' },
        { category: 'taxes', dollar_impact: null },
        { category: null, dollar_impact: Number.NaN },
        { category: '  ', dollar_impact: -0.2 },
        null,
      ],
    });
    expect(m.slabs.map((s) => [s.id, s.value, s.policies])).toEqual([
      ['cat-taxes', 250, 2],
      ['cat-other', 0, 2],
    ]);
    expect(Object.is(m.slabs[1].value, -0)).toBe(false);
    expect(m.net).toBe(250);
  });

  it('counts the listed analyses of policies that aren’t law, and says so', () => {
    const statuses = ['enacted', 'proposed', 'passed', null, 'Enacted'];
    const m = buildLedger({ analyses: rows.map((r, i) => ({ ...r, status: statuses[i] })) });
    expect(m.notLaw).toBe(2);
    expect(ledgerStatusNote(m)).toBe('2 of these policies aren’t law, so their amounts are what they would mean if enacted.');
    const one = buildLedger({ analyses: [{ category: 'taxes', dollar_impact: 5, status: 'proposed' }] });
    expect(ledgerStatusNote(one)).toBe('This policy isn’t law, so its amount is what it would mean if enacted.');
    const partial = buildLedger({ analyses: [rows[0], { ...rows[1], status: 'proposed' }], totals: { count: 5, netAnnual: 0 } });
    expect(ledgerStatusNote(partial)).toBe('1 of your latest analyses isn’t law, so its amount is what it would mean if enacted.');
    expect(ledgerStatusNote(buildLedger({ analyses: rows }))).toBeNull();
  });

  it('names categories the way the app does', () => {
    expect(categoryKey(' Health ')).toBe('healthcare');
    expect(categoryKey('tax')).toBe('taxes');
    expect(categoryKey('Social Security')).toBe('social-security');
    expect(categoryKey(undefined)).toBe('other');
    expect(categoryLabel('energy')).toBe('Energy');
    expect(categoryLabel('social security')).toBe('Social security');
    expect(categoryLabel('')).toBe('Other');
  });
});

describe('the scale', () => {
  it('steps by 1, 2, 2.5 or 5 × 10ⁿ', () => {
    expect([0, 0.7, 1, 1.2, 2.2, 3, 7, 12, 260].map(niceStep)).toEqual([0, 1, 1, 2, 2.5, 5, 10, 20, 500]);
  });

  it('is one linear scale for gains and costs, a whole number of steps, filling most of the column', () => {
    for (const [gains, costs] of [[1520, 180], [5, 0], [0, 900], [12_345, 6_789], [1, 1]]) {
      const s = ledgerScale({ gains, costs });
      expect(s).not.toBeNull();
      const { max, step } = s!;
      expect(max).toBeGreaterThanOrEqual(gains + costs);
      expect(Number.isInteger(Math.round((max / step) * 1e6) / 1e6)).toBe(true);
      expect((gains + costs) / max).toBeGreaterThan(0.4);
      expect(step).toBeGreaterThanOrEqual(1);
    }
    expect(ledgerScale({ gains: 0, costs: 0 })).toBeNull();
  });
});

describe('ledgerGeometry', () => {
  const H = LEDGER_WORLD.height;

  it('stacks gains up and costs down from the baseline, each slab as tall as its dollars (gaps aside)', () => {
    const m = buildLedger({ analyses: rows });
    const g = ledgerGeometry(m);
    const perDollar = ((1 - LEDGER_WORLD.foot - LEDGER_WORLD.head) * H) / g.scale!.max;
    for (const s of g.slabs) {
      const value = Math.abs(m.slabs.find((x) => x.id === s.id)!.value);
      const drawn = s.y1 - s.y0;
      expect(drawn).toBeLessThanOrEqual(value * perDollar);
      expect(drawn).toBeGreaterThan(value * perDollar - LEDGER_WORLD.gap - LEDGER_WORLD.plate.thickness);
      if (s.tone === 'gain') expect(s.y0).toBeGreaterThan(g.baseline);
      else expect(s.y1).toBeLessThan(g.baseline);
    }
    // Neutral categories have no slab.
    expect(g.slabs.map((s) => s.id)).toEqual(['cat-healthcare', 'cat-taxes', 'cat-energy']);
    // The costs hang down to the foot; the glass starts above the highest gain.
    expect(g.baseline).toBeCloseTo(g.footTop + m.costs * perDollar, 6);
    expect(g.glass.y0).toBeGreaterThan(Math.max(...g.slabs.map((s) => s.y1)));
    expect(g.glass.y1).toBe(H);
    // The ring sits at the net, on the same scale.
    expect(g.net).toBeCloseTo(g.baseline + m.net * perDollar, 6);
    // A mark per step either side of the baseline, within the column.
    const stepY = g.scale!.step * perDollar;
    for (const y of g.ticks) {
      expect(Math.abs(Math.round((y - g.baseline) / stepY) - (y - g.baseline) / stepY)).toBeLessThan(1e-6);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(H);
    }
  });

  it('puts a cost-only ledger’s ring below the baseline', () => {
    const g = ledgerGeometry(buildLedger({ analyses: [{ category: 'energy', dollar_impact: -400 }] }));
    expect(g.net!).toBeLessThan(g.baseline);
    expect(g.slabs).toHaveLength(1);
    expect(g.glass.y0).toBeGreaterThan(g.baseline);
  });

  it('draws a very small amount as a sliver, inside its own interval', () => {
    const g = ledgerGeometry(buildLedger({ analyses: [{ category: 'taxes', dollar_impact: 10_000 }, { category: 'energy', dollar_impact: 1 }] }));
    const tiny = g.slabs.find((s) => s.id === 'cat-energy')!;
    expect(tiny.y1 - tiny.y0).toBeCloseTo(LEDGER_WORLD.minSlab, 6);
  });

  it('is an empty glass column with a dashed baseline and no ring when nothing is analysed', () => {
    const g = ledgerGeometry(EMPTY_LEDGER);
    expect(g).toMatchObject({ empty: true, scale: null, net: null, slabs: [], ticks: [] });
    expect(g.baseline).toBeCloseTo(LEDGER_WORLD.emptyBaseline * H, 6);
  });

  it('rests the ring on the baseline when every analysis nets to $0', () => {
    const g = ledgerGeometry(buildLedger({ analyses: [{ category: 'housing', dollar_impact: 0 }] }));
    expect(g).toMatchObject({ empty: false, scale: null, slabs: [] });
    expect(g.net).toBe(g.baseline);
  });
});

describe('the view', () => {
  it('projects and unprojects the same point', () => {
    const p: [number, number, number] = [0.3, 1.2, -0.4];
    const back = unprojectLedger(projectLedger(p));
    back.forEach((v, i) => expect(v).toBeCloseTo(p[i], 9));
  });

  it('sees the column’s front and right faces from above', () => {
    const [frontX] = projectLedger([0.35, 1, 0.2]);
    const [backX] = projectLedger([0.35, 1, -0.2]);
    expect(backX).toBeGreaterThan(frontX);
    expect(projectLedger([0, 0, 1])[1]).toBeLessThan(projectLedger([0, 0, -1])[1]);
  });

  it('stands the household diorama on the plinth, clear of the column, in the diorama’s own units', () => {
    const h = LEDGER_WORLD.household;
    expect(h.plinth).toEqual(DIORAMA.plinth);
    expect(h.house).toEqual(DIORAMA.house.center);
    const [x, , z] = h.position;
    const r = h.plinth.radius * h.scale;
    expect(Math.hypot(x, z) + r).toBeLessThanOrEqual(LEDGER_WORLD.plinth.radius);
    const corner = Math.hypot(x + LEDGER_WORLD.width / 2, z - LEDGER_WORLD.depth / 2);
    expect(corner).toBeGreaterThan(r);
  });

  it('frames the household too when there is one', () => {
    const without = ledgerViewBounds(false);
    const withHome = ledgerViewBounds(true);
    expect(withHome.minX).toBeLessThanOrEqual(without.minX);
    expect(withHome.maxY).toBeGreaterThan(withHome.minY);
  });
});

describe('words', () => {
  it('describes the picture with sign and words, and says when it is empty', () => {
    const m = buildLedger({ analyses: rows });
    expect(describeLedger(m)).toBe(
      'Your ledger as a glass column: 2 teal slabs for what saves you money rise above a violet baseline, and 1 amber slab for what costs you hangs below it. A ring of light marks the net, +$1,340 a year (saves you).'
    );
    expect(describeLedger(EMPTY_LEDGER)).toMatch(/^An empty glass ledger .*no policies analyzed yet\.$/);
    const costs = buildLedger({ analyses: [{ category: 'energy', dollar_impact: -50 }] });
    expect(describeLedger(costs)).toContain('1 amber slab for what costs you hangs below a violet baseline');
    expect(describeLedger(costs)).toContain('−$50 a year (costs you)');
  });

  it('adds the household when it is known', () => {
    const home = householdFromProfile({ housingSituation: 'rent', filingStatus: 'single', state: 'Ohio' });
    expect(describeLedger(EMPTY_LEDGER, home)).toContain('Beside it stands your household: a rented apartment with one adult, in Ohio.');
    expect(describeLedger(EMPTY_LEDGER, householdFromProfile({}))).not.toContain('household');
  });

  it('states the scale step in the caption', () => {
    const m = buildLedger({ analyses: rows });
    expect(ledgerScaleNote(m)).toContain(`each mark on the staff is $${ledgerScale(m)!.step.toLocaleString('en-US')} a year`);
    expect(ledgerCoverageNote(m)).toBeNull();
  });
});

describe('LedgerReadout', () => {
  const render = (props: Parameters<typeof LedgerReadout>[0]) => renderToString(h(LedgerReadout, props));

  it('says how to start, with no numbers, when the ledger is empty', () => {
    const html = render({ model: EMPTY_LEDGER });
    expect(html).toContain('Analyze a policy to start your ledger');
    expect(html).not.toMatch(/\$\d/);
    expect(html).not.toContain('View as table');
  });

  it('states the net with its sign and words, and a row per category with its slab id', () => {
    const html = render({ model: buildLedger({ analyses: rows }), focus: 'cat-taxes' });
    expect(html).toContain('+$1,340');
    expect(html).toContain('Saves you $1,340 a year');
    for (const id of ['cat-healthcare', 'cat-taxes', 'cat-energy', 'cat-housing']) expect(html).toContain(`data-ledger-slab="${id}"`);
    expect(html).toContain('costs you $180 a year');
    expect(html).toContain('View as table');
    expect(html).toMatch(/<h2[^>]*>Your <em>Ledger<\/em><\/h2>/);
  });

  it('announces loading', () => {
    const html = render({ model: EMPTY_LEDGER, loading: true });
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading your ledger');
  });
});

describe('LedgerPoster', () => {
  it('renders on the server as a decorative drawing, with a slab per drawn category', () => {
    const html = renderToString(h(LedgerPoster, { model: buildLedger({ analyses: rows }), focus: 'cat-taxes' }));
    expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
    expect(html).toContain('data-decorative=""');
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it('draws the empty ledger and the household without numbers', () => {
    const home = householdFromProfile({ housingSituation: 'own_mortgage', filingStatus: 'married_joint', hasDependents: true, dependentsCount: 2, dependentAgeBands: ['6_12'] });
    const html = renderToString(h(LedgerPoster, { model: EMPTY_LEDGER, household: home }));
    expect(html).toContain('stroke-dasharray');
    expect(html).not.toMatch(/NaN|Infinity|\$/);
  });
});
