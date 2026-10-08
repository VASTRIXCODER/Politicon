import { describe, expect, it } from 'vitest';
import {
  canonicalPolicyId, congressForDate, currentCongress, federalBillId, normalizeBillNumber, reconcilePolicyIds, stateBillId,
} from '@/lib/policyId';

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

describe('official record ids', () => {
  const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

  it('includes the Congress in federal ids', () => {
    expect(federalBillId(119, 'HR', '1')).toBe('us-119-hr-1');
    expect(federalBillId(120, 'sjres', '4')).toBe('us-120-sjres-4');
  });

  it('builds state ids from the state, session and identifier', () => {
    expect(stateBillId('California', '20252026', 'SB 1047')).toBe('california-20252026-sb-1047');
    expect(stateBillId('New York', '2025-2026', 'A 3005')).toBe('new-york-2025-2026-a-3005');
    expect(stateBillId('Minnesota', null, 'HF 2')).toBe('minnesota-hf-2');
    // Identifiers that normalizeBillNumber doesn't know no longer fall back to the title.
    expect(stateBillId('Minnesota', '2025', 'SF 2')).not.toBe(stateBillId('Minnesota', '2025', 'HF 2'));
    expect(stateBillId('California', '2025', '!!!')).toBeNull();
  });

  it('always fits the stored id pattern', () => {
    const id = stateBillId('North Carolina'.repeat(5), 'Regular Session '.repeat(5), 'Senate Bill 123456 '.repeat(5));
    expect(id).toMatch(ID);
    expect(stateBillId('Texas', '', 'HB 1')).toMatch(ID);
  });
});

describe('Congress dates', () => {
  it.each([
    ['2025-01-02', 118],
    ['2025-01-03', 119],
    ['2026-10-08', 119],
    ['2027-01-02', 119],
    ['2027-01-03', 120],
  ])('%s → %i', (d, n) => {
    expect(currentCongress(new Date(`${d}T12:00:00Z`))).toBe(n);
    expect(congressForDate(`${d}T12:00:00Z`)).toBe(n);
  });

  it('returns null for missing or invalid timestamps', () => {
    expect(congressForDate(null)).toBeNull();
    expect(congressForDate('')).toBeNull();
    expect(congressForDate('not a date')).toBeNull();
  });
});

describe('reconcilePolicyIds across Congresses and jurisdictions', () => {
  const row = (policy_id: string, bill_number: string | null, extra: { region?: string | null; congress?: number | null; session?: string; policy_title?: string } = {}) =>
    ({ policy_id, policy_title: extra.policy_title ?? null, bill_number, ...extra });

  it("doesn't give a new Congress's bill an older Congress's analysis", () => {
    const existing = [row('us-hr-1', 'H.R. 1', { congress: 119 })];
    const next = { id: 'us-120-hr-1', title: 'A new H.R. 1', billNumber: 'H.R. 1', region: 'Federal', record: { congress: 120 } };
    expect(reconcilePolicyIds([next], existing)[0].id).toBe('us-120-hr-1');
    const same = { ...next, id: 'us-119-hr-1', record: { congress: 119 } };
    expect(reconcilePolicyIds([same], existing)[0].id).toBe('us-hr-1');
  });

  it('trusts the Congress in a stored id over the one passed in', () => {
    const existing = [row('us-119-hr-1', 'H.R. 1', { congress: 120 })];
    const item = { id: 'us-120-hr-1', title: 'x', billNumber: 'H.R. 1', region: 'Federal', congress: 120 };
    expect(reconcilePolicyIds([item], existing)[0].id).toBe('us-120-hr-1');
  });

  it('prefers an analysis of the same Congress over one whose Congress is unknown', () => {
    const existing = [row('old-title-id', 'H.R. 1'), row('us-hr-1', 'H.R. 1', { congress: 119 })];
    const item = { id: 'us-119-hr-1', title: 'x', billNumber: 'H.R. 1', region: 'Federal', congress: 119 };
    expect(reconcilePolicyIds([item], existing)[0].id).toBe('us-hr-1');
  });

  it('matches bill numbers only within the same jurisdiction', () => {
    const fromId = [row('texas-sb-2', 'SB 2', { congress: 119 })];
    const texas = { id: 'texas-89-sb-2', title: 'x', billNumber: 'SB 2', region: 'Texas' };
    const california = { id: 'california-20252026-sb-2', title: 'y', billNumber: 'SB 2', region: 'California' };
    expect(reconcilePolicyIds([texas], fromId)[0].id).toBe('texas-sb-2');
    expect(reconcilePolicyIds([california], fromId)[0].id).toBe('california-20252026-sb-2');

    const fromRegion = [row('property-tax-relief', 'SB 2', { region: 'Texas' })];
    expect(reconcilePolicyIds([texas], fromRegion)[0].id).toBe('property-tax-relief');
    expect(reconcilePolicyIds([california], fromRegion)[0].id).toBe('california-20252026-sb-2');

    // Federal S. 1 and a state's S 1 normalize alike but are different bills.
    const vermont = { id: 'vermont-2025-s-1', title: 'z', billNumber: 'S 1', region: 'Vermont' };
    expect(reconcilePolicyIds([vermont], [row('us-119-s-1', 'S. 1')])[0].id).toBe('vermont-2025-s-1');
    expect(reconcilePolicyIds([vermont], [row('vermont-2025-s-1', 'S 1')])[0].id).toBe('vermont-2025-s-1');
  });

  it("doesn't give a new state session's bill an older session's analysis", () => {
    const existing = [row('california-20252026-sb-1', 'SB 1', { region: 'California', session: '20252026' })];
    const next = { id: 'california-20272028-sb-1', title: 'x', billNumber: 'SB 1', region: 'California', session: '20272028' };
    expect(reconcilePolicyIds([next], existing)[0].id).toBe('california-20272028-sb-1');
    // Same session (as the feed carries it, on the record): reuse the analysis.
    const fromFeed = { id: 'renamed', title: 'x', billNumber: 'SB 1', region: 'California', record: { session: '20252026' } };
    expect(reconcilePolicyIds([fromFeed], existing)[0].id).toBe('california-20252026-sb-1');
    // An analysis without a known session still matches.
    expect(reconcilePolicyIds([next], [row('california-sb-1', 'SB 1')])[0].id).toBe('california-sb-1');
  });

  it('applies the Congress check to the older title-based ids too', () => {
    const existing = [row('child-tax-credit-expansion-act', null, { policy_title: 'Child Tax Credit Expansion Act', congress: 119 })];
    const item = { id: 'us-120-hr-9', title: 'Child Tax Credit Expansion Act', billNumber: 'H.R. 9', region: 'Federal', record: { congress: 120 } };
    expect(reconcilePolicyIds([item], existing)[0].id).toBe('us-120-hr-9');
    expect(reconcilePolicyIds([{ ...item, id: 'us-119-hr-9', record: { congress: 119 } }], existing)[0].id).toBe('child-tax-credit-expansion-act');
  });
});
