import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import {
  CITY,
  CITY_DATA,
  CITY_FILL,
  CITY_VIEW,
  buildCityData,
  cityBounds,
  cityDescription,
  cityLayout,
  districtEmphasis,
  focusSummary,
  frameCity,
  labelAnchor,
  plinthOutline,
  projectPoint,
  signedPhrase,
  towerEmphasis,
  towerHeight,
  towerPhrase,
} from '@/components/three/scenes/bracketCityData';
import { posterShapes } from '@/app/explorer/_components/cityPosterGeometry';
import CityPoster from '@/app/explorer/_components/CityPoster';
import { BRACKETS, BRACKET_ROWS, CATEGORIES, CHART_SCALE, EXAMPLE_POLICIES, ILLUSTRATIVE_NOTE } from '@/lib/explorerData';

// "Brackets as a city" (/explorer): the model, its poster and its words must
// show the explorer's illustrative numbers honestly (linear heights on one
// scale, gains up and costs down, every bracket and category present) and
// keep every figure in frame.

const LAYOUTS = [cityLayout(CITY_DATA), cityLayout(CITY_DATA, { compact: true })];

describe('the city data', () => {
  it('has a district per bracket and a tower per category, in order, with the chart totals', () => {
    expect(CITY_DATA.districts.map((d) => d.bracket)).toEqual(BRACKETS.map((b) => b.key));
    for (const [i, d] of CITY_DATA.districts.entries()) {
      expect(d.label).toBe(BRACKETS[i].label);
      expect(d.towers.map((t) => t.category)).toEqual(CATEGORIES.map((c) => c.key));
      for (const t of d.towers) expect(t.amount).toBe(BRACKET_ROWS[i].totals[t.category]);
      expect(d.net).toBe(d.towers.reduce((s, t) => s + t.amount, 0));
    }
    expect(CITY_DATA.scale).toBe(CHART_SCALE);
    expect(CITY_DATA.policyCount).toBe(EXAMPLE_POLICIES.length);
    expect(buildCityData()).toEqual(CITY_DATA);
  });

  it('sizes every tower as a share of the one chart scale', () => {
    for (const t of CITY_DATA.districts.flatMap((d) => d.towers)) {
      expect(t.share).toBeCloseTo(Math.abs(t.amount) / CHART_SCALE, 10);
      expect(t.share).toBeLessThanOrEqual(1);
    }
    expect(CITY_DATA.tallestShare).toBe(1);
    expect(CITY_DATA.deepestShare).toBeGreaterThan(0);
  });
});

describe('tower heights', () => {
  it('are linear in dollars, with a sliver for small amounts and nothing for zero', () => {
    const unit = CITY.maxHeight / CHART_SCALE;
    for (const amount of [100, -100, 250, -290, 770]) expect(towerHeight(amount)).toBeCloseTo(Math.abs(amount) * unit, 10);
    expect(towerHeight(CHART_SCALE)).toBe(CITY.maxHeight);
    expect(towerHeight(1)).toBe(CITY.minHeight);
    expect(towerHeight(-1)).toBe(CITY.minHeight);
    expect(towerHeight(0)).toBe(0);
  });
});

describe('the layout', () => {
  for (const layout of LAYOUTS) {
    const name = layout.compact ? 'compact' : 'full';

    it(`puts every gain above the street and every cost below it, inside the acrylic (${name})`, () => {
      expect(layout.towers).toHaveLength(BRACKETS.length * CATEGORIES.length);
      for (const t of layout.towers) {
        const height = towerHeight(t.amount);
        expect(t.height).toBe(height);
        if (t.amount > 0) {
          expect(t.dir).toBe(1);
          expect(t.y0).toBe(0);
          expect(t.y1).toBeCloseTo(height, 10);
        } else if (t.amount < 0) {
          expect(t.dir).toBe(-1);
          expect(t.y1).toBe(-CITY.paper);
          expect(t.y0).toBeCloseTo(-CITY.paper - height, 10);
          expect(t.y0).toBeGreaterThan(layout.plinth.floor);
        } else {
          expect(t.dir).toBe(0);
        }
      }
      expect(layout.unitsPerDollar).toBeCloseTo(CITY.maxHeight / CHART_SCALE, 12);
      expect(layout.top).toBeCloseTo(CITY.maxHeight, 10);
    });

    it(`lays the districts out left to right in bracket order (${name})`, () => {
      const xs = layout.districts.map((d) => d.x);
      expect(layout.districts.map((d) => d.bracket)).toEqual(BRACKETS.map((b) => b.key));
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    });

    it(`keeps every tower on the plinth (${name})`, () => {
      const p = layout.plinth;
      for (const t of layout.towers) {
        const r = Math.hypot(t.x - p.cx, t.z - p.cz);
        expect(r - t.width / 2).toBeGreaterThan(p.inner);
        expect(r + t.width / 2).toBeLessThan(p.outer);
        expect(Math.abs(Math.atan2(t.x - p.cx, p.cz - t.z))).toBeLessThan(p.span);
      }
      const outline = plinthOutline(p, 32);
      expect(outline.length).toBeGreaterThan(64);
      for (const [x, z] of outline) expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
    });

    it(`frames the whole city, left to right, in boxes from portrait to wide (${name})`, () => {
      const view = layout.compact ? CITY_VIEW.compact : CITY_VIEW.full;
      for (const aspect of [0.8, 1.25, 1.5, 16 / 9, 2.1]) {
        const cam = frameCity(layout, view, aspect);
        for (const point of cityBounds(layout)) {
          const [x, y] = projectPoint(cam, point);
          expect(Math.abs(x)).toBeLessThanOrEqual(CITY_FILL.x + 0.02);
          expect(Math.abs(y)).toBeLessThanOrEqual(CITY_FILL.y + 0.02);
        }
        const labelXs = layout.districts.map((d) => projectPoint(cam, labelAnchor(layout, d))[0]);
        for (let i = 1; i < labelXs.length; i++) expect(labelXs[i]).toBeGreaterThan(labelXs[i - 1]);
      }
    });
  }
});

describe('focus', () => {
  it('lights everything with no focus, and the picked bracket or category over the rest', () => {
    for (const b of BRACKETS) for (const c of CATEGORIES) expect(towerEmphasis(undefined, b.key, c.key)).toBe(1);
    expect(towerEmphasis({ bracket: '25to50k' }, '25to50k', 'taxes')).toBe(1);
    expect(towerEmphasis({ bracket: '25to50k' }, 'under25k', 'taxes')).toBeLessThan(0.5);
    expect(towerEmphasis({ category: 'housing' }, '100kPlus', 'housing')).toBe(1);
    expect(towerEmphasis({ category: 'housing' }, '100kPlus', 'taxes')).toBeLessThan(0.5);
    const both = { bracket: '50to75k', category: 'healthcare' } as const;
    expect(towerEmphasis(both, '50to75k', 'healthcare')).toBe(1);
    const row = towerEmphasis(both, '50to75k', 'taxes');
    const rest = towerEmphasis(both, 'under25k', 'taxes');
    expect(row).toBeLessThan(1);
    expect(rest).toBeLessThan(row);
    expect(districtEmphasis({ bracket: '50to75k' }, '50to75k')).toBe(1);
    expect(districtEmphasis({ bracket: '50to75k' }, '75to100k')).toBeLessThan(1);
    expect(districtEmphasis({ category: 'taxes' }, '75to100k')).toBe(1);
  });

  it('says every focus in words, with signs and directions, as illustrative', () => {
    const all = focusSummary(CITY_DATA, undefined);
    expect(all).toMatch(/illustrative/i);
    for (const d of CITY_DATA.districts) {
      const s = focusSummary(CITY_DATA, { bracket: d.bracket });
      expect(s).toContain(d.label);
      expect(s).toMatch(/illustrative/i);
      for (const t of d.towers) expect(s).toContain(`${t.categoryLabel} ${signedPhrase(t.amount)}`);
    }
    for (const c of CATEGORIES) {
      const s = focusSummary(CITY_DATA, { category: c.key });
      for (const d of CITY_DATA.districts) expect(s).toContain(d.label);
    }
    expect(focusSummary(CITY_DATA, { bracket: '25to50k', category: 'healthcare' })).toBe(
      `${towerPhrase(CITY_DATA, '25to50k', 'healthcare')}. Illustrative figures.`
    );
    expect(signedPhrase(650)).toBe('Gain +$650/yr');
    expect(signedPhrase(-290)).toBe('Cost −$290/yr');
    expect(signedPhrase(0)).toBe('No change $0/yr');
  });

  it('describes the model for screen readers', () => {
    const text = cityDescription(CITY_DATA);
    for (const c of CATEGORIES) expect(text).toContain(c.label);
    expect(text).toContain(BRACKETS[0].label);
    expect(text).toContain(BRACKETS[BRACKETS.length - 1].label);
    expect(text).toMatch(/gains/);
    expect(text).toMatch(/costs/);
  });
});

describe('the poster', () => {
  const shapes = [posterShapes(CITY_DATA, { aspect: 2.1 }), posterShapes(CITY_DATA, { aspect: 1.5, compact: true, width: 600 })];

  it('draws every district with its gains and costs, and only finite coordinates', () => {
    for (const s of shapes) {
      expect(s.districts.map((d) => d.bracket).sort()).toEqual(BRACKETS.map((b) => b.key).sort());
      for (const d of s.districts) {
        const source = CITY_DATA.districts.find((x) => x.bracket === d.bracket)!;
        expect(d.gains.length).toBe(source.towers.filter((t) => t.amount > 0).length);
        expect(d.costs.length).toBe(source.towers.filter((t) => t.amount < 0).length);
        for (const t of [...d.gains, ...d.costs]) {
          expect(t.faces.length).toBeGreaterThan(0);
          expect(t.band).not.toBe('');
          expect(Boolean(t.roof)).toBe(t.gain);
        }
      }
      const all = JSON.stringify(s);
      expect(all).not.toMatch(/NaN|Infinity/);
      expect(s.paperTop.startsWith('M')).toBe(true);
      expect(s.acrylic.startsWith('M')).toBe(true);
    }
  });

  it('draws a floor line every $100 a year, as the 3D towers do', () => {
    const s = shapes[0];
    const tallest = s.districts.flatMap((d) => d.gains).find((t) => t.bracket === 'under25k' && t.category === 'employment')!;
    // +$770: seven floor lines, on each visible side.
    const lines = (tallest.floors.match(/M/g) ?? []).length;
    const sides = tallest.faces.length;
    expect(lines).toBe(7 * sides);
  });

  it('renders on the server, decorative, both drawings, with a hook for every bracket and category', () => {
    const html = renderToString(h(CityPoster));
    expect((html.match(/<svg\b/g) ?? []).length).toBe(2);
    expect((html.match(/<svg\b[^>]*aria-hidden="true"/g) ?? []).length).toBe(2);
    for (const b of BRACKETS) expect(html).toContain(`data-bracket="${b.key}"`);
    for (const c of CATEGORIES) expect(html).toContain(`data-category="${c.key}"`);
    // The wide drawing names the districts; the phone layout lists them outside it.
    for (const b of BRACKETS) expect(html).toContain(`>${b.label}</text>`);
    // Gradient ids are unique per drawing.
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is lit by CSS for every bracket and category the page can pick', () => {
    const css = readFileSync(path.resolve(__dirname, '../app/explorer/_components/city.module.css'), 'utf8');
    for (const b of BRACKETS) {
      expect(css).toContain(`[data-focus-bracket='${b.key}'] .district[data-bracket='${b.key}']`);
    }
    for (const c of CATEGORIES) {
      expect(css).toContain(`[data-focus-category='${c.key}'] .tower[data-category='${c.key}']`);
    }
  });
});

describe('honesty', () => {
  it('keeps the illustrative note the page shows', () => {
    expect(ILLUSTRATIVE_NOTE).toMatch(/^Illustrative examples, not real analyses/);
  });
});
