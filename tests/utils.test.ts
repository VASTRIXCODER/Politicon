import { describe, expect, it } from 'vitest';
import { cn, formatCurrency } from '@/lib/utils';

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

describe('cn', () => {
  it('keeps a custom font size next to a text colour', () => {
    expect(cn('text-display-md text-ink')).toBe('text-display-md text-ink');
    expect(cn('text-meta', 'text-muted')).toBe('text-meta text-muted');
  });

  it("lets the caller's radius, shadow and layer replace the custom defaults", () => {
    expect(cn('rounded-pane', 'rounded-3xl')).toBe('rounded-3xl');
    expect(cn('rounded-tile', 'rounded-pane')).toBe('rounded-pane');
    expect(cn('shadow-pane', 'shadow-none')).toBe('shadow-none');
    expect(cn('shadow-lift', 'shadow-glow')).toBe('shadow-glow');
    expect(cn('z-nav', 'z-modal')).toBe('z-modal');
  });
});
