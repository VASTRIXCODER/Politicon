import { describe, expect, it } from 'vitest';
import { formatCurrency } from '@/lib/utils';

describe('formatCurrency', () => {
  it('signs gains and losses', () => {
    expect(formatCurrency(1200)).toBe('+$1,200');
    expect(formatCurrency(-450)).toBe('-$450');
  });

  it('leaves zero and unsigned values bare', () => {
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(-450, false)).toBe('$450');
  });
});
