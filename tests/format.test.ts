import { describe, it, expect } from 'vitest';
import { formatUSD, formatPct, formatPts, impactSign, impactWords, impactTone, costChange, formatAxisUSD } from '@/lib/format';

const M = '−';

describe('formatUSD', () => {
  it('always shows a minus on losses', () => {
    expect(formatUSD(-1234)).toBe(`${M}$1,234`);
    expect(formatUSD(-1234, { signed: true })).toBe(`${M}$1,234`);
  });
  it('adds a plus to gains only when signed', () => {
    expect(formatUSD(1234)).toBe('$1,234');
    expect(formatUSD(1234, { signed: true })).toBe('+$1,234');
  });
  it('shows zero without a sign, including values that round to zero', () => {
    expect(formatUSD(0, { signed: true })).toBe('$0');
    expect(formatUSD(-0.4, { signed: true })).toBe('$0');
    expect(formatUSD(NaN)).toBe('$0');
  });
  it('rounds to whole dollars', () => {
    expect(formatUSD(1234.6)).toBe('$1,235');
  });
  it('compacts large values', () => {
    expect(formatUSD(1500, { compact: true })).toBe('$1.5K');
    expect(formatUSD(-2_000_000, { compact: true })).toBe(`${M}$2M`);
    expect(formatUSD(3_250_000_000, { compact: true })).toBe('$3.3B');
    expect(formatUSD(999, { compact: true })).toBe('$999');
    expect(formatUSD(150_000, { compact: true })).toBe('$150K');
  });
  it('appends a suffix', () => {
    expect(formatUSD(-50, { signed: true, suffix: '/yr' })).toBe(`${M}$50/yr`);
  });
});

describe('formatPct / formatPts', () => {
  it('signs percentages by default', () => {
    expect(formatPct(1.25)).toBe('+1.3%');
    expect(formatPct(-2)).toBe(`${M}2%`);
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(5, { signed: false })).toBe('5%');
  });
  it('labels percentage points', () => {
    expect(formatPts(-0.5)).toBe(`${M}0.5 pts`);
    expect(formatPts(2)).toBe('+2 pts');
  });
});

describe('impact helpers', () => {
  it('classifies and describes direction', () => {
    expect(impactSign(10)).toBe('gain');
    expect(impactSign(-10)).toBe('loss');
    expect(impactSign(0.2)).toBe('neutral');
    expect(impactWords(-10)).toBe('costs you');
    expect(impactWords(10)).toBe('saves you');
    expect(impactTone(0)).toBe('text-text-muted');
  });
  it('words money coming in as a gain or loss, not a saving', () => {
    expect(impactWords(10, 'income')).toBe('you gain');
    expect(impactWords(-10, 'income')).toBe('you lose');
    expect(impactWords(0, 'income')).toBe('no change');
  });
});

describe('costChange', () => {
  it('reads from the cost side: a user gain is a lower cost', () => {
    expect(costChange(1200)).toBe('$1,200 lower');
    expect(costChange(-1200)).toBe('$1,200 higher');
    expect(costChange(-50, '/mo')).toBe('$50/mo higher');
    expect(costChange(0.3)).toBe('No change');
  });
});

describe('formatAxisUSD', () => {
  it('keeps fractional ticks distinct on small ranges', () => {
    expect(formatAxisUSD(0.5)).toBe('$0.50');
    expect(formatAxisUSD(0.75)).toBe('$0.75');
    expect(formatAxisUSD(1.5)).toBe('$1.50');
    expect(formatAxisUSD(2.25)).toBe('$2.25');
    expect(formatAxisUSD(-1.5)).toBe(`${M}$1.50`);
  });
  it('uses compact whole dollars otherwise', () => {
    expect(formatAxisUSD(0)).toBe('$0');
    expect(formatAxisUSD(2)).toBe('$2');
    expect(formatAxisUSD(1500)).toBe('$1.5K');
    expect(formatAxisUSD(-2500)).toBe(`${M}$2.5K`);
  });
});

describe('decimal trimming', () => {
  it('drops trailing zeros but keeps significant decimals', () => {
    expect(formatPct(0.25, { digits: 2 })).toBe('+0.25%');
    expect(formatPct(0.5, { digits: 2 })).toBe('+0.5%');
    expect(formatPts(1.1)).toBe('+1.1 pts');
  });
});
