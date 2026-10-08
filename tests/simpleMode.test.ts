import { describe, it, expect } from 'vitest';
import { pctToDollar, jargonList, BASE_JARGON } from '@/lib/simpleMode';

describe('pctToDollar', () => {
  it('names the direction in words instead of a sign', () => {
    expect(pctToDollar(0.4, 75000)).toBe('about $300 more this year');
    expect(pctToDollar(-0.4, 75000)).toBe('about $300 less this year');
    expect(pctToDollar(-0.4, 75000, 'month')).toBe('about $25 less a month');
    expect(pctToDollar(0, 75000)).toBe('No change');
  });
});

describe('jargonList', () => {
  it('lists only the analysis terms when it supplies any', () => {
    const list = jargonList([{ term: 'Tariff', definition: 'A tax on imports.' }]);
    expect(list.map((t) => t.term)).toEqual(['Tariff']);
  });
  it('lists a term once across case and known aliases', () => {
    const list = jargonList([
      { term: 'GDP', definition: 'a' },
      { term: 'Gross domestic product', definition: 'b' },
      { term: 'gdp', definition: 'c' },
      { term: 'Capex', definition: 'd' },
      { term: 'Capital expenditure', definition: 'e' },
    ]);
    expect(list.map((t) => t.term)).toEqual(['GDP', 'Capex']);
  });
  it('falls back to the built-in dictionary, which has no duplicate definitions', () => {
    const list = jargonList([]);
    expect(list.length).toBe(Object.keys(BASE_JARGON).length);
    const defs = list.map((t) => t.definition);
    expect(new Set(defs).size).toBe(defs.length);
  });
});
