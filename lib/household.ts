/**
 * A person's household as a small 3D model: the onboarding diorama ("Build
 * your household") and the avatar the app shows afterwards both draw from
 * this. Pure and three-free, so the DOM side (posters, captions) and the
 * WebGL side read the same description.
 *
 * Only the profile's own ranges and categories go in; nothing here is
 * guessed. A field that hasn't been answered yet leaves its piece out, so
 * the model grows as onboarding goes.
 */
import type { DebtType, DependentAgeBand, FilingStatus, HousingSituation } from '@/lib/profileOptions';

/** The building, from the housing answer. */
export type Dwelling = 'apartment' | 'house' | 'family-home' | 'campus' | 'cottage';

/** Small objects on the plinth, one per kind of debt (and the home loan). */
export type HouseholdProp = 'mortgage-key' | 'grad-cap' | 'car' | 'card' | 'medical' | 'ledger' | 'briefcase';

export interface HouseholdModel {
  /** null until the housing step is answered. */
  dwelling: Dwelling | null;
  /** Owns the home (with or without a mortgage). */
  owns: boolean;
  /** Grown-ups filing together: 2 for married filers, else 1. */
  adults: 1 | 2;
  /** Dependents drawn as figures (capped at MAX_FIGURES; the real count is in `dependentsCount`). */
  figures: number;
  dependentsCount: number;
  /** Every dependent is under 18, by the age bands given (drawn and described as children). */
  youngDependents: boolean;
  /**
   * Whether the age bands say one thing for every dependent: all under 18,
   * or all 18 and over. Without that (no band given, or a mix of the two,
   * whose split the bands can't tell) nothing is said or drawn about any one
   * dependent's age ("dependents", figures of a middle height), rather than
   * calling a grown-up a child or a child a grown-up.
   */
  agesKnown: boolean;
  /** The bands name both minors and grown-ups (said as "of mixed ages"; drawn like unknown ages). */
  mixedAges: boolean;
  props: HouseholdProp[];
  /** Full state name from the profile, or null. */
  state: string | null;
}

/** Most dependent figures drawn on the plinth; more are summarised in the caption. */
export const MAX_FIGURES = 4;

export interface HouseholdInput {
  housingSituation?: HousingSituation | '' | null;
  filingStatus?: FilingStatus | '' | null;
  hasDependents?: boolean | null;
  dependentsCount?: number | null;
  dependentAgeBands?: readonly (DependentAgeBand | string)[] | null;
  debtTypes?: readonly (DebtType | string)[] | null;
  state?: string | null;
}

const DWELLING: Record<HousingSituation, Dwelling> = {
  rent: 'apartment',
  rent_assisted: 'apartment',
  own_mortgage: 'house',
  own_outright: 'house',
  live_with_family: 'family-home',
  campus: 'campus',
  other: 'cottage',
};

const PROP_FOR_DEBT: Partial<Record<DebtType, HouseholdProp>> = {
  mortgage: 'mortgage-key',
  student_loans: 'grad-cap',
  auto_loan: 'car',
  credit_card: 'card',
  medical: 'medical',
  personal_loan: 'ledger',
  business_loan: 'briefcase',
};

const PROP_ORDER: HouseholdProp[] = ['mortgage-key', 'grad-cap', 'car', 'card', 'medical', 'ledger', 'briefcase'];

export const EMPTY_HOUSEHOLD: HouseholdModel = Object.freeze({
  dwelling: null,
  owns: false,
  adults: 1,
  figures: 0,
  dependentsCount: 0,
  youngDependents: false,
  agesKnown: false,
  mixedAges: false,
  props: [],
  state: null,
}) as HouseholdModel;

export function householdFromProfile(p: HouseholdInput | null | undefined): HouseholdModel {
  if (!p) return EMPTY_HOUSEHOLD;
  // Own keys only: `in` would also match Object.prototype's ('toString').
  const housing =
    typeof p.housingSituation === 'string' && Object.prototype.hasOwnProperty.call(DWELLING, p.housingSituation)
      ? (p.housingSituation as HousingSituation)
      : null;
  const owns = housing === 'own_mortgage' || housing === 'own_outright';
  const married = p.filingStatus === 'married_joint' || p.filingStatus === 'married_separate';
  const count = p.hasDependents === false ? 0 : Math.max(0, Math.floor(Number(p.dependentsCount) || 0));
  const bands = count > 0 ? (p.dependentAgeBands ?? []).filter((b): b is string => typeof b === 'string' && b.length > 0) : [];
  const minors = bands.some((b) => b !== '18_plus');
  const grown = bands.includes('18_plus');
  const props = new Set<HouseholdProp>();
  if (housing === 'own_mortgage') props.add('mortgage-key');
  for (const d of p.debtTypes ?? []) {
    const prop = PROP_FOR_DEBT[d as DebtType];
    if (prop) props.add(prop);
  }
  return {
    dwelling: housing ? DWELLING[housing] : null,
    owns,
    adults: married ? 2 : 1,
    figures: Math.min(MAX_FIGURES, count),
    dependentsCount: count,
    youngDependents: minors && !grown,
    agesKnown: minors !== grown,
    mixedAges: minors && grown,
    props: PROP_ORDER.filter((x) => props.has(x)),
    state: p.state?.trim() || null,
  };
}

const DWELLING_WORDS: Record<Dwelling, string> = {
  apartment: 'an apartment',
  house: 'a house',
  'family-home': 'a family home',
  campus: 'campus housing',
  cottage: 'a home',
};

const PROP_WORDS: Record<HouseholdProp, string> = {
  'mortgage-key': 'a mortgage',
  'grad-cap': 'student loans',
  car: 'an auto loan',
  card: 'credit card debt',
  medical: 'medical debt',
  ledger: 'a personal loan',
  briefcase: 'a business loan',
};

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/**
 * The form's top dependents count (MAX_DEPENDENTS in lib/profileOptions,
 * not imported to keep this module light; tests/household.test.ts keeps
 * them equal), which it shows as "10+".
 */
export const TOP_DEPENDENTS_COUNT = 10;
const countWords = (n: number) =>
  n >= TOP_DEPENDENTS_COUNT ? `${NUMBER_WORDS[TOP_DEPENDENTS_COUNT]} or more` : NUMBER_WORDS[n] ?? String(n);

/** "the District of Columbia"; every state reads as itself. */
const placeName = (state: string) => (/^district of columbia$/i.test(state) ? 'the District of Columbia' : state);

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * The model in one plain sentence, for screen readers and captions:
 * "A rented apartment with two adults and one child, with student loans and an auto loan, in Ohio."
 */
export function describeHousehold(m: HouseholdModel): string {
  if (!m.dwelling && m.dependentsCount === 0 && m.props.length === 0 && !m.state) return 'An empty plinth, waiting for your answers.';
  const place = m.dwelling
    ? `${m.dwelling === 'apartment' && !m.owns ? 'A rented apartment' : m.owns && m.dwelling === 'house' ? 'An owned house' : DWELLING_WORDS[m.dwelling].replace(/^./, (c) => c.toUpperCase())}`
    : 'A household';
  const people = [m.adults === 2 ? 'two adults' : 'one adult'];
  if (m.dependentsCount > 0) {
    const one = m.dependentsCount === 1;
    // Only what was said: children or grown-up dependents when the ages say so for all of them, else just "dependents".
    const noun = !m.agesKnown
      ? one ? 'dependent' : m.mixedAges ? 'dependents of mixed ages' : 'dependents'
      : m.youngDependents
        ? one ? 'child' : 'children'
        : one ? 'adult dependent' : 'adult dependents';
    people.push(`${countWords(m.dependentsCount)} ${noun}`);
  }
  const debts = m.props.map((p) => PROP_WORDS[p] ?? '').filter(Boolean);
  return `${place} with ${list(people)}${debts.length ? `, with ${list(debts)}` : ''}${m.state ? `, in ${placeName(m.state)}` : ''}.`;
}
