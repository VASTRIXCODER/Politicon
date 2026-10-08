import { describe, it, expect } from 'vitest';
import { applicability } from '@/lib/applicability';

describe('applicability', () => {
  it('shows everything when the profile is unknown', () => {
    expect(applicability(null)).toEqual({ homeEquity: true, debt: true, paycheck: true });
    expect(applicability({})).toEqual({ homeEquity: true, debt: true, paycheck: true });
  });

  it('hides home equity for renters and people living with family', () => {
    expect(applicability({ housingSituation: 'rent' }).homeEquity).toBe(false);
    expect(applicability({ housingSituation: 'live_with_family' }).homeEquity).toBe(false);
    expect(applicability({ housingSituation: 'own_mortgage' }).homeEquity).toBe(true);
    expect(applicability({ housingSituation: 'own_outright' }).homeEquity).toBe(true);
  });

  it('hides debt rows only when the user said they have no debt', () => {
    expect(applicability({ debtTypes: ['none'] }).debt).toBe(false);
    expect(applicability({ debtTypes: ['student_loans'] }).debt).toBe(true);
    expect(applicability({ debtTypes: [] }).debt).toBe(true);
  });

  it('hides paycheck rows for people without a paycheck', () => {
    expect(applicability({ employmentStatus: 'retired' }).paycheck).toBe(false);
    expect(applicability({ employmentStatus: 'employed_full' }).paycheck).toBe(true);
  });
});
