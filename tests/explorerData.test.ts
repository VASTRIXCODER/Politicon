import { describe, it, expect } from 'vitest';
import {
  BRACKETS,
  BRACKET_ROWS,
  CATEGORIES,
  CHART_SCALE,
  EXAMPLE_COUNT_LABEL,
  EXAMPLE_POLICIES,
  ILLUSTRATIVE_NOTE,
  UNIT_LABEL,
  categoryTotal,
  divergingBar,
  exampleImpact,
  formatAnnual,
  largestEffect,
} from '@/lib/explorerData';
import { impactSign } from '@/lib/format';

const M = '−';
const allAmounts = EXAMPLE_POLICIES.flatMap((p) => BRACKETS.map((b) => p.annualByBracket[b.key]));

describe('explorer dataset', () => {
  it('is labelled illustrative everywhere it states a unit', () => {
    expect(ILLUSTRATIVE_NOTE).toBe('Illustrative examples, not real analyses — sign up to see estimates for your situation.');
    expect(UNIT_LABEL).toBe('$/yr, illustrative');
  });

  it('has a finite whole-dollar amount for every policy and bracket', () => {
    for (const p of EXAMPLE_POLICIES) {
      expect(Object.keys(p.annualByBracket).sort()).toEqual(BRACKETS.map((b) => b.key).sort());
    }
    expect(allAmounts.length).toBe(EXAMPLE_POLICIES.length * BRACKETS.length);
    for (const n of allAmounts) {
      expect(Number.isFinite(n)).toBe(true);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('shows both gains and costs (signed from the household side)', () => {
    expect(allAmounts.some((n) => n > 0)).toBe(true);
    expect(allAmounts.some((n) => n < 0)).toBe(true);
  });

  it('has unique ids, known categories and every category populated', () => {
    const ids = EXAMPLE_POLICIES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = CATEGORIES.map((c) => c.key) as string[];
    for (const p of EXAMPLE_POLICIES) expect(keys).toContain(p.category);
    for (const c of CATEGORIES) expect(EXAMPLE_POLICIES.some((p) => p.category === c.key)).toBe(true);
  });

  it('presents every policy as hypothetical, never as a real bill', () => {
    for (const p of EXAMPLE_POLICIES) {
      expect(p.summary.startsWith('Hypothetical:')).toBe(true);
      // No bill names or numbers ("… Act", "H.R. 12", "S. 34", "AB 102").
      expect(`${p.title} ${p.summary}`).not.toMatch(/\bAct\b|\bH\.?\s?R\.?\s?\d|\bS\.\s?\d|\b[AS]B\s?\d/);
    }
  });

  it('quotes no rates, thresholds or amounts from a real platform', () => {
    for (const p of EXAMPLE_POLICIES) expect(`${p.title} ${p.summary}`).not.toMatch(/\d/);
  });

  it('quotes the real number of examples in its copy', () => {
    expect(EXAMPLE_COUNT_LABEL).toBe(`${EXAMPLE_POLICIES.length} example policies across ${CATEGORIES.length} categories`);
  });
});

describe('balance (the examples are not an argument for one side)', () => {
  it('gives every bracket both a gain and a cost across the categories', () => {
    for (const row of BRACKET_ROWS) {
      const totals = Object.values(row.totals);
      expect(totals.some((n) => n > 0), `${row.label} has no gain`).toBe(true);
      expect(totals.some((n) => n < 0), `${row.label} has no cost`).toBe(true);
    }
  });

  it('includes policies that help higher incomes most and policies that cost lower incomes', () => {
    const top = BRACKETS[BRACKETS.length - 1].key;
    const bottom = BRACKETS[0].key;
    // Gains that rise with income, and gains that fall with it.
    expect(EXAMPLE_POLICIES.some((p) => largestEffect(p).bracket.key === top && largestEffect(p).amount > 0)).toBe(true);
    expect(EXAMPLE_POLICIES.some((p) => largestEffect(p).bracket.key === bottom && largestEffect(p).amount > 0)).toBe(true);
    // Costs that reach the lowest bracket, and costs that only reach the highest.
    expect(EXAMPLE_POLICIES.some((p) => p.annualByBracket[bottom] < 0)).toBe(true);
    expect(EXAMPLE_POLICIES.some((p) => p.annualByBracket[top] < 0 && p.annualByBracket[bottom] === 0)).toBe(true);
  });
});

describe('exampleImpact', () => {
  it('quotes one bracket of an example, as the chart does', () => {
    for (const p of EXAMPLE_POLICIES) {
      for (const b of BRACKETS) {
        const impact = exampleImpact(p.id, b.key);
        expect(impact.policy).toBe(p);
        expect(impact.bracket).toBe(b);
        expect(impact.annual).toBe(p.annualByBracket[b.key]);
      }
    }
  });

  it('fails loudly on an unknown id instead of showing a made-up figure', () => {
    expect(() => exampleImpact('no-such-policy', 'under25k')).toThrow(/Unknown example policy/);
  });
});

describe('bracket totals', () => {
  it('are the sum of the example policies in each category', () => {
    for (const row of BRACKET_ROWS) {
      for (const c of CATEGORIES) {
        const expected = EXAMPLE_POLICIES.filter((p) => p.category === c.key).reduce((s, p) => s + p.annualByBracket[row.key], 0);
        expect(row.totals[c.key]).toBe(expected);
        expect(categoryTotal(c.key, row.key)).toBe(expected);
        expect(Number.isFinite(row.totals[c.key])).toBe(true);
      }
    }
  });

  it('cover every bracket in order', () => {
    expect(BRACKET_ROWS.map((r) => r.label)).toEqual(BRACKETS.map((b) => b.label));
  });

  it('fit the shared chart scale', () => {
    const cells = BRACKET_ROWS.flatMap((r) => Object.values(r.totals));
    expect(CHART_SCALE).toBe(Math.max(...cells.map(Math.abs)));
    for (const n of cells) expect(Math.abs(n)).toBeLessThanOrEqual(CHART_SCALE);
  });
});

describe('signs and labels agree', () => {
  it('formats every amount with the sign of its value', () => {
    const cells = [...allAmounts, ...BRACKET_ROWS.flatMap((r) => Object.values(r.totals))];
    for (const n of cells) {
      const label = formatAnnual(n);
      expect(label.endsWith('/yr')).toBe(true);
      if (n > 0) expect(label.startsWith('+$')).toBe(true);
      else if (n < 0) expect(label.startsWith(`${M}$`)).toBe(true);
      else expect(label).toBe('$0/yr');
    }
  });

  it('draws gains right of the zero line and costs left, within half the track', () => {
    for (const n of [...allAmounts, ...BRACKET_ROWS.flatMap((r) => Object.values(r.totals))]) {
      const bar = divergingBar(n);
      expect(bar.sign).toBe(impactSign(n));
      if (n === 0) expect(bar.width).toBe(0);
      else {
        expect(bar.width).toBeGreaterThan(0);
        expect(bar.width).toBeLessThanOrEqual(50);
      }
    }
    expect(divergingBar(CHART_SCALE).width).toBe(50);
    expect(divergingBar(-CHART_SCALE)).toEqual({ sign: 'loss', width: 50 });
    expect(divergingBar(1).width).toBe(1.5);
  });

  it('picks the bracket with the largest effect for the cards and ticker', () => {
    for (const p of EXAMPLE_POLICIES) {
      const { bracket, amount } = largestEffect(p);
      expect(amount).toBe(p.annualByBracket[bracket.key]);
      for (const b of BRACKETS) expect(Math.abs(p.annualByBracket[b.key])).toBeLessThanOrEqual(Math.abs(amount));
      expect(amount).not.toBe(0);
    }
  });
});
