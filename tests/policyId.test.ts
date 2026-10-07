import { describe, expect, it } from 'vitest';
import { canonicalPolicyId, normalizeBillNumber, reconcilePolicyIds } from '@/lib/policyId';

describe('normalizeBillNumber', () => {
  it.each([
    ['H.R. 1', 'hr-1'],
    ['HR 3935', 'hr-3935'],
    ['S. 4361', 's-4361'],
    ['S 12', 's-12'],
    ['H.J.Res. 7', 'hjres-7'],
    ['S.Res. 45', 'sres-45'],
    ['SB 1047', 'sb-1047'],
    ['AB 5', 'ab-5'],
    ['Assembly Bill 2273', 'ab-2273'],
    ['HB 0042', 'hb-42'],
  ])('%s → %s', (input, out) => {
    expect(normalizeBillNumber(input)).toBe(out);
  });

  it('returns null for things that are not bill numbers', () => {
    expect(normalizeBillNumber('')).toBeNull();
    expect(normalizeBillNumber('Executive Order')).toBeNull();
    expect(normalizeBillNumber('Section 8')).toBeNull();
  });
});

describe('canonicalPolicyId', () => {
  it('uses jurisdiction + bill number, independent of the title wording', () => {
    const a = canonicalPolicyId({ billNumber: 'H.R. 1', region: 'Federal', title: 'One Big Beautiful Bill' });
    const b = canonicalPolicyId({ billNumber: 'HR 1', region: 'United States', title: 'The One Big Beautiful Bill Act' });
    expect(a).toBe('us-hr-1');
    expect(b).toBe(a);
    expect(canonicalPolicyId({ billNumber: 'SB 1047', region: 'California', title: 'x' })).toBe('california-sb-1047');
  });

  it('falls back to the title and always fits the stored id pattern', () => {
    const id = canonicalPolicyId({ title: 'Child Tax Credit Expansion (2026)!', billNumber: '' });
    expect(id).toBe('child-tax-credit-expansion-2026');
    const long = canonicalPolicyId({ title: 'x'.repeat(200) });
    expect(long).toMatch(/^[a-z0-9][a-z0-9-]{0,79}$/);
    expect(canonicalPolicyId({ title: '!!!' })).toMatch(/^[a-z0-9][a-z0-9-]{0,79}$/);
  });
});


describe('reconcilePolicyIds', () => {
  const existing = [
    { policy_id: 'one-big-beautiful-bill', policy_title: 'One Big Beautiful Bill', bill_number: 'H.R. 1' },
    { policy_id: 'child-tax-credit-expansion', policy_title: 'Child Tax Credit Expansion', bill_number: '' },
  ];

  it('reuses an existing analysis id for the same bill number', () => {
    const [item] = reconcilePolicyIds([{ id: 'us-hr-1', title: 'The One Big Beautiful Bill Act', billNumber: 'HR 1' }], existing);
    expect(item.id).toBe('one-big-beautiful-bill');
  });

  it('reuses the older title-based id when there is no bill number', () => {
    const [item] = reconcilePolicyIds([{ id: 'child-tax-credit-expansion', title: 'Child Tax Credit Expansion', billNumber: '' }], existing);
    expect(item.id).toBe('child-tax-credit-expansion');
    const [renamed] = reconcilePolicyIds([{ id: 'new-id', title: 'Child Tax Credit Expansion' }], existing);
    expect(renamed.id).toBe('child-tax-credit-expansion');
  });

  it('keeps new policies as they are and drops duplicates', () => {
    const out = reconcilePolicyIds(
      [
        { id: 'us-hr-1', title: 'A', billNumber: 'H.R. 1' },
        { id: 'us-hr-1-dup', title: 'B', billNumber: 'HR1' },
        { id: 'us-s-5', title: 'C', billNumber: 'S. 5' },
      ],
      existing,
    );
    expect(out.map((o) => o.id)).toEqual(['one-big-beautiful-bill', 'us-s-5']);
  });
});
