import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { coerceFullAnalysis } from '@/lib/analysisSchema';
import { RADAR_LABELS } from '@/lib/simpleMode';
import { ledgerLayout } from '@/components/three/kit/dioramaLayout';
import {
  CRYSTAL_AXES,
  CRYSTAL_DIRECTION,
  crystalMarks,
  terrainMarks,
  CRYSTAL_VIEW,
  CRYSTAL_WORLD,
  FRAME_PAD,
  HERO_COST_SHELF,
  HERO_VIEW,
  HERO_WORLD,
  REST_FLOW_ID,
  RIBBON_LEGEND,
  RIBBON_VIEW,
  RIBBON_WORLD,
  SANKEY_WORLD,
  TERRAIN_WORLD,
  crystalFacets,
  crystalFromAnalysis,
  crystalLayout,
  crystalScaleNote,
  crystalViewBox,
  describeCrystal,
  describeFlows,
  describeRibbon,
  describeTerrain,
  describeTransmission,
  flowScaleNote,
  flowTotals,
  flowsFromAnalysis,
  frameAspect,
  frameOf,
  heroInEffect,
  heroLayout,
  heroScaleNote,
  heroStreams,
  heroViewBox,
  niceStep,
  projectView,
  ribbonBandShare,
  ribbonFromAnalysis,
  ribbonLayout,
  ribbonPath,
  ribbonScaleNote,
  ribbonUncertainty,
  ribbonViewBox,
  sankeyGateMarks,
  sankeyLayout,
  sankeyStreams,
  sankeyViewBox,
  scaleFor,
  terrainCellText,
  terrainColumns,
  terrainFromAnalysis,
  terrainLayout,
  terrainScaleNote,
  terrainViewBox,
  unprojectView,
  type RibbonPoint,
} from '@/lib/transmission';
import TransmissionPoster from '@/components/impact/posters/TransmissionPoster';
import FlowPoster from '@/components/impact/posters/FlowPoster';
import RibbonPoster from '@/components/impact/posters/RibbonPoster';
import CrystalPoster from '@/components/impact/posters/CrystalPoster';
import TerrainPoster from '@/components/impact/posters/TerrainPoster';
import type { Policy } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures: analyses as the server stores them (normalized by coerceFullAnalysis).

const POLICY: Policy = {
  id: 'hr-1001-119',
  title: 'Family Tax Relief Act',
  summary: 'Raises the refundable child tax credit.',
  description: 'Raises the refundable child tax credit.',
  category: 'taxes',
  status: 'proposed',
  date: '2026-09-15',
  source: 'congress.gov',
  sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1001',
  governingBody: 'H.R. 1001',
  region: 'Federal',
  confidenceLevel: 'medium',
  impacts: [],
  assumptions: [],
  tags: [],
};

/** A rich analysis: mixed categories, a ripple effect in the net, a real monthly series and every score. */
const RICH = coerceFullAnalysis(
  {
    plainEnglishSummary: 'A larger credit, partly offset by higher rent and premiums.',
    netAnnualImpact: 450,
    confidenceScore: 64,
    status: 'proposed',
    categoryImpacts: { taxes: 1200, housing: -480, healthcare: -240.4, employment: 0, retirement: 150, education: 0 },
    ripple: { costOfLivingChange: -180 },
    timeline: {
      year1: 450,
      year3: 1300,
      year5: 2100,
      monthly: [
        { month: 1, impact: -60 },
        { month: 2, impact: -110 },
        { month: 3, impact: -140 },
        { month: 4, impact: -90 },
        { month: 5, impact: -20 },
        { month: 6, impact: 40 },
        { month: 7, impact: 110 },
        { month: 8, impact: 180 },
        { month: 9, impact: 250 },
        { month: 10, impact: 320 },
        { month: 11, impact: 390 },
        { month: 12, impact: 450 },
      ],
    },
    vulnerability: { incomeStability: 35, housingSecurity: 62, employmentRisk: 20, costOfLivingPressure: 71, investmentExposure: 15, debtBurden: 48 },
    spendingVelocity: [
      { category: 'Groceries', dollarImpact: -18, direction: 'negative' },
      { category: 'Utilities', dollarImpact: -9.6, direction: 'negative' },
      { category: 'Childcare', dollarImpact: 85, direction: 'positive' },
      { category: 'Dining', dollarImpact: 0, direction: 'neutral' },
      { category: 'Transportation', dollarImpact: -12 },
      { category: 'Groceries', dollarImpact: -4 },
      { category: 'Healthcare', dollarImpact: -20 },
    ],
  },
  POLICY
);

/** The hermetic journey's analysis (tests/e2e/hermetic-journey.ts): only a tax credit; no series, scores or spending. */
const SPARSE = coerceFullAnalysis(
  {
    plainEnglishSummary: 'If it passes as written, your refundable credit could rise by about $1,200 a year.',
    netAnnualImpact: 1200,
    netMonthlyImpact: 100,
    confidenceScore: 64,
    direction: 'positive',
    categoryImpacts: { taxes: 1200 },
  },
  POLICY
);

/** A costly analysis whose confidence was never rated. */
const COSTLY = coerceFullAnalysis({ plainEnglishSummary: 'x', netAnnualImpact: -2400, categoryImpacts: { taxes: -2400 }, status: 'signed into law' }, POLICY);

const EMPTY = coerceFullAnalysis({ plainEnglishSummary: 'Nothing changes.', netAnnualImpact: 0 }, POLICY);

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------

describe('scales', () => {
  it('rounds steps to 1, 2, 2.5 or 5 × 10ⁿ', () => {
    expect(niceStep(300)).toBe(500);
    expect(niceStep(240)).toBe(250);
    expect(niceStep(10)).toBe(10);
    expect(niceStep(0)).toBe(0);
    expect(niceStep(Number.NaN)).toBe(0);
  });

  it('spans a whole number of steps, and nothing for less than a dollar', () => {
    expect(scaleFor(1200)).toEqual({ step: 500, max: 1500 });
    expect(scaleFor(-2400)).toEqual({ step: 1000, max: 3000 });
    expect(scaleFor(0.4)).toBeNull();
    const s = scaleFor(1234)!;
    expect(s.max % s.step).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(1234);
  });
});

describe('views', () => {
  it('unprojects what it projects', () => {
    const p: [number, number, number] = [0.4, -0.7, 1.3];
    const back = unprojectView(projectView(p, HERO_VIEW), HERO_VIEW);
    back.forEach((v, i) => expect(close(v, p[i])).toBe(true));
  });

  it('gives each scene’s natural box shape', () => {
    // Nearly square: a plinth just wide enough for the sheet and the column, and room above for a cost's raised shelf.
    expect(frameAspect(heroViewBox(), HERO_VIEW)).toBeCloseTo(1.09, 1);
    expect(frameAspect(crystalViewBox(), CRYSTAL_VIEW)).toBeGreaterThan(0.9);
    expect(frameAspect(crystalViewBox(), CRYSTAL_VIEW)).toBeLessThan(1.25);
    expect(frameAspect(sankeyViewBox(), { yaw: 0.2, pitch: 0.12, fov: 26 })).toBeGreaterThan(1.8);
  });

  it('frames every scene with padding, and grows the flat frame for the nearest point', () => {
    for (const [box, view] of [
      [heroViewBox(), HERO_VIEW],
      [sankeyViewBox(), { yaw: 0.2, pitch: 0.12, fov: 26 }],
      [crystalViewBox(), CRYSTAL_VIEW],
    ] as const) {
      const f = frameOf(box, view);
      expect(f.halfW).toBeCloseTo(((box.maxX - box.minX) / 2) * FRAME_PAD);
      expect(f.halfH).toBeCloseTo(((box.maxY - box.minY) / 2) * FRAME_PAD);
      expect(box.near).toBeGreaterThan(0);
      expect(f.grow).toBeGreaterThan(1);
    }
  });
});

describe('flowsFromAnalysis', () => {
  it('lists every non-zero category, gains then costs, largest first', () => {
    const flows = flowsFromAnalysis(RICH);
    expect(flows.map((f) => [f.id, f.value, f.tone])).toEqual([
      ['taxes', 1200, 'gain'],
      ['retirement', 150, 'gain'],
      ['housing', -480, 'loss'],
      ['healthcare', -240, 'loss'],
      // The net (450) less the categories (630): the ripple the analysis didn't assign to a category.
      [REST_FLOW_ID, -180, 'loss'],
    ]);
    expect(flows.find((f) => f.id === REST_FLOW_ID)?.rest).toBe(true);
    expect(flows.every((f) => f.value !== 0)).toBe(true);
  });

  it('always adds up to the net the page shows', () => {
    for (const a of [RICH, SPARSE, COSTLY]) {
      expect(flowTotals(flowsFromAnalysis(a)).net).toBe(a.netAnnualImpact);
    }
  });

  it('adds no rest when the categories make the net', () => {
    expect(flowsFromAnalysis(SPARSE)).toEqual([{ id: 'taxes', label: 'Taxes', value: 1200, tone: 'gain' }]);
  });

  it('keeps a net with no breakdown as one honest rest flow', () => {
    expect(flowsFromAnalysis({ netAnnualImpact: -300 })).toEqual([{ id: REST_FLOW_ID, label: 'Other effects', value: -300, tone: 'loss', rest: true }]);
  });

  it('is empty when there is nothing to flow', () => {
    expect(flowsFromAnalysis(EMPTY)).toEqual([]);
    expect(flowsFromAnalysis({})).toEqual([]);
    expect(flowsFromAnalysis({ netAnnualImpact: Number.NaN, categoryImpacts: { taxes: Number.NaN } })).toEqual([]);
  });

  it('never reports −0', () => {
    const flows = flowsFromAnalysis({ netAnnualImpact: -0.3, categoryImpacts: { taxes: -0.4 } });
    expect(flows).toEqual([]);
  });
});

describe('sankeyLayout', () => {
  const flows = flowsFromAnalysis(RICH);
  const layout = sankeyLayout(flows);

  it('makes every channel as tall as its dollars, on one linear scale', () => {
    layout.gates.forEach((g, i) => {
      expect(close(g.y1 - g.y0, Math.abs(flows[i].value) * layout.unitsPerDollar, 1e-9)).toBe(true);
    });
    const [taxes, retirement] = layout.gates;
    expect((taxes.y1 - taxes.y0) / (retirement.y1 - retirement.y0)).toBeCloseTo(1200 / 150);
  });

  it('stacks the channels top to bottom, gains above costs, inside the span', () => {
    const G = SANKEY_WORLD.gates;
    expect(layout.gates[0].y1).toBeCloseTo(G.span / 2);
    expect(layout.gates[layout.gates.length - 1].y0).toBeCloseTo(-G.span / 2);
    for (let i = 1; i < layout.gates.length; i++) expect(layout.gates[i].y1).toBeLessThan(layout.gates[i - 1].y0);
    expect(layout.gates.map((g) => g.tone)).toEqual(['gain', 'gain', 'loss', 'loss', 'loss']);
  });

  it('shares the light out by dollars, every channel getting at least one stream', () => {
    const total = layout.gates.reduce((s, g) => s + g.streams, 0);
    expect(total).toBe(SANKEY_WORLD.streams);
    expect(layout.gates[0].streams).toBeGreaterThan(layout.gates[1].streams);
    expect(Math.min(...layout.gates.map((g) => g.streams))).toBeGreaterThanOrEqual(1);
    // Taxes carries 1200 of 2250 gross dollars.
    expect(layout.gates[0].streams).toBe(Math.round((1200 / 2250) * SANKEY_WORLD.streams));
  });

  it('sends every stream level through its own channel: gains into the basin, costs out of it', () => {
    const streams = sankeyStreams(layout);
    expect(streams).toHaveLength(SANKEY_WORLD.streams);
    const G = SANKEY_WORLD.gates;
    for (const s of streams) {
      const gate = layout.gates.find((g) => g.id === s.gate)!;
      const through = s.points.filter(([x]) => Math.abs(Math.abs(x - G.x) - 0.13) < 1e-9);
      expect(through).toHaveLength(2);
      const [[, inY], [, outY]] = through;
      expect(inY).toBe(outY);
      expect(inY).toBeGreaterThanOrEqual(gate.y0);
      expect(inY).toBeLessThanOrEqual(gate.y1);
      expect(s.tone).toBe(gate.tone);
      expect(s.out).toBe(gate.tone === 'loss');
      // In the light's direction: a gain ends in the basin, a cost starts there (and leaves through its foot, below the mouth).
      const first = s.points[0];
      const last = s.points[s.points.length - 1];
      if (s.out) {
        expect(first[0]).toBe(SANKEY_WORLD.basin.x);
        expect(last[0]).toBeLessThan(G.x);
        expect(s.points[2][1]).toBeLessThan(SANKEY_WORLD.stand.top + SANKEY_WORLD.basin.height / 2);
      } else {
        expect(last[0]).toBe(SANKEY_WORLD.basin.x);
        expect(first[0]).toBeLessThan(G.x);
      }
    }
  });

  it('numbers the channels beside their slats, never crowding two', () => {
    const marks = sankeyGateMarks(layout);
    expect(marks.map((m) => m.id)).toEqual(layout.gates.map((g) => g.id));
    for (let i = 1; i < marks.length; i++) expect(marks[i - 1].label[1] - marks[i].label[1]).toBeGreaterThanOrEqual(0.14 - 1e-9);
    // Each label's leader runs to the middle of its own slat.
    marks.forEach((m, i) => expect(m.slat[1]).toBeCloseTo((layout.gates[i].y0 + layout.gates[i].y1) / 2));
    expect(sankeyGateMarks(sankeyLayout([]))).toEqual([]);
  });

  it('has nothing to lay out for no flows', () => {
    expect(sankeyLayout([])).toMatchObject({ gates: [], unitsPerDollar: 0 });
    expect(sankeyStreams(sankeyLayout([]))).toEqual([]);
  });
});

describe('heroLayout', () => {
  it('stacks a gain exactly as the kit column does, rising from the baseline', () => {
    const l = heroLayout(1200);
    const C = HERO_WORLD.column;
    expect(l.scale).toEqual({ step: 500, max: 1500 });
    expect(l.unitsPerDollar).toBeCloseTo(C.region / 1500);
    const kit = ledgerLayout([1200], { unitsPerDollar: l.unitsPerDollar, pedestal: C.pedestal, gap: C.gap });
    expect(l.baseline).toBeCloseTo(kit.baseline);
    expect(l.end).toBeCloseTo(kit.slabs[0].top);
    expect(l.end - l.baseline - C.gap / 2).toBeCloseTo(1200 * l.unitsPerDollar);
    // Marks every $500 up from the baseline, to the scale's top.
    expect(l.ticks).toHaveLength(3);
    expect(l.ticks[0] - l.baseline).toBeCloseTo(500 * l.unitsPerDollar);
  });

  it('hangs a cost below a zero shelf raised to the top of the scale, clear of the plinth', () => {
    const l = heroLayout(-2400);
    const C = HERO_WORLD.column;
    expect(l.tone).toBe('loss');
    // The shelf is fixed: it doesn't sink with the amount (so a cost never stands on the foot).
    expect(l.baseline).toBeCloseTo(HERO_COST_SHELF);
    expect(heroLayout(-90).baseline).toBeCloseTo(HERO_COST_SHELF);
    expect(l.baseline - C.gap / 2 - l.end).toBeCloseTo(2400 * l.unitsPerDollar);
    // Air under it, at least the clearance, even at the scale's full reach.
    expect(l.end - C.pedestal).toBeGreaterThan(C.clearance);
    const full = heroLayout(-3000);
    expect(full.scale?.max).toBe(3000);
    expect(full.end - C.pedestal).toBeCloseTo(C.clearance);
    expect(l.ticks.every((y) => y < l.baseline && y >= C.pedestal + C.clearance - 1e-9)).toBe(true);
    // The frame holds the raised shelf.
    expect(heroViewBox().maxY).toBeGreaterThan(projectView([C.x, HERO_COST_SHELF, C.z], HERO_VIEW)[1]);
  });

  it('is an empty column on its baseline for $0, with no light travelling', () => {
    const l = heroLayout(0.3);
    expect(l).toMatchObject({ net: 0, tone: 'neutral', scale: null, unitsPerDollar: 0, ticks: [] });
    expect(l.end).toBe(l.baseline);
    expect(heroStreams(l)).toEqual([]);
  });

  it('sends the light up through a gain and down through a cost', () => {
    const up = heroLayout(1200);
    const down = heroLayout(-2400);
    for (const c of heroStreams(up)) expect(c[c.length - 1][1]).toBeGreaterThan(c[c.length - 2][1]);
    for (const c of heroStreams(down)) expect(c[c.length - 1][1]).toBeLessThan(c[c.length - 2][1]);
    expect(heroStreams(up)).toHaveLength(6);
  });

  it('counts only an enacted bill as in effect', () => {
    expect(heroInEffect('enacted')).toBe(true);
    expect(heroInEffect(COSTLY.status)).toBe(true);
    for (const s of ['proposed', 'passed', 'repealed', 'rejected', '', undefined, null]) expect(heroInEffect(s)).toBe(false);
  });
});

describe('ribbonFromAnalysis', () => {
  it('keeps the 12 cumulative months, with each month’s own change and the uncertainty', () => {
    const pts = ribbonFromAnalysis(RICH);
    expect(pts).toHaveLength(12);
    expect(pts.map((p) => p.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(pts[11].value).toBe(450);
    expect(pts[0].delta).toBe(-60);
    expect(pts[3].delta).toBe(50);
    expect(pts.reduce((s, p) => s + p.delta, 0)).toBe(450);
    expect(new Set(pts.map((p) => p.uncertainty))).toEqual(new Set([0.36]));
  });

  it('draws an unrated confidence at the widest', () => {
    expect(ribbonUncertainty(0)).toEqual({ uncertainty: 1, rated: false });
    expect(ribbonUncertainty(64)).toEqual({ uncertainty: 0.36, rated: true });
    expect(ribbonUncertainty(100)).toEqual({ uncertainty: 0, rated: true });
    expect(ribbonFromAnalysis(COSTLY).every((p) => p.uncertainty === 1)).toBe(true);
  });

  it('sorts months, drops ones outside the year and keeps a repeated month once', () => {
    const pts = ribbonFromAnalysis({
      confidenceScore: 80,
      timeline: { monthly: [{ month: 3, impact: 30 }, { month: 1, impact: 10 }, { month: 13, impact: 99 }, { month: 0, impact: 5 }, { month: 3, impact: 33 }] },
    });
    expect(pts).toEqual([
      { month: 1, value: 10, delta: 10, uncertainty: 0.2 },
      { month: 3, value: 33, delta: 23, uncertainty: 0.2 },
    ]);
  });

  it('is empty without a series', () => {
    expect(ribbonFromAnalysis({})).toEqual([]);
    expect(ribbonFromAnalysis({ timeline: { monthly: [] } })).toEqual([]);
  });
});

describe('ribbonLayout and ribbonPath', () => {
  const pts = ribbonFromAnalysis(RICH);
  const layout = ribbonLayout(pts);

  it('puts month 1 and 12 at the ends, and dollars on one linear scale with zero at the plate', () => {
    expect(layout.x(1)).toBe(RIBBON_WORLD.x0);
    expect(layout.x(12)).toBe(RIBBON_WORLD.x1);
    expect(layout.y(0)).toBe(0);
    expect(layout.y(450) / layout.y(-140)).toBeCloseTo(450 / -140);
    expect(layout.maxY - layout.minY).toBeLessThanOrEqual(RIBBON_WORLD.span + 1e-9);
    expect(layout.ticks).toContain(0);
  });

  it('is wider the less certain the estimate', () => {
    const sure = ribbonLayout(pts.map((p) => ({ ...p, uncertainty: 0.1 })));
    const unsure = ribbonLayout(pts.map((p) => ({ ...p, uncertainty: 0.9 })));
    expect(unsure.width).toBeGreaterThan(sure.width);
    expect(sure.width).toBeCloseTo(RIBBON_WORLD.width.min + RIBBON_WORLD.width.range * 0.1);
    // Plainly visible: at 36% uncertainty more than four times a sure estimate's width, and the key's share in proportion.
    expect(ribbonLayout(pts).width).toBeGreaterThan(4 * ribbonLayout(pts.map((p) => ({ ...p, uncertainty: 0 }))).width);
    expect(ribbonBandShare(1)).toBe(1);
    expect(ribbonBandShare(0.36)).toBeCloseTo(ribbonLayout(pts).width / (RIBBON_WORLD.width.min + RIBBON_WORLD.width.range));
    // The frame holds the band's full width above the highest month.
    const top = ribbonViewBox(layout).maxY;
    expect(top).toBeGreaterThan(projectView([RIBBON_WORLD.x1, layout.maxY + layout.width / 2, 0], RIBBON_VIEW)[1] - 1e-9);
  });

  it('passes through every month and never overshoots between two', () => {
    const per = 10;
    const path = ribbonPath(pts, layout, per);
    expect(path).toHaveLength((pts.length - 1) * per + 1);
    pts.forEach((p, k) => {
      const [x, y] = path[k * per];
      expect(x).toBeCloseTo(layout.x(p.month));
      expect(y).toBeCloseTo(layout.y(p.value));
    });
    for (let k = 0; k < pts.length - 1; k++) {
      const lo = Math.min(layout.y(pts[k].value), layout.y(pts[k + 1].value));
      const hi = Math.max(layout.y(pts[k].value), layout.y(pts[k + 1].value));
      for (let i = 0; i <= per; i++) {
        const y = path[k * per + i][1];
        expect(y).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(y).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
  });

  it('handles a flat year and a single month', () => {
    const flat: RibbonPoint[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, value: 0, delta: 0, uncertainty: 0.5 }));
    const l = ribbonLayout(flat);
    expect(l.scale).toBeNull();
    expect(ribbonPath(flat, l).every(([, y]) => y === 0)).toBe(true);
    const box = ribbonViewBox(l);
    expect(box.maxY - box.minY).toBeGreaterThan(0.1);
    expect(ribbonPath(flat.slice(0, 1), l)).toHaveLength(1);
    expect(ribbonPath([], l)).toEqual([]);
  });
});

describe('crystalFromAnalysis', () => {
  it('gives the six scores as radii, in the radar’s order and words', () => {
    const axes = crystalFromAnalysis(RICH);
    expect(axes.map((x) => x.axis)).toEqual([...CRYSTAL_AXES]);
    expect(axes.map((x) => x.score)).toEqual([35, 62, 20, 71, 15, 48]);
    expect(axes.map((x) => x.value)).toEqual([0.35, 0.62, 0.2, 0.71, 0.15, 0.48]);
    expect(axes[0].label).toBe(RADAR_LABELS.expert.incomeStability);
    expect(crystalFromAnalysis(RICH, { simple: true })[3].label).toBe(RADAR_LABELS.simple.costOfLivingPressure);
  });

  it('is empty for an analysis that scored nothing', () => {
    expect(crystalFromAnalysis(SPARSE)).toEqual([]);
    expect(crystalFromAnalysis({})).toEqual([]);
  });

  it('clamps scores to 0 … 100', () => {
    const axes = crystalFromAnalysis({ vulnerability: { incomeStability: 140, debtBurden: -5, housingSecurity: 10 } });
    expect(axes[0].value).toBe(1);
    expect(axes[5].value).toBe(0);
  });
});

describe('crystalLayout and crystalFacets', () => {
  const axes = crystalFromAnalysis(RICH);
  const layout = crystalLayout(axes);

  it('reaches out along each axis as far as its score (linear), first axis away from the viewer, then clockwise', () => {
    layout.girdle.forEach(([x, z], i) => expect(Math.hypot(x, z)).toBeCloseTo(axes[i].value * CRYSTAL_WORLD.radius));
    expect(layout.girdle[0][0]).toBeCloseTo(0);
    expect(layout.girdle[0][1]).toBeLessThan(0);
    // Clockwise seen from above: the second axis is to the right.
    expect(layout.girdle[1][0]).toBeGreaterThan(0);
  });

  it('keeps a zero score a visible point', () => {
    const l = crystalLayout(crystalFromAnalysis({ vulnerability: { incomeStability: 50 } }));
    expect(Math.hypot(...l.girdle[1])).toBeCloseTo(CRYSTAL_WORLD.minRadius * CRYSTAL_WORLD.radius);
  });

  it('cuts a closed gem with every facet facing out', () => {
    const facets = crystalFacets(layout);
    expect(facets).toHaveLength(axes.length * 4);
    const centre = [0, (layout.crownY + layout.pavilionY) * 0.25, 0];
    for (const f of facets) {
      const [a, b, c] = f.points;
      const m = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3 - centre[k]);
      expect(f.normal[0] * m[0] + f.normal[1] * m[1] + f.normal[2] * m[2]).toBeGreaterThan(0);
      // The winding agrees with the normal.
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      expect(n[0] * f.normal[0] + n[1] * f.normal[1] + n[2] * f.normal[2]).toBeGreaterThan(0);
    }
    expect(crystalFacets(crystalLayout([]))).toEqual([]);
  });
});

describe('terrainFromAnalysis', () => {
  it('keeps the heatmap’s order, adds up a category named twice, and places a grid', () => {
    const cells = terrainFromAnalysis(RICH);
    expect(cells.map((c) => [c.label, c.value, c.tone])).toEqual([
      ['Groceries', -22, 'loss'],
      ['Utilities', -10, 'loss'],
      ['Childcare', 85, 'gain'],
      ['Dining', 0, 'neutral'],
      ['Transportation', -12, 'loss'],
      ['Healthcare', -20, 'loss'],
    ]);
    expect(terrainColumns(6)).toBe(3);
    expect(cells.map((c) => [c.row, c.col])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
    expect(new Set(cells.map((c) => c.id)).size).toBe(cells.length);
  });

  it('takes the tone from the amount, not the stated direction', () => {
    const [cell] = terrainFromAnalysis({ spendingVelocity: [{ category: 'Gas', dollarImpact: -15, direction: 'positive' }] });
    expect(cell.tone).toBe('loss');
    expect(terrainCellText(cell)).toBe('−$15 a month (costs you)');
  });

  it('is empty without spending categories', () => {
    expect(terrainFromAnalysis(SPARSE)).toEqual([]);
    expect(terrainFromAnalysis({ spendingVelocity: [{ category: '  ', dollarImpact: 5 }] })).toEqual([]);
  });

  it('raises every tile as far as its dollars on one linear scale, above its foot', () => {
    const cells = terrainFromAnalysis(RICH);
    const layout = terrainLayout(cells);
    layout.tiles.forEach((t, i) => {
      expect(t.height - TERRAIN_WORLD.foot).toBeCloseTo(Math.abs(cells[i].value) * layout.unitsPerDollar);
    });
    expect(layout.tiles.find((t) => t.id === 'dining')!.height).toBe(TERRAIN_WORLD.foot);
    expect(layout.tiles.find((t) => t.id === 'childcare')!.strength).toBe(1);
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(2);
    const box = terrainViewBox(layout);
    expect(box.maxX).toBeGreaterThan(box.minX);
  });
});

describe('words', () => {
  it('says the hero’s amount with its sign and words, and whether it is law', () => {
    expect(describeTransmission({ netAnnualImpact: 1200, status: 'proposed', title: 'Family Tax Relief Act' })).toBe(
      '“Family Tax Relief Act” as a sheet of glass on a plinth, its light rising beside it into a teal column standing on a zero shelf: +$1,200 a year (saves you). It isn’t law, so this is what it would mean if enacted.'
    );
    expect(describeTransmission({ netAnnualImpact: -2400, status: 'enacted' })).toContain('−$2,400 a year (costs you).');
    expect(describeTransmission({ netAnnualImpact: -2400, status: 'enacted' })).not.toContain('isn’t law');
    expect(describeTransmission({ netAnnualImpact: 0 })).toContain('no change');
    expect(heroScaleNote(1200)).toContain('each mark on the staff is $500 a year');
    expect(heroScaleNote(-1200)).toContain('amber column hangs below its zero shelf');
    expect(describeTransmission({ netAnnualImpact: -2400 })).toContain('hanging below a raised zero shelf');
    expect(heroScaleNote(0)).toContain('No change');
    // No official status (an unverified bill): the stage isn't guessed either way.
    const unknown = describeTransmission({ netAnnualImpact: 1200 });
    expect(unknown).not.toContain('isn’t law');
    expect(unknown).toContain('isn’t checked against an official record');
  });

  it('keys the crystal: every score is a risk, higher = more at risk', () => {
    expect(CRYSTAL_DIRECTION).toBe('Higher = more at risk');
    expect(crystalScaleNote()).toContain('higher means more pressure on you (more at risk)');
  });

  it('puts each axis’s and tile’s number where the picture draws it', () => {
    const marks = crystalMarks();
    expect(marks).toHaveLength(6);
    // The first axis points away from the viewer, on the outer ring.
    expect(marks[0][0]).toBeCloseTo(0, 9);
    expect(marks[0][2]).toBeCloseTo(-CRYSTAL_WORLD.radius, 9);
    marks.forEach((m) => expect(Math.hypot(m[0], m[2])).toBeCloseTo(CRYSTAL_WORLD.radius, 9));
    const layout = terrainLayout(terrainFromAnalysis(RICH));
    const tiles = terrainMarks(layout);
    expect(tiles.map((t) => t.id)).toEqual(layout.tiles.map((t) => t.id));
    tiles.forEach((t, i) => expect(t.at).toEqual([layout.tiles[i].x, layout.tiles[i].height, layout.tiles[i].z]));
  });

  it('names every flow and the net', () => {
    const flows = flowsFromAnalysis(RICH);
    const d = describeFlows(flows);
    expect(d).toContain('Taxes +$1,200');
    expect(d).toContain('1, Taxes');
    expect(d).toContain('drains out of it');
    expect(flowScaleNote(flows)).toContain('amber light drains out of it');
    expect(d).toContain('Other effects −$180');
    expect(d).toContain('+$450 a year (saves you)');
    expect(describeFlows([])).toContain('no yearly amounts');
    expect(flowScaleNote(flows)).toContain('Other effects');
    expect(flowScaleNote(flowsFromAnalysis(SPARSE))).not.toContain('Other effects');
  });

  it('says the ribbon’s width means uncertainty', () => {
    const pts = ribbonFromAnalysis(RICH);
    const d = describeRibbon(pts, RICH.confidenceScore, 6);
    expect(d).toContain('+$450 by month 12 (saves you)');
    expect(d).toContain('36% (confidence 64 of 100)');
    expect(d).toContain(RIBBON_LEGEND.wider);
    expect(d).toContain('Month 6 is lit: +$40 so far.');
    expect(describeRibbon(ribbonFromAnalysis(COSTLY), COSTLY.confidenceScore)).toContain('wasn’t rated');
    expect(RIBBON_LEGEND.wider).toBe('wider = less certain');
    expect(ribbonScaleNote(pts)).toMatch(/each mark on the staff is \$\d/);
  });

  it('names every axis with its score, and the highest', () => {
    const d = describeCrystal(crystalFromAnalysis(RICH));
    expect(d).toContain('Income stability 35 of 100');
    expect(d).toContain('Highest: Cost-of-living pressure.');
    expect(describeCrystal([])).toContain('no vulnerability scores');
    expect(crystalScaleNote()).toContain('linear');
  });

  it('names every spending category with its sign', () => {
    const d = describeTerrain(terrainFromAnalysis(RICH));
    expect(d).toContain('1 teal tile where it saves you money');
    expect(d).toContain('4 amber tiles where it costs more');
    expect(d).toContain('Groceries −$22');
    expect(terrainScaleNote([])).toContain('No spending categories');
    expect(terrainScaleNote(terrainFromAnalysis(RICH))).toContain('$100 a month');
  });

  it('never prints NaN or −0', () => {
    const all = [
      describeTransmission({ netAnnualImpact: Number.NaN }),
      describeFlows(flowsFromAnalysis({ netAnnualImpact: -0.2 })),
      describeRibbon(ribbonFromAnalysis(EMPTY), EMPTY.confidenceScore),
      describeTerrain(terrainFromAnalysis({ spendingVelocity: [{ category: 'Gas', dollarImpact: -0.2 }] })),
    ].join(' ');
    expect(all).not.toMatch(/NaN|−\$0\b/);
  });
});

// ---------------------------------------------------------------------------
// The posters: what the server sends for every scene. All must render before
// any effect runs, the same way every time (hydration), and be decoration.

const posters = [
  ['TransmissionPoster', () => h(TransmissionPoster, { netAnnualImpact: RICH.netAnnualImpact, status: RICH.status })],
  ['TransmissionPoster (cost)', () => h(TransmissionPoster, { netAnnualImpact: -2400, status: 'enacted' })],
  ['TransmissionPoster ($0)', () => h(TransmissionPoster, { netAnnualImpact: 0 })],
  ['FlowPoster', () => h(FlowPoster, { flows: flowsFromAnalysis(RICH) })],
  ['FlowPoster (empty)', () => h(FlowPoster, { flows: [] })],
  ['RibbonPoster', () => h(RibbonPoster, { points: ribbonFromAnalysis(RICH), focus: 6 })],
  ['RibbonPoster (empty)', () => h(RibbonPoster, { points: [] })],
  ['CrystalPoster', () => h(CrystalPoster, { axes: crystalFromAnalysis(RICH) })],
  ['CrystalPoster (empty)', () => h(CrystalPoster, { axes: [] })],
  ['TerrainPoster', () => h(TerrainPoster, { cells: terrainFromAnalysis(RICH) })],
  ['TerrainPoster (empty)', () => h(TerrainPoster, { cells: [] })],
] as const;

describe('posters', () => {
  it.each(posters)('%s is decoration, never focusable, with no text', (_, make) => {
    const html = renderToString(make());
    expect(html).toMatch(/^<svg [^>]*aria-hidden="true"/);
    expect(html).toContain('focusable="false"');
    expect(html).toContain('data-decorative=""');
    expect(html).not.toMatch(/<text|role=|tabindex|NaN|Infinity/i);
  });

  it.each(posters)('%s renders the same markup every time (hydration-safe)', (_, make) => {
    expect(renderToString(make())).toBe(renderToString(make()));
  });

  it('draws the hero’s light only when there is an amount, in its tone', () => {
    const gain = renderToString(h(TransmissionPoster, { netAnnualImpact: 1200 }));
    const cost = renderToString(h(TransmissionPoster, { netAnnualImpact: -1200 }));
    const none = renderToString(h(TransmissionPoster, { netAnnualImpact: 0 }));
    expect(gain).toContain('fill-gain-fill');
    expect(gain).not.toContain('fill-loss-fill');
    expect(cost).toContain('fill-loss-fill');
    expect((none.match(/stroke-dasharray/g) ?? []).length).toBe(0);
    // Gold is the official record's: the seal is on the sheet only for a verified record.
    expect(gain).not.toContain('fill-gold');
    expect(renderToString(h(TransmissionPoster, { netAnnualImpact: 1200, verified: true }))).toContain('fill-gold');
    expect(renderToString(h(FlowPoster, { flows: flowsFromAnalysis(RICH) }))).not.toContain('fill-gold');
    expect(renderToString(h(FlowPoster, { flows: flowsFromAnalysis(RICH), verified: true }))).toContain('fill-gold');
  });

  it('draws one stroke per stream and a slat per channel', () => {
    const flows = flowsFromAnalysis(RICH);
    const html = renderToString(h(FlowPoster, { flows }));
    expect((html.match(/stroke-dasharray="0.1 9"/g) ?? []).length).toBe(SANKEY_WORLD.streams);
    // Each slat is three faces in its tone (plus its shading).
    expect((html.match(/class="fill-gain-fill stroke-gain-fill"/g) ?? []).length).toBe(2);
    expect((html.match(/class="fill-loss-fill stroke-loss-fill"/g) ?? []).length).toBe(3);
  });

  it('draws a bead per month, and the focus ring', () => {
    const html = renderToString(h(RibbonPoster, { points: ribbonFromAnalysis(RICH), focus: 6 }));
    expect((html.match(/<circle/g) ?? []).length).toBe(13);
    expect(html).toContain('stroke-violet-glow');
    expect(renderToString(h(RibbonPoster, { points: ribbonFromAnalysis(RICH) }))).not.toContain('stroke-violet-glow');
  });

  it('draws no gem for no scores, and every facet for six', () => {
    const empty = renderToString(h(CrystalPoster, { axes: [] }));
    const full = renderToString(h(CrystalPoster, { axes: crystalFromAnalysis(RICH) }));
    const facets = (html: string) => (html.match(/<path d="[^"]*" fill-opacity="/g) ?? []).length;
    expect(facets(empty)).toBe(0);
    expect(facets(full)).toBe(6 * 4);
    expect((empty.match(/<circle/g) ?? []).length).toBe(0);
    expect((full.match(/<circle/g) ?? []).length).toBe(6);
  });

  it('draws a tile per category', () => {
    const cells = terrainFromAnalysis(RICH);
    const html = renderToString(h(TerrainPoster, { cells }));
    // The slab plus one solid per tile, each with three faces in its fill.
    expect((html.match(/class="fill-loss-fill stroke-loss-fill"/g) ?? []).length).toBe(4);
    expect((html.match(/class="fill-gain-fill stroke-gain-fill"/g) ?? []).length).toBe(1);
  });
});
