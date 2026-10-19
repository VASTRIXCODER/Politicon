import { describe, expect, it } from 'vitest';
import { EMPTY_HOUSEHOLD, MAX_FIGURES, TOP_DEPENDENTS_COUNT, describeHousehold, householdFromProfile, type HouseholdModel } from '@/lib/household';
import { householdLayout } from '@/components/three/kit/dioramaLayout';
import { DEBT_TYPES, DEPENDENT_AGE_BANDS, FILING_STATUSES, HOUSING_SITUATIONS, MAX_DEPENDENTS } from '@/lib/profileOptions';

// lib/household.ts: the profile → household model mapping the onboarding
// diorama, the avatar and the dashboard all draw from, and the sentence that
// describes it for screen readers and captions.

const model = (p: Parameters<typeof householdFromProfile>[0]) => householdFromProfile(p);

describe('householdFromProfile: nothing answered', () => {
  it('is the empty household for no profile at all', () => {
    expect(householdFromProfile(null)).toBe(EMPTY_HOUSEHOLD);
    expect(householdFromProfile(undefined)).toBe(EMPTY_HOUSEHOLD);
  });

  it('leaves every piece out for an empty profile', () => {
    expect(model({})).toEqual(EMPTY_HOUSEHOLD);
    expect(model({ housingSituation: '', filingStatus: '', state: '', debtTypes: [], dependentAgeBands: [] })).toEqual(EMPTY_HOUSEHOLD);
    expect(model({ housingSituation: null, filingStatus: null, state: null, debtTypes: null, dependentAgeBands: null })).toEqual(EMPTY_HOUSEHOLD);
  });

  it('keeps the empty household frozen, so nobody can change it by accident', () => {
    expect(Object.isFrozen(EMPTY_HOUSEHOLD)).toBe(true);
    expect(EMPTY_HOUSEHOLD).toEqual({ dwelling: null, owns: false, adults: 1, figures: 0, dependentsCount: 0, youngDependents: false, agesKnown: false, mixedAges: false, props: [], state: null });
  });
});

describe('householdFromProfile: housing', () => {
  const cases: [string, HouseholdModel['dwelling'], boolean][] = [
    ['rent', 'apartment', false],
    ['rent_assisted', 'apartment', false],
    ['own_mortgage', 'house', true],
    ['own_outright', 'house', true],
    ['live_with_family', 'family-home', false],
    ['campus', 'campus', false],
    ['other', 'cottage', false],
  ];

  it.each(cases)('%s → %s (owns: %s)', (housing, dwelling, owns) => {
    const m = model({ housingSituation: housing as never });
    expect(m.dwelling).toBe(dwelling);
    expect(m.owns).toBe(owns);
  });

  it('covers every housing answer the profile can hold', () => {
    expect(cases.map(([h]) => h).sort()).toEqual(HOUSING_SITUATIONS.map((o) => o.value).sort());
  });

  it('draws no building for a value outside the vocabulary', () => {
    expect(model({ housingSituation: 'castle' as never }).dwelling).toBeNull();
    expect(model({ housingSituation: 'castle' as never }).owns).toBe(false);
  });

  it('draws no building for a value that is an Object.prototype key', () => {
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      const m = model({ housingSituation: key as never });
      expect(m.dwelling).toBeNull();
      expect(() => describeHousehold(m)).not.toThrow();
    }
  });

  it('puts a key on the plinth for a mortgage, from the housing answer alone', () => {
    expect(model({ housingSituation: 'own_mortgage' }).props).toEqual(['mortgage-key']);
    expect(model({ housingSituation: 'own_outright' }).props).toEqual([]);
  });
});

describe('householdFromProfile: filing status', () => {
  it.each(FILING_STATUSES.map((o) => o.value))('%s', (status) => {
    const married = status === 'married_joint' || status === 'married_separate';
    expect(model({ filingStatus: status }).adults).toBe(married ? 2 : 1);
  });

  it('is one grown-up until the question is answered', () => {
    expect(model({}).adults).toBe(1);
    expect(model({ filingStatus: '' }).adults).toBe(1);
  });
});

describe('householdFromProfile: dependents', () => {
  it('counts the dependents and draws up to MAX_FIGURES of them', () => {
    for (let n = 0; n <= MAX_DEPENDENTS; n++) {
      const m = model({ hasDependents: n > 0, dependentsCount: n, dependentAgeBands: ['under_5'] });
      expect(m.dependentsCount).toBe(n);
      expect(m.figures).toBe(Math.min(MAX_FIGURES, n));
    }
    expect(MAX_FIGURES).toBe(4);
  });

  it('draws nobody when the person said they have no dependents, whatever the count says', () => {
    const m = model({ hasDependents: false, dependentsCount: 3, dependentAgeBands: ['5_12'] });
    expect(m).toMatchObject({ dependentsCount: 0, figures: 0, youngDependents: false });
  });

  it('trusts the stored count when the yes/no is not given (a saved profile row)', () => {
    expect(model({ dependentsCount: 2, dependentAgeBands: ['13_17'] })).toMatchObject({ dependentsCount: 2, figures: 2, youngDependents: true });
  });

  it('never counts below zero or in fractions, and treats junk as none', () => {
    expect(model({ hasDependents: true, dependentsCount: -3 }).dependentsCount).toBe(0);
    expect(model({ hasDependents: true, dependentsCount: 2.7 }).dependentsCount).toBe(2);
    expect(model({ hasDependents: true, dependentsCount: Number.NaN }).dependentsCount).toBe(0);
    expect(model({ hasDependents: true, dependentsCount: null }).dependentsCount).toBe(0);
  });

  it.each(DEPENDENT_AGE_BANDS.map((o) => o.value))('an age band of %s', (band) => {
    expect(model({ hasDependents: true, dependentsCount: 1, dependentAgeBands: [band] }).youngDependents).toBe(band !== '18_plus');
  });

  it('draws children only when every dependent is under 18', () => {
    expect(model({ hasDependents: true, dependentsCount: 2, dependentAgeBands: ['under_5', '13_17'] })).toMatchObject({ youngDependents: true, agesKnown: true, mixedAges: false });
    expect(model({ hasDependents: true, dependentsCount: 2, dependentAgeBands: ['18_plus'] })).toMatchObject({ youngDependents: false, agesKnown: true, mixedAges: false });
  });

  it('claims no one age for dependents of mixed ages (minors and grown-ups)', () => {
    const m = model({ housingSituation: 'rent', filingStatus: 'single', hasDependents: true, dependentsCount: 2, dependentAgeBands: ['under_5', '18_plus'], state: 'Ohio' });
    expect(m).toMatchObject({ youngDependents: false, agesKnown: false, mixedAges: true });
    expect(describeHousehold(m)).toBe('A rented apartment with one adult and two dependents of mixed ages, in Ohio.');
    // Every dependent is drawn at the neutral height: neither a child nor a grown-up is claimed.
    expect(householdLayout(m).figures.filter((f) => !f.adult).map((f) => f.id)).toEqual(['dependent-1:dependent', 'dependent-2:dependent']);
    // One dependent with bands that disagree: just "a dependent".
    expect(describeHousehold(model({ housingSituation: 'rent', hasDependents: true, dependentsCount: 1, dependentAgeBands: ['5_12', '18_plus'] }))).toBe(
      'A rented apartment with one adult and one dependent.',
    );
  });

  it('has no young dependents without any dependents', () => {
    expect(model({ hasDependents: false, dependentsCount: 0, dependentAgeBands: ['under_5'] }).youngDependents).toBe(false);
  });

  it('does not guess the ages of dependents when none were given', () => {
    const m = model({ housingSituation: 'rent', hasDependents: true, dependentsCount: 2, dependentAgeBands: [] });
    expect(m).toMatchObject({ dependentsCount: 2, figures: 2, youngDependents: false, agesKnown: false });
    expect(describeHousehold(m)).toBe('A rented apartment with one adult and two dependents.');
    expect(describeHousehold(model({ housingSituation: 'rent', hasDependents: true, dependentsCount: 1 }))).toBe(
      'A rented apartment with one adult and one dependent.',
    );
    expect(model({ hasDependents: true, dependentsCount: 1, dependentAgeBands: ['18_plus'] }).agesKnown).toBe(true);
  });
});

describe('householdFromProfile: debts', () => {
  const props: Record<string, string | undefined> = {
    mortgage: 'mortgage-key',
    student_loans: 'grad-cap',
    auto_loan: 'car',
    credit_card: 'card',
    medical: 'medical',
    personal_loan: 'ledger',
    business_loan: 'briefcase',
    none: undefined,
  };

  it.each(DEBT_TYPES.map((o) => o.value))('%s', (debt) => {
    const expected = props[debt];
    expect(model({ debtTypes: [debt] }).props).toEqual(expected ? [expected] : []);
  });

  it('covers every debt answer the profile can hold', () => {
    expect(Object.keys(props).sort()).toEqual(DEBT_TYPES.map((o) => o.value).sort());
  });

  it('lists each object once, in a fixed order, whatever order the answers came in', () => {
    const all = ['business_loan', 'medical', 'auto_loan', 'personal_loan', 'credit_card', 'student_loans', 'mortgage'];
    const order = ['mortgage-key', 'grad-cap', 'car', 'card', 'medical', 'ledger', 'briefcase'];
    expect(model({ debtTypes: all }).props).toEqual(order);
    expect(model({ debtTypes: [...all].reverse() }).props).toEqual(order);
    // A mortgage from both the housing answer and the debts is one key.
    expect(model({ housingSituation: 'own_mortgage', debtTypes: ['mortgage', 'mortgage'] }).props).toEqual(['mortgage-key']);
  });

  it('ignores answers outside the vocabulary', () => {
    expect(model({ debtTypes: ['yacht', 'none', ''] }).props).toEqual([]);
  });
});

describe('householdFromProfile: state', () => {
  it('keeps the state name, trimmed', () => {
    expect(model({ state: 'Ohio' }).state).toBe('Ohio');
    expect(model({ state: '  New Mexico ' }).state).toBe('New Mexico');
  });

  it('has no state for a blank answer', () => {
    expect(model({ state: '   ' }).state).toBeNull();
    expect(model({ state: '' }).state).toBeNull();
  });
});

describe('describeHousehold', () => {
  it('says the plinth is empty when nothing is answered', () => {
    expect(describeHousehold(EMPTY_HOUSEHOLD)).toBe('An empty plinth, waiting for your answers.');
    // Grown-ups alone (the filing answer) don't fill the plinth yet.
    expect(describeHousehold(model({ filingStatus: 'married_joint' }))).toBe('An empty plinth, waiting for your answers.');
  });

  it('names each kind of home', () => {
    const say = (housing: string) => describeHousehold(model({ housingSituation: housing as never }));
    expect(say('rent')).toBe('A rented apartment with one adult.');
    expect(say('rent_assisted')).toBe('A rented apartment with one adult.');
    expect(say('own_mortgage')).toBe('An owned house with one adult, with a mortgage.');
    expect(say('own_outright')).toBe('An owned house with one adult.');
    expect(say('live_with_family')).toBe('A family home with one adult.');
    expect(say('campus')).toBe('Campus housing with one adult.');
    expect(say('other')).toBe('A home with one adult.');
  });

  it('says "a household" until the housing question is answered', () => {
    expect(describeHousehold(model({ state: 'Ohio' }))).toBe('A household with one adult, in Ohio.');
  });

  it('counts the grown-ups and the dependents, in words', () => {
    expect(describeHousehold(model({ filingStatus: 'married_joint', housingSituation: 'rent' }))).toBe('A rented apartment with two adults.');
    expect(describeHousehold(model({ housingSituation: 'rent', hasDependents: true, dependentsCount: 1, dependentAgeBands: ['5_12'] }))).toBe(
      'A rented apartment with one adult and one child.'
    );
    expect(describeHousehold(model({ housingSituation: 'rent', hasDependents: true, dependentsCount: 3, dependentAgeBands: ['5_12'] }))).toBe(
      'A rented apartment with one adult and three children.'
    );
    expect(describeHousehold(model({ housingSituation: 'rent', hasDependents: true, dependentsCount: 1, dependentAgeBands: ['18_plus'] }))).toBe(
      'A rented apartment with one adult and one adult dependent.'
    );
    expect(describeHousehold(model({ housingSituation: 'rent', hasDependents: true, dependentsCount: 2, dependentAgeBands: ['18_plus'] }))).toBe(
      'A rented apartment with one adult and two adult dependents.'
    );
  });

  it('says the real count even beyond the figures drawn', () => {
    const m = model({ housingSituation: 'own_outright', hasDependents: true, dependentsCount: 7, dependentAgeBands: ['under_5'] });
    expect(m.figures).toBe(MAX_FIGURES);
    expect(describeHousehold(m)).toBe('An owned house with one adult and seven children.');
  });

  it('reads the form\'s top count as "or more", as the form shows it ("10+")', () => {
    expect(TOP_DEPENDENTS_COUNT).toBe(MAX_DEPENDENTS);
    const m = model({ housingSituation: 'rent', hasDependents: true, dependentsCount: MAX_DEPENDENTS, dependentAgeBands: ['5_12'] });
    expect(describeHousehold(m)).toBe('A rented apartment with one adult and ten or more children.');
  });

  it('names the District of Columbia with its article', () => {
    expect(describeHousehold(model({ housingSituation: 'rent', state: 'District of Columbia' }))).toBe(
      'A rented apartment with one adult, in the District of Columbia.',
    );
  });

  it('lists the debts in plain words, joined with commas and "and"', () => {
    const say = (debts: string[]) => describeHousehold(model({ housingSituation: 'rent', debtTypes: debts }));
    expect(say(['student_loans'])).toBe('A rented apartment with one adult, with student loans.');
    expect(say(['student_loans', 'auto_loan'])).toBe('A rented apartment with one adult, with student loans and an auto loan.');
    expect(say(['credit_card', 'medical', 'personal_loan', 'business_loan'])).toBe(
      'A rented apartment with one adult, with credit card debt, medical debt, a personal loan and a business loan.'
    );
    expect(say(['none'])).toBe('A rented apartment with one adult.');
  });

  it('reads as one sentence for a whole household', () => {
    const m = model({
      state: 'Ohio',
      housingSituation: 'rent',
      filingStatus: 'married_joint',
      hasDependents: true,
      dependentsCount: 1,
      dependentAgeBands: ['under_5'],
      debtTypes: ['student_loans', 'auto_loan'],
    });
    expect(describeHousehold(m)).toBe('A rented apartment with two adults and one child, with student loans and an auto loan, in Ohio.');
  });

  it('never mentions money amounts, only kinds', () => {
    const m = model({ housingSituation: 'own_mortgage', debtTypes: DEBT_TYPES.map((o) => o.value) });
    expect(describeHousehold(m)).not.toMatch(/\$|\d{2,}/);
  });
});
