import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import {
  SKYLINE_HORIZONS,
  SKYLINE_VIEW,
  SKYLINE_WORLD,
  describeSkyline,
  horizonWords,
  niceStep,
  projectSkyline,
  projectionAt,
  reachOf,
  skylineFrame,
  skylineLayout,
  skylineReach,
  skylineScaleNote,
  skylineTotals,
  skylineTowers,
  unprojectSkyline,
  type SkylineSource,
} from '@/lib/skyline';
import SkylinePoster from '@/components/impact/receipt/SkylinePoster';

// Real-shaped rows: each analysis's own cumulative projections, which need not be the yearly figure × years.
const ROWS: SkylineSource[] = [
  { id: 'a', policy_title: 'Child Tax Credit Expansion', timeline: { year1: 1200, year3: 3900, year5: 6100 } },
  { id: 'b', policy_title: 'Housing Supply Act', timeline: { year1: -340, year3: -900, year5: -1400 } },
  { id: 'c', policy_title: 'Clean Energy Rebates', timeline: { year1: 0, year3: 250, year5: 400 } },
  { id: 'd', policy_title: 'An earlier, short analysis', timeline: null },
];

describe('projectionAt', () => {
  it("reads the analysis's own projection at each horizon, rounded", () => {
    expect(projectionAt({ year1: 1200.4, year3: 3900, year5: 6100 }, 1)).toBe(1200);
    expect(projectionAt({ year1: 1200, year3: 3900, year5: 6100 }, 3)).toBe(3900);
    expect(projectionAt({ year1: 1200, year3: 3900, year5: 6100 }, 5)).toBe(6100);
  });

  it('is null (never derived from the yearly figure) when the projection is missing or not a number', () => {
    expect(projectionAt(null, 3)).toBeNull();
    expect(projectionAt(undefined, 3)).toBeNull();
    expect(projectionAt({ year1: 100 }, 5)).toBeNull();
    expect(projectionAt({ year3: '900' }, 3)).toBeNull();
    expect(projectionAt({ year3: Number.NaN }, 3)).toBeNull();
    expect(projectionAt({ year3: Infinity }, 3)).toBeNull();
    expect(Object.is(projectionAt({ year1: -0.2 }, 1), 0)).toBe(true);
  });
});

describe('skylineTowers / skylineReach / skylineTotals', () => {
  it('keeps the rows in order, one tower each, with the horizon value and its tone', () => {
    expect(skylineTowers(ROWS, 3)).toEqual([
      { id: 'a', label: 'Child Tax Credit Expansion', value: 3900, tone: 'gain' },
      { id: 'b', label: 'Housing Supply Act', value: -900, tone: 'loss' },
      { id: 'c', label: 'Clean Energy Rebates', value: 250, tone: 'gain' },
      { id: 'd', label: 'An earlier, short analysis', value: null, tone: 'neutral' },
    ]);
    expect(skylineTowers(ROWS, 1).map((t) => t.tone)).toEqual(['gain', 'loss', 'neutral', 'neutral']);
  });

  it('reaches over every horizon, so one scale holds for 1, 3 and 5 years', () => {
    expect(skylineReach(ROWS)).toEqual({ up: 6100, down: 1400 });
    expect(reachOf(skylineTowers(ROWS, 1))).toEqual({ up: 1200, down: 340 });
    expect(skylineReach([])).toEqual({ up: 0, down: 0 });
  });

  it('sums gains and costs and leaves unprojected policies out (and lists them)', () => {
    const t = skylineTotals(skylineTowers(ROWS, 5));
    expect(t).toMatchObject({ gains: 6500, costs: 1400, net: 5100, gainCount: 2, costCount: 1, flatCount: 0 });
    expect(t.missing.map((m) => m.id)).toEqual(['d']);
    expect(skylineTotals(skylineTowers(ROWS, 1))).toMatchObject({ net: 860, flatCount: 1 });
  });
});

describe('niceStep', () => {
  it('rounds up to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(0.4)).toBe(1);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(180)).toBe(200);
    expect(niceStep(220)).toBe(250);
    expect(niceStep(1220)).toBe(2000);
    expect(niceStep(3000)).toBe(5000);
    expect(niceStep(1000)).toBe(1000);
  });
});

describe('skylineLayout', () => {
  const reach = skylineReach(ROWS);

  it('makes every height linear in its dollars on the one scale (the reach), rising for gains and hanging for costs', () => {
    const L = skylineLayout(skylineTowers(ROWS, 5), reach);
    const [a, b, c] = L.lots;
    expect(L.scale).toBe(6100);
    expect(a.height).toBeCloseTo(SKYLINE_WORLD.maxHeight, 6);
    expect(a.height / c.height).toBeCloseTo(6100 / 400, 6);
    expect(b.height / a.height).toBeCloseTo(1400 / 6100, 6);
    expect(a).toMatchObject({ dir: 1, y0: 0 });
    expect(a.y1).toBeCloseTo(a.height, 9);
    // A cost hangs from the street's underside.
    expect(b.dir).toBe(-1);
    expect(b.y1).toBeCloseTo(-SKYLINE_WORLD.street, 9);
    expect(b.y0).toBeCloseTo(-SKYLINE_WORLD.street - b.height, 9);
  });

  it('grows the same tower across horizons on one scale (year 5 is taller than year 1 by the real ratio)', () => {
    const one = skylineLayout(skylineTowers(ROWS, 1), reach).lots[0];
    const five = skylineLayout(skylineTowers(ROWS, 5), reach).lots[0];
    expect(five.height / one.height).toBeCloseTo(6100 / 1200, 6);
  });

  it('draws a sliver for a tiny amount, a flat tile for $0 and an empty lot when nothing is projected', () => {
    const L = skylineLayout(
      [
        { id: 'big', label: 'Big', value: 100000, tone: 'gain' },
        { id: 'tiny', label: 'Tiny', value: 1, tone: 'gain' },
        { id: 'zero', label: 'Zero', value: 0, tone: 'neutral' },
        { id: 'none', label: 'None', value: null, tone: 'neutral' },
      ],
      { up: 100000, down: 0 }
    );
    expect(L.lots[1]).toMatchObject({ dir: 1, height: SKYLINE_WORLD.sliver });
    expect(L.lots[2]).toMatchObject({ dir: 0, height: 0, value: 0 });
    expect(L.lots[3]).toMatchObject({ dir: null, height: 0, value: null });
  });

  it('numbers the lots as the receipt does and stands up to eight in one row (with tags), more in a block, back row first', () => {
    const one = skylineLayout(skylineTowers(ROWS, 3), reach);
    expect(one.lots.map((l) => l.number)).toEqual([1, 2, 3, 4]);
    expect(one).toMatchObject({ rows: 1, cols: 4, tags: true });
    expect(new Set(one.lots.map((l) => l.z)).size).toBe(1);
    // Left to right, centred on x = 0.
    const xs = one.lots.map((l) => l.x);
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
    expect(xs[0] + xs[3]).toBeCloseTo(0, 9);

    const many = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, label: `P${i}`, value: (i + 1) * 100, tone: 'gain' as const }));
    const block = skylineLayout(many);
    expect(block.tags).toBe(false);
    expect(block.rows * block.cols).toBeGreaterThanOrEqual(20);
    expect(block.rows).toBeGreaterThan(1);
    // Row 0 (the receipt's first lines) stands at the back (−z, away from the camera).
    expect(block.lots[0].z).toBeLessThan(block.lots[19].z);
    // Every lot is on the street.
    for (const lot of block.lots) {
      expect(Math.abs(lot.x)).toBeLessThan(block.halfX);
      expect(Math.abs(lot.z)).toBeLessThan(block.halfZ);
    }
  });

  it('has a glass well only when a cost is in reach, and a foot under everything', () => {
    const withCosts = skylineLayout(skylineTowers(ROWS, 5), reach);
    expect(withCosts.well).not.toBeNull();
    expect(withCosts.well!.y1).toBeLessThan(-SKYLINE_WORLD.street - withCosts.depth);
    expect(withCosts.bottom).toBeCloseTo(withCosts.well!.y1 - SKYLINE_WORLD.foot, 9);
    const gainsOnly = skylineLayout([{ id: 'a', label: 'A', value: 500, tone: 'gain' }]);
    expect(gainsOnly.well).toBeNull();
    expect(gainsOnly.bottom).toBeCloseTo(-SKYLINE_WORLD.street - SKYLINE_WORLD.foot, 9);
  });

  it('etches a floor every round number of dollars, about five on the tallest tower', () => {
    const L = skylineLayout(skylineTowers(ROWS, 5), reach);
    expect(L.floorDollars).toBe(2000);
    expect(L.scale / L.floorDollars).toBeGreaterThanOrEqual(2);
    expect(L.scale / L.floorDollars).toBeLessThanOrEqual(5);
  });

  it('holds the frame still across horizons (it frames the reach, not one horizon)', () => {
    const frames = SKYLINE_HORIZONS.map((hz) => skylineFrame(skylineLayout(skylineTowers(ROWS, hz), reach)));
    for (const f of frames.slice(1)) expect(f).toEqual(frames[0]);
  });

  it('is empty and flat with nothing to show', () => {
    const L = skylineLayout([]);
    expect(L).toMatchObject({ lots: [], scale: 0, unitsPerDollar: 0, tags: false, well: null });
    expect(Number.isFinite(skylineFrame(L).halfW)).toBe(true);
  });
});

describe('projection', () => {
  it('unprojects what it projects', () => {
    for (const v of [[0.3, 1.2, -0.4], [-1, 0, 2], [0, -0.5, 0]] as const) {
      const back = unprojectSkyline(projectSkyline(v));
      v.forEach((c, i) => expect(back[i]).toBeCloseTo(c, 9));
    }
  });

  it('frames every corner of the street and the reach', () => {
    const L = skylineLayout(skylineTowers(ROWS, 5), skylineReach(ROWS));
    const f = skylineFrame(L);
    for (const x of [-L.halfX, L.halfX]) {
      for (const z of [-L.halfZ, L.halfZ]) {
        for (const y of [L.top, 0, L.bottom]) {
          const [px, py] = projectSkyline([x, y, z], SKYLINE_VIEW.yaw, SKYLINE_VIEW.pitch);
          expect(Math.abs(px - f.cx)).toBeLessThanOrEqual(f.halfW);
          expect(Math.abs(py - f.cy)).toBeLessThanOrEqual(f.halfH);
        }
      }
    }
  });
});

describe('words', () => {
  it('says the horizon', () => {
    expect(horizonWords(1)).toBe('after 1 year');
    expect(horizonWords(5)).toBe('after 5 years');
  });

  it('describes the tallest gain, the deepest cost, the net and the empty lots', () => {
    const text = describeSkyline(skylineTowers(ROWS, 5), 5);
    expect(text).toContain('after 5 years');
    expect(text).toContain('2 teal towers rise');
    expect(text).toContain('+$6,100 (Child Tax Credit Expansion)');
    expect(text).toContain('1 amber tower hangs');
    expect(text).toContain('−$1,400 (Housing Supply Act)');
    expect(text).toContain('Together, +$5,100 (saves you)');
    expect(text).toContain('1 empty lot has no projection yet');
    expect(describeSkyline([], 3)).toContain('no policies analyzed yet');
    expect(describeSkyline(skylineTowers([ROWS[3]], 3), 3)).toContain('no projection that far yet');
  });

  it('states the scale and the floor size', () => {
    const L = skylineLayout(skylineTowers(ROWS, 3), skylineReach(ROWS));
    expect(skylineScaleNote(L, 3)).toBe('Height is the cumulative estimate after 3 years, on one linear scale for all three horizons. Each etched floor is $2,000.');
    expect(skylineScaleNote(skylineLayout([]), 1)).toContain('nothing projected here');
  });
});

describe('SkylinePoster', () => {
  it('renders on the server as decoration, with a numbered plaque per lot and the dashed empty lot', () => {
    const html = renderToString(h(SkylinePoster, { towers: skylineTowers(ROWS, 3), reach: skylineReach(ROWS) }));
    expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
    for (const n of ['01', '02', '03', '04']) expect(html).toContain(`>${n}</text>`);
    expect(html).toContain('stroke-dasharray="5 4"');
    // Nearly solid, in the direction's own hue (never washed toward the night behind).
    expect(html).toContain('fill-gain-fill/85');
    expect(html).toContain('fill-loss-fill/85');
  });

  it('lights the focused tower and dims the rest', () => {
    const html = renderToString(h(SkylinePoster, { towers: skylineTowers(ROWS, 3), reach: skylineReach(ROWS), focus: 'a' }));
    expect(html).toContain('class="fill-gain-fill"');
    expect(html).toContain('opacity="0.45"');
  });

  it('draws no plaques for a block of many towers', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, label: `P${i}`, value: i * 50 - 200, tone: 'gain' as const }));
    expect(renderToString(h(SkylinePoster, { towers: many }))).not.toContain('</text>');
  });
});
