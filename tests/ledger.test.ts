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
      expect(m).toEqual({ net: 0, gains: 0, costs: 0, slabs: [], analysed: 0, listed: 0, notLaw: 0, statusUnknown: 0, restNotLaw: null });
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

  it('counts the listed analyses of policies that aren’t law, and those with no recorded status (never taken for law)', () => {
    const statuses = ['enacted', 'proposed', 'passed', null, 'Enacted'];
    const m = buildLedger({ analyses: rows.map((r, i) => ({ ...r, status: statuses[i] })) });
    expect(m).toMatchObject({ notLaw: 2, statusUnknown: 1, restNotLaw: null });
    expect(ledgerStatusNote(m)).toBe(
      '2 of these policies aren’t law, so their amounts are what they would mean if enacted. Another has no recorded status, so it may not be law.'
    );
    const one = buildLedger({ analyses: [{ category: 'taxes', dollar_impact: 5, status: 'proposed' }] });
    expect(ledgerStatusNote(one)).toBe('This policy isn’t law, so its amount is what it would mean if enacted.');
    const unknown = buildLedger({ analyses: [{ category: 'taxes', dollar_impact: 5, status: null }] });
    expect(ledgerStatusNote(unknown)).toBe('This policy has no recorded status, so it may not be law.');
    expect(ledgerStatusNote(buildLedger({ analyses: rows }))).toBe('5 of these policies have no recorded status, so they may not be law.');
    const law = buildLedger({ analyses: rows.map((r) => ({ ...r, status: 'enacted' })) });
    expect(ledgerStatusNote(law)).toBeNull();
  });

  it('says what of the analyses the list leaves out isn’t law, from the totals', () => {
    const enacted = (r: (typeof rows)[number]) => ({ ...r, status: 'enacted' });
    // The 5 listed are law; the other 4 net -340, of which the not-law part is +200 (the totals' pending 200, none listed).
    const m = buildLedger({ analyses: rows.map(enacted), totals: { count: 9, netAnnual: 1000, pendingAnnual: 200 } });
    expect(m).toMatchObject({ notLaw: 0, statusUnknown: 0, restNotLaw: 200 });
    expect(ledgerStatusNote(m)).toBe('Of your other 4 analyses, +$200 a year is from policies that aren’t law or have no recorded status.');
    // The listed part of pending is taken out first: here it all comes from a listed proposal.
    const partial = buildLedger({ analyses: [enacted(rows[0]), { ...rows[1], status: 'proposed' }], totals: { count: 5, netAnnual: 0, pendingAnnual: 100 } });
    expect(partial.restNotLaw).toBe(0);
    expect(ledgerStatusNote(partial)).toBe('1 of your latest analyses isn’t law, so its amount is what it would mean if enacted.');
    // An older RPC without the split: say it isn't known.
    const older = buildLedger({ analyses: rows.map(enacted), totals: { count: 6, netAnnual: 1340 } });
    expect(ledgerStatusNote(older)).toBe('Whether your other analysis is law isn’t shown here.');
    // Every analysis is law: nothing to say.
    expect(ledgerStatusNote(buildLedger({ analyses: rows.map(enacted), totals: { count: 9, netAnnual: 1000, pendingAnnual: 0 } }))).toBeNull();
  });

  it('keeps what each category’s policies save and cost before netting, so offsets aren’t hidden', () => {
    const m = buildLedger({ analyses: [{ category: 'taxes', dollar_impact: 2000 }, { category: 'taxes', dollar_impact: -1900 }, { category: 'energy', dollar_impact: -50 }] });
    expect(m.slabs.find((s) => s.id === 'cat-taxes')).toMatchObject({ value: 100, tone: 'gain', policies: 2, gross: { saves: 2000, costs: 1900 } });
    expect(m.slabs.find((s) => s.id === 'cat-energy')).toMatchObject({ gross: { saves: 0, costs: 50 } });
    const rest = buildLedger({ analyses: rows, totals: { count: 9, netAnnual: 1000 } }).slabs.find((s) => s.combined);
    expect(rest?.gross).toBeUndefined();
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

  it('frames the plinth and the column whole', () => {
    const b = ledgerViewBounds();
    const [, top] = projectLedger([0, LEDGER_WORLD.height, 0]);
    expect(b.maxY).toBeGreaterThanOrEqual(top);
    expect(b.minX).toBeLessThan(-LEDGER_WORLD.plinth.radius * 0.9);
    expect(b.maxX).toBeGreaterThan(LEDGER_WORLD.plinth.radius * 0.9);
  });
});

describe('words', () => {
  it('describes the picture with sign and words, and says when it is empty', () => {
    const m = buildLedger({ analyses: rows });
    expect(describeLedger(m)).toBe(
      'Your ledger as a glass column: 2 teal slabs for categories that save you money rise above a violet baseline, and 1 amber slab for categories that cost you hangs below it. A ring of light marks the net, +$1,340 a year (saves you).'
    );
    expect(describeLedger(EMPTY_LEDGER)).toMatch(/^An empty glass ledger .*no policies analyzed yet\.$/);
    const costs = buildLedger({ analyses: [{ category: 'energy', dollar_impact: -50 }] });
    expect(describeLedger(costs)).toContain('1 amber slab for categories that cost you hangs below a violet baseline');
    expect(describeLedger(costs)).toContain('−$50 a year (costs you)');
  });

  it('says the policies net to $0 within each category, not that each one is $0, when there is nothing to stack', () => {
    const offset = buildLedger({ analyses: [{ category: 'taxes', dollar_impact: 100, status: 'enacted' }, { category: 'taxes', dollar_impact: -100, status: 'proposed' }] });
    expect(offset.slabs).toEqual([expect.objectContaining({ id: 'cat-taxes', value: 0, tone: 'neutral', policies: 2, gross: { saves: 100, costs: 100 } })]);
    expect(describeLedger(offset)).toBe(
      'A clear glass ledger: your analyzed policies net to $0 a year within each category, so there are no slabs, and the ring of light rests on the baseline.'
    );
    expect(ledgerScaleNote(offset)).toBe('Your analyzed policies net to $0 a year within each category, so there are no slabs, and the ring of light rests on the baseline.');
    expect(describeLedger(offset)).not.toMatch(/every analyzed policy/i);
    const single = buildLedger({ analyses: [{ category: 'housing', dollar_impact: 0 }] });
    expect(ledgerScaleNote(single)).toMatch(/^Your analyzed policy comes to \$0 a year, so there is no slab/);
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
    // A category of two policies is said to be a net.
    expect(html).toContain(': net, saves you $920 a year, from 2 policies');
    expect(html).toContain('View as table');
    expect(html).toMatch(/<h2[^>]*>Your <em>Ledger<\/em><\/h2>/);
  });

  it('shows what a category’s policies save and cost when they pull both ways', () => {
    const html = render({ model: buildLedger({ analyses: [{ category: 'taxes', dollar_impact: 2000 }, { category: 'taxes', dollar_impact: -1900 }] }) });
    expect(html).toContain('which save you $2,000 and cost you $1,900 a year before netting');
    expect(html.replace(/<!-- -->/g, '')).toMatch(/Net of <span[^>]*>\+\$2,000<\/span> and <span[^>]*>−\$1,900<\/span> a year/);
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

  it('draws the empty ledger without numbers', () => {
    const html = renderToString(h(LedgerPoster, { model: EMPTY_LEDGER }));
    expect(html).toContain('stroke-dasharray');
    expect(html).not.toMatch(/NaN|Infinity|\$/);
  });
});
