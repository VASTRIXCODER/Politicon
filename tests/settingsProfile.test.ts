import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ProfileSection, { type ProfileSectionProps } from '@/app/settings/_components/ProfileSection';
import {
  EMPTY_PROFILE_DRAFT,
  FIELD_LABELS,
  PROFILE_STAGES,
  draftFromRow,
  fieldName,
  householdInput,
  missingFields,
  parseProfileDraft,
  profileInput,
  sameAnswers,
  stageFields,
  toggleDebt,
  togglePick,
  type ProfileDraft,
  type ProfileField,
} from '@/app/settings/_components/ProfileModel';
import { describeHousehold, householdFromProfile } from '@/lib/household';
import { MAX_CONCERNS, MAX_DEPENDENTS } from '@/lib/profileOptions';

// Settings → "Your household" (app/settings/_components/Profile*): the
// financial profile editor. The answers it reads from the saved row, what a
// save sends, when it has unsaved changes, and the markup the server sends.

const ROW = {
  id: 'user-1',
  first_name: 'Avery',
  state: 'Ohio',
  city: 'Columbus',
  age_range: '35_44',
  education_stage: 'college_4yr',
  employment_status: 'employed_full',
  occupation_category: 'healthcare',
  income_range: '75k_100k',
  filing_status: 'married_joint',
  housing_situation: 'own_mortgage',
  home_value_band: '200k_400k',
  debt_types: ['mortgage', 'student_loans'],
  has_dependents: true,
  dependents_count: 2,
  dependent_age_bands: ['5_12'],
  top_financial_concerns: ['childcare', 'taxes'],
  investments: 'retirement_only',
};

const COMPLETE: ProfileDraft = draftFromRow(ROW);

const render = (over: Partial<ProfileSectionProps> = {}) =>
  renderToString(h(ProfileSection, { profile: COMPLETE, saving: false, onSave: () => true, ...over }));

/** The values of `name` on every element that has it. */
const attrs = (html: string, name: string) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]);
const idsIn = (html: string) => new Set(attrs(html, 'id'));
/** Text with tags stripped and React's entities decoded, for reading copy. */
const text = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('draftFromRow', () => {
  it('reads every answer of a current profile as it was saved', () => {
    expect(COMPLETE).toEqual({
      state: 'Ohio', city: 'Columbus', ageRange: '35_44', educationStage: 'college_4yr', employmentStatus: 'employed_full',
      occupationCategory: 'healthcare', incomeRange: '75k_100k', filingStatus: 'married_joint', housingSituation: 'own_mortgage',
      homeValueBand: '200k_400k', debtTypes: ['mortgage', 'student_loans'], hasDependents: true, dependentsCount: 2,
      dependentAgeBands: ['5_12'], topFinancialConcerns: ['childcare', 'taxes'], investments: 'retirement_only',
    });
  });

  it('starts blank without a row', () => {
    expect(draftFromRow(null)).toEqual(EMPTY_PROFILE_DRAFT);
    expect(draftFromRow(undefined)).toEqual(EMPTY_PROFILE_DRAFT);
  });

  it('leaves codes outside the current vocabulary blank, so they get picked again', () => {
    const d = draftFromRow({
      ...ROW, state: 'Ohio ', age_range: '23_30', income_range: 'over_250k', housing_situation: 'own',
      debt_types: ['auto_loans', 'credit_card'], top_financial_concerns: ['taxes', 'healthcare', 'inflation', 'savings', 'retirement'],
      dependent_age_bands: ['teen', '13_17'], investments: 'crypto', city: null,
    });
    expect(d).toMatchObject({ state: '', ageRange: '', incomeRange: '', housingSituation: '', investments: '', city: '' });
    expect(d.debtTypes).toEqual(['credit_card']);
    expect(d.dependentAgeBands).toEqual(['13_17']);
    // The current codes only, then at most MAX_CONCERNS of them, the first ones kept.
    expect(d.topFinancialConcerns).toEqual(['taxes', 'inflation', 'savings']);
    expect(MAX_CONCERNS).toBe(3);
  });

  it('reads a pick stored twice (a hand-edited or legacy row) once, so the profile is complete and saves', () => {
    const d = draftFromRow({
      ...ROW, debt_types: ['mortgage', 'mortgage', 'student_loans'], top_financial_concerns: ['taxes', 'taxes', 'childcare', 'taxes', 'inflation'],
      dependent_age_bands: ['5_12', '5_12'],
    });
    expect(d.debtTypes).toEqual(['mortgage', 'student_loans']);
    // De-duplicated before the limit, so a repeat doesn't use up a place.
    expect(d.topFinancialConcerns).toEqual(['taxes', 'childcare', 'inflation']);
    expect(d.dependentAgeBands).toEqual(['5_12']);
    expect(missingFields(d)).toEqual([]);
    expect(parseProfileDraft(d).success).toBe(true);
  });

  it('reads the dependents as Settings always has: the count, else the old yes/no as one', () => {
    expect(draftFromRow({ ...ROW, dependents_count: null, has_dependents: true })).toMatchObject({ hasDependents: true, dependentsCount: 1 });
    expect(draftFromRow({ ...ROW, dependents_count: null, has_dependents: false })).toMatchObject({ hasDependents: false, dependentsCount: 1 });
    expect(draftFromRow({ ...ROW, dependents_count: 0, has_dependents: true })).toMatchObject({ hasDependents: false, dependentsCount: 1 });
    expect(draftFromRow({ ...ROW, dependents_count: 4 })).toMatchObject({ hasDependents: true, dependentsCount: 4 });
    // More than the form offers reads as its top choice, which the schema accepts.
    expect(draftFromRow({ ...ROW, dependents_count: 25 })).toMatchObject({ hasDependents: true, dependentsCount: MAX_DEPENDENTS });
  });
});

describe('what a save sends', () => {
  it('parses a complete profile with the schema /api/profile uses', () => {
    const parsed = parseProfileDraft(COMPLETE);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ state: 'Ohio', dependentsCount: 2, homeValueBand: '200k_400k', investments: 'retirement_only' });
  });

  it('sends the dependents only with dependents, the home value only for a homeowner, and blanks as null', () => {
    const p = profileInput({ ...COMPLETE, hasDependents: false, housingSituation: 'rent', investments: '' });
    expect(p).toMatchObject({ hasDependents: false, dependentsCount: 0, dependentAgeBands: [], homeValueBand: null, investments: null });
    expect(profileInput({ ...COMPLETE, homeValueBand: '' }).homeValueBand).toBeNull();
    expect(parseProfileDraft({ ...COMPLETE, hasDependents: false, housingSituation: 'rent', investments: '' }).success).toBe(true);
  });

  it('names the missing answers in the order of the form', () => {
    expect(missingFields(COMPLETE)).toEqual([]);
    const blank = { ...COMPLETE, topFinancialConcerns: [], ageRange: '', state: '', debtTypes: [] };
    expect(missingFields(blank)).toEqual(['state', 'ageRange', 'debtTypes', 'topFinancialConcerns']);
    expect(parseProfileDraft(blank).success).toBe(false);
    // Optional answers are never missing.
    expect(missingFields({ ...COMPLETE, city: '', investments: '', homeValueBand: '', dependentAgeBands: [] })).toEqual([]);
    expect(missingFields(EMPTY_PROFILE_DRAFT)).toEqual([
      'state', 'ageRange', 'educationStage', 'employmentStatus', 'occupationCategory', 'incomeRange', 'filingStatus',
      'housingSituation', 'debtTypes', 'topFinancialConcerns',
    ]);
  });

  it('never calls a draft complete that the schema refuses: a pick made twice points at its list', () => {
    // The schema's "Duplicate selections." names no answer; the list with the repeat is flagged instead.
    const twiceDebt = { ...COMPLETE, debtTypes: ['mortgage', 'mortgage'] };
    expect(parseProfileDraft(twiceDebt).success).toBe(false);
    expect(missingFields(twiceDebt)).toEqual(['debtTypes']);
    const twiceConcern = { ...COMPLETE, topFinancialConcerns: ['taxes', 'taxes'] };
    expect(parseProfileDraft(twiceConcern).success).toBe(false);
    expect(missingFields(twiceConcern)).toEqual(['topFinancialConcerns']);
    // Both at once, in form order. (With an answer missing, the schema names that first; the repeats once it's answered.)
    const twiceBoth = { ...twiceDebt, topFinancialConcerns: ['taxes', 'taxes'] };
    expect(missingFields(twiceBoth)).toEqual(['debtTypes', 'topFinancialConcerns']);
    expect(missingFields({ ...twiceBoth, ageRange: '' })).toEqual(['ageRange']);
  });

  it('lists a missing answer by its label without the note', () => {
    expect(fieldName('debtTypes')).toBe('Debt Types');
    expect(fieldName('topFinancialConcerns')).toBe('Top Financial Concerns');
    expect(fieldName('ageRange')).toBe('Age Range');
  });
});

describe('unsaved changes (sameAnswers)', () => {
  it('sees a changed answer', () => {
    expect(sameAnswers(COMPLETE, { ...COMPLETE })).toBe(true);
    expect(sameAnswers(COMPLETE, { ...COMPLETE, incomeRange: '100k_150k' })).toBe(false);
    expect(sameAnswers(COMPLETE, { ...COMPLETE, debtTypes: ['mortgage'] })).toBe(false);
    expect(sameAnswers(COMPLETE, { ...COMPLETE, hasDependents: false })).toBe(false);
  });

  it('ignores what a save would not send: the order of picks, spaces around the city, hidden answers', () => {
    expect(sameAnswers(COMPLETE, { ...COMPLETE, debtTypes: ['student_loans', 'mortgage'], topFinancialConcerns: ['taxes', 'childcare'] })).toBe(true);
    expect(sameAnswers(COMPLETE, { ...COMPLETE, city: '  Columbus ' })).toBe(true);
    const noKids = { ...COMPLETE, hasDependents: false };
    expect(sameAnswers(noKids, { ...noKids, dependentsCount: 5, dependentAgeBands: ['under_5'] })).toBe(true);
    const renter = { ...COMPLETE, housingSituation: 'rent' };
    expect(sameAnswers(renter, { ...renter, homeValueBand: '750k_plus' })).toBe(true);
  });
});

describe('picking several', () => {
  it('keeps "No debt" on its own', () => {
    expect(toggleDebt(['mortgage', 'credit_card'], 'none')).toEqual(['none']);
    expect(toggleDebt(['none'], 'auto_loan')).toEqual(['auto_loan']);
    expect(toggleDebt(['mortgage'], 'auto_loan')).toEqual(['mortgage', 'auto_loan']);
    expect(toggleDebt(['mortgage', 'auto_loan'], 'mortgage')).toEqual(['auto_loan']);
    expect(toggleDebt(['none'], 'none')).toEqual([]);
  });

  it(`stops at the limit (${MAX_CONCERNS} concerns) and always allows unpicking`, () => {
    const full = ['taxes', 'inflation', 'savings'];
    expect(togglePick(full, 'childcare', MAX_CONCERNS)).toEqual(full);
    expect(togglePick(full, 'inflation', MAX_CONCERNS)).toEqual(['taxes', 'savings']);
    expect(togglePick(['5_12'], 'under_5')).toEqual(['5_12', 'under_5']);
  });
});

describe('the four sections', () => {
  it('hold every answer once, in onboarding’s sections and order', () => {
    const all = PROFILE_STAGES.flatMap((s) => s.fields);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual((Object.keys(EMPTY_PROFILE_DRAFT) as ProfileField[]).sort());
    expect(PROFILE_STAGES.map((s) => s.label)).toEqual(['Location', 'About you', 'Finances', 'Household']);
    expect(stageFields('location')).toEqual(['state', 'city']);
    expect(stageFields('about')).toEqual(['ageRange', 'educationStage', 'employmentStatus', 'occupationCategory']);
    expect(stageFields('finances')).toEqual(['incomeRange', 'filingStatus', 'housingSituation', 'homeValueBand', 'debtTypes']);
    expect(stageFields('household')).toEqual(['hasDependents', 'dependentsCount', 'dependentAgeBands', 'topFinancialConcerns', 'investments']);
  });
});

describe('the household it draws', () => {
  it('follows the answers on screen, counting dependents only once there are some', () => {
    expect(describeHousehold(householdFromProfile(householdInput(COMPLETE)))).toBe(
      'An owned house with two adults and two children, with a mortgage and student loans, in Ohio.'
    );
    const alone = householdFromProfile(householdInput({ ...COMPLETE, hasDependents: false, filingStatus: 'single', debtTypes: ['none'] }));
    expect(alone).toMatchObject({ adults: 1, dependentsCount: 0, figures: 0, agesKnown: false, props: ['mortgage-key'] });
  });
});

describe('ProfileSection on the server', () => {
  it('shows every answer’s label, the accuracy note and the save button', () => {
    const html = render();
    const copy = text(html);
    for (const field of Object.keys(FIELD_LABELS) as ProfileField[]) {
      expect(copy, field).toContain(FIELD_LABELS[field]);
    }
    expect(copy).toContain('Changes here directly affect how the AI calculates your policy impact. Keep this accurate for best results.');
    // The h2 names the section, and can take focus when a link jumps to it (never a Tab stop).
    const [, headingId] = html.match(/<h2[^>]*><span id="([^"]+)" tabindex="-1"[^>]*>Your <em>household<\/em><\/span><\/h2>/) ?? [];
    expect(headingId).toBeTruthy();
    expect(html).toMatch(new RegExp(`^<section id="profile" aria-labelledby="${headingId}"`));
    expect(render({ headingId: 'settings-profile-title' })).toMatch(/^<section id="profile" aria-labelledby="settings-profile-title"/);
    expect(copy).toContain('Save Financial Profile');
    // The four sections, as h3s.
    for (const label of ['Location', 'About you', 'Finances', 'Household']) expect(html).toMatch(new RegExp(`<h3[^>]*>${label}</h3>`));
  });

  it('names every group and labels every control', () => {
    const html = render();
    const ids = idsIn(html);
    const labelled = attrs(html, 'aria-labelledby');
    expect(labelled.length).toBeGreaterThanOrEqual(13);
    for (const ref of labelled) expect(ids, ref).toContain(ref);
    for (const ref of attrs(html, 'aria-describedby').flatMap((v) => v.split(' '))) expect(ids, ref).toContain(ref);
    for (const target of attrs(html, 'for')) expect(ids, target).toContain(target);
    // Pick one: radio groups of tiles; pick several: toggle buttons.
    expect((html.match(/role="radiogroup"/g) ?? []).length).toBe(10);
    expect((html.match(/role="group"/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-checked="true"');
  });

  it('links each section from the index beside the form', () => {
    const html = render({ id: 'profile' });
    const ids = idsIn(html);
    const links = [...html.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1]);
    expect(links).toEqual(['profile-location', 'profile-about', 'profile-finances', 'profile-household']);
    for (const target of links) expect(ids, target).toContain(target);
    expect(html).toMatch(/<nav aria-label="Profile sections"/);
    expect(html).toMatch(/^<section id="profile"/);
  });

  it('asks the follow-up questions only when they apply', () => {
    const owner = text(render());
    expect(owner).toContain(FIELD_LABELS.homeValueBand);
    expect(owner).toContain(FIELD_LABELS.dependentsCount);
    const renterNoKids = text(render({ profile: { ...COMPLETE, housingSituation: 'rent', hasDependents: false } }));
    expect(renterNoKids).not.toContain(FIELD_LABELS.homeValueBand);
    expect(renterNoKids).not.toContain(FIELD_LABELS.dependentsCount);
    expect(renterNoKids).not.toContain(FIELD_LABELS.dependentAgeBands);
  });

  it('offers "Prefer not to say" for the optional choices, chosen when they are blank', () => {
    const html = render({ profile: { ...COMPLETE, investments: '', homeValueBand: '' } });
    const preferNot = [...html.matchAll(/<button[^>]*role="radio"[^>]*aria-checked="(true|false)"[^>]*>(?:(?!<\/button>).)*Prefer not to say/g)];
    // Tax filing's own "Prefer not to say" (a stored code, not chosen here), then the home value's and investments' blank.
    expect(preferNot.map((m) => m[1])).toEqual(['false', 'true', 'true']);
  });

  it('offers the dependents count up to "10+", as onboarding does', () => {
    const html = render();
    expect(html).toContain(`<option value="${MAX_DEPENDENTS}">${MAX_DEPENDENTS}+</option>`);
    expect(html).toMatch(/<option value="2" selected="">2<\/option>/);
  });

  it('marks the answers still needed, and says so in its section and the save bar', () => {
    const html = render({ profile: { ...COMPLETE, ageRange: '', topFinancialConcerns: [] } });
    const copy = text(html);
    expect((copy.match(/Needed before you can save/g) ?? []).length).toBe(2);
    expect(copy).toMatch(/2 answers needed\s*: Age Range, Top Financial Concerns/);
    expect(copy).toMatch(/About you\s+1 needed/);
    expect(copy).toMatch(/Location\s+Complete/);
  });

  it('starts with no unsaved changes, and shows "Saving…" while the page saves', () => {
    const idle = text(render());
    expect(idle).toContain('No unsaved changes');
    expect(idle).not.toContain('Discard changes');
    const busy = render({ saving: true });
    expect(text(busy)).toContain('Saving…');
    // Busy, not disabled: a disabled button would drop keyboard focus mid-save.
    const [saveButton] = busy.match(/<button[^>]*aria-busy="true"[^>]*>/) ?? [];
    expect(saveButton).toMatch(/aria-disabled="true"/);
    expect(saveButton).not.toMatch(/\sdisabled=""/);
  });

  it('keeps the page’s footer (Re-run Onboarding) inside the section, after the save bar', () => {
    const html = render({ footer: h('h3', { id: 'rerun' }, 'Re-run Onboarding') });
    const save = html.indexOf('Save Financial Profile');
    const footer = html.indexOf('<h3 id="rerun">');
    expect(save).toBeGreaterThan(0);
    expect(footer).toBeGreaterThan(save);
    expect(html.lastIndexOf('</section>')).toBeGreaterThan(footer);
    expect(text(render())).not.toContain('Re-run Onboarding');
  });

  it('captions the household in a polite live region, the only place screen readers hear it', () => {
    const html = render();
    expect(html).toMatch(/<p aria-live="polite"[^>]*>.*An owned house with two adults and two children/);
    // The drawing is hidden from them (the caption says what it shows), so the sentence isn't heard twice.
    expect(html).toMatch(/<div aria-hidden="true" data-decorative=""[^>]*>/);
    expect(html).not.toMatch(/aria-label="Your household: /);
  });

  it('comes first in the page order, the preview and the section index after it', () => {
    const html = render();
    const form = html.indexOf('Save Financial Profile');
    expect(form).toBeGreaterThan(0);
    expect(html.indexOf('<nav aria-label="Profile sections"')).toBeGreaterThan(form);
    expect(html.indexOf('aria-live="polite"')).toBeGreaterThan(form);
  });

  it('keeps the four sections out of the landmarks (the h3s give the structure)', () => {
    const html = render();
    expect((html.match(/<section/g) ?? []).length).toBe(5);
    expect((html.match(/<section[^>]*aria-labelledby/g) ?? []).length).toBe(1);
  });

  it('keeps a choice visible in forced colours, which drop its light and its mark’s fill', () => {
    const html = render();
    const chosen = html.match(/<button[^>]*(?:aria-checked|aria-pressed)="true"[^>]*>/g) ?? [];
    expect(chosen.length).toBeGreaterThan(0);
    for (const tile of chosen) expect(tile).toContain('forced-colors:border-[color:Highlight]');
    const unchosen = html.match(/<button[^>]*role="radio"[^>]*aria-checked="false"[^>]*>/g) ?? [];
    for (const tile of unchosen) expect(tile).not.toContain('forced-colors:border-[color:Highlight]');
    expect(html).toContain('forced-colors:flex');
  });

  it('stays light: no animation library in the editor', () => {
    for (const file of ['ProfileSection.tsx', 'ProfileFields.tsx', 'ProfileHousehold.tsx', 'ProfileModel.ts']) {
      const source = readFileSync(join(process.cwd(), 'app/settings/_components', file), 'utf8');
      expect(source, file).not.toMatch(/from ['"](motion|framer-motion)(\/react)?['"]/);
    }
  });
});
