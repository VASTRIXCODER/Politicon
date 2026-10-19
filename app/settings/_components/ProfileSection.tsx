'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Check, Info, RefreshCw, Save, Undo2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import Surface from '@/components/ui/Surface';
import { useToastClearance } from '@/components/ui/Toast';
import styles from '@/components/onboarding/onboarding.module.css';
import { householdFromProfile } from '@/lib/household';
import {
  AGE_RANGES, CONCERNS, DEBT_TYPES, DEPENDENT_AGE_BANDS, EDUCATION_LEVELS, EMPLOYMENT_STATUSES,
  FILING_STATUSES, HOME_VALUE_BANDS, HOUSING_SITUATIONS, INCOME_RANGES, INVESTMENT_TYPES, MAX_CONCERNS,
  MAX_DEPENDENTS, OCCUPATIONS, US_STATES, isHomeowner,
} from '@/lib/profileOptions';
import { cn } from '@/lib/utils';
import { ChoiceRadios, ChoiceToggles, Field, PREFER_NOT, StageIndex, StagePane } from './ProfileFields';
import { useUnsavedChanges } from './unsavedChanges';
import ProfileHousehold from './ProfileHousehold';
import {
  FIELD_LABELS, PROFILE_STAGES, fieldName, householdInput, missingFields, sameAnswers, stageFields, toggleDebt, togglePick,
  type ChoiceField, type ProfileDraft, type ProfileField, type ProfileStageId,
} from './ProfileModel';
import { SECTION_SCROLL_MARGIN } from './SettingsSection';

// The leave-page warning loads just after the page does (nothing is unsaved
// before the person changes something), so it stays out of the first load.
const LeaveGuard = dynamic(() => import('./LeaveGuard'), { ssr: false, loading: () => null });

/*
 * Settings → "Your household": the financial profile editor. Every answer
 * from onboarding, grouped in onboarding's four sections (Location, About
 * you, Finances, Household) as the same tactile tiles, beside the person's
 * household avatar redrawn live from the answers on screen.
 *
 * The page loads and saves: it passes the saved answers in (`profile`, from
 * draftFromRow), and `onSave` gets the answers on screen when Save is
 * pressed. The editor keeps its own draft, knows when it differs from what
 * was saved (the save bar then follows the screen, with a way back), and
 * takes the draft as saved once `onSave` resolves true. After a save or a
 * discard the bar stays where it is (so the button that has focus stays in
 * view) until the person moves on: focus leaves it, or they point, scroll or
 * touch elsewhere. While it follows the screen it's one of the bars the page
 * keeps keyboard focus clear of (viewportClearance.ts), and the page's toast
 * rises above it. While there are unsaved changes, leaving the page asks
 * first (LeaveGuard, which this section hosts for the whole page, loaded
 * just after it). No animation library: what moves here is CSS.
 */

export interface ProfileSectionProps {
  /**
   * The saved answers (draftFromRow of the user_profiles row). A profile
   * with different answers (a reload) becomes the saved state, and replaces
   * the screen's answers unless they hold unsaved changes.
   */
  profile: ProfileDraft;
  /** The page's save is in flight: the button reads "Saving…". */
  saving: boolean;
  /**
   * Save pressed, with the answers on screen. The page checks them
   * (parseProfileDraft), PUTs the profile to /api/profile and toasts the
   * outcome; it resolves true once saved. An incomplete profile is not
   * saved: the editor moves focus to the first missing answer as well.
   */
  onSave: (_draft: ProfileDraft) => Promise<boolean> | boolean;
  /** The section's id, for in-page links (default "profile"). */
  id?: string;
  /** The heading's id (it names the section, and takes focus when a link jumps here). */
  headingId?: string;
  /** Under the save bar, still in the section (the page's "Re-run Onboarding"). */
  footer?: ReactNode;
  /** The save bar starts or stops following the screen (the page gives phones more room while it does). */
  onStuckChange?: (_stuck: boolean) => void;
  className?: string;
}

const DEPENDENT_OPTIONS = [
  { value: 'no', label: 'No dependents' },
  { value: 'yes', label: 'I have dependents' },
] as const;

// The top count reads "10+", as in onboarding (and the caption's "ten or more").
const DEPENDENT_COUNTS = Array.from({ length: MAX_DEPENDENTS }, (_, i) => i + 1);

const HOME_VALUE_CHOICES = [...HOME_VALUE_BANDS, PREFER_NOT];
const INVESTMENT_CHOICES = [...INVESTMENT_TYPES, PREFER_NOT];

const PURPOSE: Record<ProfileStageId, string> = {
  location: 'Used to factor in state taxes, cost of living and regional policies',
  about: 'Helps calibrate tax brackets, credits and program eligibility',
  finances: 'Core data for tax liability, housing costs and the debts a policy can reach',
  household: 'Dependents, concerns and investments shape which policies most directly affect you',
};

// 16px on phones (app/globals.css), so iOS doesn't zoom into the field.
const INPUT = 'input-glass w-full rounded-tile px-4 py-3 text-sm sm:max-w-sm';

/** Space-separated ids (for aria-describedby), or undefined when there are none. */
const joinIds = (...list: (string | false | undefined)[]) => list.filter(Boolean).join(' ') || undefined;

export default function ProfileSection({ profile, saving, onSave, id = 'profile', headingId, footer, onStuckChange, className }: ProfileSectionProps) {
  // The answers last loaded, the answers saved (loaded, or saved from here since) and the answers on screen.
  const [loaded, setLoaded] = useState(profile);
  const [saved, setSaved] = useState(profile);
  const [draft, setDraft] = useState(profile);
  // Compared by answer, so a page that rebuilds the same profile on every render doesn't reset the form.
  if (!sameAnswers(loaded, profile)) {
    setLoaded(profile);
    setSaved(profile);
    if (sameAnswers(draft, saved)) setDraft(profile);
  }

  const uid = useId();
  const fid = {
    state: `${uid}-state`, city: `${uid}-city`, ageRange: `${uid}-age`, education: `${uid}-education`,
    employment: `${uid}-employment`, occupation: `${uid}-occupation`, occupationHint: `${uid}-occupation-hint`,
    income: `${uid}-income`, incomeHint: `${uid}-income-hint`, filing: `${uid}-filing`,
    housing: `${uid}-housing`, homeValue: `${uid}-home-value`, debts: `${uid}-debts`, dependents: `${uid}-dependents`,
    dependentsCount: `${uid}-dependents-count`, dependentAges: `${uid}-dependent-ages`, concerns: `${uid}-concerns`,
    concernsCount: `${uid}-concerns-count`, investments: `${uid}-investments`,
  };
  const titleId = headingId ?? `${uid}-title`;
  const neededId = (f: ProfileField) => `${uid}-${f}-needed`;

  const form = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  // A save is on its way (the page's `saving` arrives a render later).
  const inFlight = useRef(false);

  const missing = useMemo(() => missingFields(draft), [draft]);
  const needs = (f: ProfileField) => missing.includes(f);
  const missingIn = (s: ProfileStageId) => stageFields(s).filter(needs).length;
  /** A section's pane: named by its heading, with an id under the section's own for the index's links. */
  const pane = (s: ProfileStageId) => {
    const index = PROFILE_STAGES.findIndex((x) => x.id === s);
    return { id: `${id}-${s}`, index, title: PROFILE_STAGES[index].label, purpose: PURPOSE[s], missing: missingIn(s) };
  };
  const sectionLinks = PROFILE_STAGES.map((s) => ({ id: s.id, href: `#${id}-${s.id}`, label: s.label, missing: missingIn(s.id) }));
  const dirty = !sameAnswers(draft, saved);
  useUnsavedChanges(dirty);

  // The bar follows the screen while there are unsaved changes, and stays put
  // for a beat after a save or a discard, until the person moves on.
  const [held, setHeld] = useState(false);
  const stuck = dirty || held;
  useEffect(() => {
    if (!held) return;
    const el = bar.current;
    const elsewhere = (e: Event) => {
      if (!el?.contains(e.target as Node)) setHeld(false);
    };
    const focusLeft = (e: FocusEvent) => {
      if (!el?.contains(e.relatedTarget as Node | null)) setHeld(false);
    };
    document.addEventListener('pointerdown', elsewhere, true);
    window.addEventListener('wheel', elsewhere, { passive: true });
    window.addEventListener('touchmove', elsewhere, { passive: true });
    el?.addEventListener('focusout', focusLeft);
    return () => {
      document.removeEventListener('pointerdown', elsewhere, true);
      window.removeEventListener('wheel', elsewhere);
      window.removeEventListener('touchmove', elsewhere);
      el?.removeEventListener('focusout', focusLeft);
    };
  }, [held]);
  useToastClearance(bar, stuck);
  useEffect(() => {
    onStuckChange?.(stuck);
  }, [stuck, onStuckChange]);

  // The household on the plinth, from the answers on screen; only the answers it draws rebuild it.
  const { housingSituation, filingStatus, hasDependents, dependentsCount, dependentAgeBands, debtTypes, state } = draft;
  const household = useMemo(
    () => householdFromProfile(householdInput({ housingSituation, filingStatus, hasDependents, dependentsCount, dependentAgeBands, debtTypes, state })),
    [housingSituation, filingStatus, hasDependents, dependentsCount, dependentAgeBands, debtTypes, state],
  );

  const set = <K extends ProfileField>(key: K, value: ProfileDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  /** Brings a question into view and focuses its control (a group's current choice). */
  const focusField = (f: ProfileField) => {
    const control = form.current?.querySelector<HTMLElement>(
      `[data-field="${f}"] :is(select, input, [role="radio"][tabindex="0"], button[aria-pressed]:enabled)`,
    );
    if (!control) return;
    control.scrollIntoView({ block: 'center' });
    control.focus({ preventScroll: true });
  };

  const save = async () => {
    // Busy, not disabled, while saving: a disabled button would drop keyboard focus.
    if (saving || inFlight.current) return;
    inFlight.current = true;
    const answers = draft;
    const following = dirty;
    if (missing[0]) focusField(missing[0]);
    try {
      if (await onSave(answers)) {
        setSaved(answers);
        if (following) setHeld(true);
      }
    } finally {
      inFlight.current = false;
    }
  };

  const discard = () => {
    setDraft(saved);
    setHeld(true);
    // The discard button goes with the changes; focus stays in the bar, which stays in view.
    saveButton.current?.focus();
  };

  /** One answer's tiles (a radio group named by its label, described by its hint and "Needed" mark). */
  const radios = (field: ChoiceField, labelId: string, options: readonly { value: string; label: string }[], hintId?: string) => (
    <ChoiceRadios
      options={options}
      value={draft[field]}
      onChange={(v) => set(field, v)}
      labelledBy={labelId}
      describedBy={joinIds(needs(field) && neededId(field), hintId)}
    />
  );

  return (
    <section id={id} aria-labelledby={titleId} className={cn(SECTION_SCROLL_MARGIN, className)}>
      <PageHeader
        as="h2"
        eyebrow="Profile"
        // Focusable by script only (an in-page link moves focus here), never a Tab stop.
        title={<span id={titleId} tabIndex={-1} className="rounded-md">Your <em>household</em></span>}
        lede="Every estimate is built from these answers. Change one and your household redraws as you go; save, and your policy feed rebuilds from them."
      />

      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-8">
        {/* The form comes first in the page's order (and Tab order); the preview and index after it, though they show above it on narrower screens. */}
        <div ref={form} className="row-start-2 min-w-0 space-y-4 xl:col-start-1 xl:row-start-1">
          {/* A note, not a warning: violet ink, as on the detail page (caution is kept for answers that are missing). */}
          <div role="note" className="relative overflow-hidden rounded-tile border border-primary/25 bg-primary/[0.06] py-3.5 pl-5 pr-4">
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
            <p className="flex gap-3 text-sm leading-relaxed text-ink">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-300" aria-hidden="true" />
              <span>Changes here directly affect how the AI calculates your policy impact. Keep this accurate for best results.</span>
            </p>
          </div>

          <StagePane {...pane('location')}>
            <Field name="state" label={FIELD_LABELS.state} htmlFor={fid.state} needed={needs('state')} neededId={neededId('state')}>
              <select
                id={fid.state}
                value={draft.state}
                onChange={(e) => set('state', e.target.value)}
                autoComplete="address-level1"
                aria-describedby={joinIds(needs('state') && neededId('state'))}
                className={INPUT}
              >
                <option value="">Select…</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field name="city" label={FIELD_LABELS.city} htmlFor={fid.city}>
              <input
                id={fid.city}
                type="text"
                autoComplete="address-level2"
                maxLength={100}
                value={draft.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="e.g. Austin"
                className={INPUT}
              />
            </Field>
          </StagePane>

          <StagePane {...pane('about')}>
            <Field name="ageRange" label={FIELD_LABELS.ageRange} id={fid.ageRange} needed={needs('ageRange')} neededId={neededId('ageRange')}>
              {radios('ageRange', fid.ageRange, AGE_RANGES)}
            </Field>
            <Field name="educationStage" label={FIELD_LABELS.educationStage} id={fid.education} needed={needs('educationStage')} neededId={neededId('educationStage')}>
              {radios('educationStage', fid.education, EDUCATION_LEVELS)}
            </Field>
            <Field name="employmentStatus" label={FIELD_LABELS.employmentStatus} id={fid.employment} needed={needs('employmentStatus')} neededId={neededId('employmentStatus')}>
              {radios('employmentStatus', fid.employment, EMPLOYMENT_STATUSES)}
            </Field>
            <Field
              name="occupationCategory"
              label={FIELD_LABELS.occupationCategory}
              id={fid.occupation}
              needed={needs('occupationCategory')}
              neededId={neededId('occupationCategory')}
              hint="If you're not working, pick the field you last worked in, or “Not working right now”."
              hintId={fid.occupationHint}
            >
              {radios('occupationCategory', fid.occupation, OCCUPATIONS, fid.occupationHint)}
            </Field>
          </StagePane>

          <StagePane {...pane('finances')}>
            <Field
              name="incomeRange"
              label={FIELD_LABELS.incomeRange}
              id={fid.income}
              needed={needs('incomeRange')}
              neededId={neededId('incomeRange')}
              hint="We only ever use the range, never an exact number."
              hintId={fid.incomeHint}
            >
              {radios('incomeRange', fid.income, INCOME_RANGES, fid.incomeHint)}
            </Field>
            <Field name="filingStatus" label={FIELD_LABELS.filingStatus} id={fid.filing} needed={needs('filingStatus')} neededId={neededId('filingStatus')}>
              {radios('filingStatus', fid.filing, FILING_STATUSES)}
            </Field>
            <Field name="housingSituation" label={FIELD_LABELS.housingSituation} id={fid.housing} needed={needs('housingSituation')} neededId={neededId('housingSituation')}>
              {radios('housingSituation', fid.housing, HOUSING_SITUATIONS)}
            </Field>
            {isHomeowner(draft.housingSituation) && (
              <Field name="homeValueBand" label={FIELD_LABELS.homeValueBand} id={fid.homeValue} className={styles.enter}>
                {radios('homeValueBand', fid.homeValue, HOME_VALUE_CHOICES)}
              </Field>
            )}
            <Field name="debtTypes" label={FIELD_LABELS.debtTypes} id={fid.debts} needed={needs('debtTypes')} neededId={neededId('debtTypes')}>
              <ChoiceToggles
                options={DEBT_TYPES}
                selected={draft.debtTypes}
                // "No debt" is exclusive with every other choice.
                onToggle={(v) => setDraft((d) => ({ ...d, debtTypes: toggleDebt(d.debtTypes, v) }))}
                labelledBy={fid.debts}
                describedBy={joinIds(needs('debtTypes') && neededId('debtTypes'))}
              />
            </Field>
          </StagePane>

          <StagePane {...pane('household')}>
            <Field name="hasDependents" label={FIELD_LABELS.hasDependents} id={fid.dependents}>
              <ChoiceRadios
                options={DEPENDENT_OPTIONS}
                value={draft.hasDependents ? 'yes' : 'no'}
                onChange={(v) => set('hasDependents', v === 'yes')}
                labelledBy={fid.dependents}
              />
            </Field>
            {draft.hasDependents && (
              <>
                <Field name="dependentsCount" label={FIELD_LABELS.dependentsCount} htmlFor={fid.dependentsCount} className={styles.enter}>
                  <select
                    id={fid.dependentsCount}
                    value={String(draft.dependentsCount)}
                    onChange={(e) => set('dependentsCount', Number(e.target.value) || 1)}
                    className={cn(INPUT, 'sm:w-40')}
                  >
                    {DEPENDENT_COUNTS.map((n) => (
                      <option key={n} value={String(n)}>{n === MAX_DEPENDENTS ? `${n}+` : n}</option>
                    ))}
                  </select>
                </Field>
                <Field name="dependentAgeBands" label={FIELD_LABELS.dependentAgeBands} id={fid.dependentAges} className={styles.enter}>
                  <ChoiceToggles
                    options={DEPENDENT_AGE_BANDS}
                    selected={draft.dependentAgeBands}
                    onToggle={(v) => setDraft((d) => ({ ...d, dependentAgeBands: togglePick(d.dependentAgeBands, v) }))}
                    labelledBy={fid.dependentAges}
                  />
                </Field>
              </>
            )}
            <Field
              name="topFinancialConcerns"
              label={FIELD_LABELS.topFinancialConcerns}
              id={fid.concerns}
              needed={needs('topFinancialConcerns')}
              neededId={neededId('topFinancialConcerns')}
              meta={
                <span id={fid.concernsCount} className="font-mono-data text-meta text-muted">
                  {draft.topFinancialConcerns.length} of {MAX_CONCERNS} chosen
                </span>
              }
            >
              <ChoiceToggles
                options={CONCERNS}
                selected={draft.topFinancialConcerns}
                onToggle={(v) => setDraft((d) => ({ ...d, topFinancialConcerns: togglePick(d.topFinancialConcerns, v, MAX_CONCERNS) }))}
                labelledBy={fid.concerns}
                describedBy={joinIds(needs('topFinancialConcerns') && neededId('topFinancialConcerns'), fid.concernsCount)}
                max={MAX_CONCERNS}
              />
            </Field>
            <Field name="investments" label={FIELD_LABELS.investments} id={fid.investments}>
              {radios('investments', fid.investments, INVESTMENT_CHOICES)}
            </Field>
          </StagePane>

          {/* The save bar: it follows the screen while there are unsaved changes (glass: it's a toolbar). */}
          <Surface
            ref={bar}
            data-settings-overlay=""
            variant="glass"
            pad="none"
            className={cn('z-content flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5', stuck && 'sticky bottom-3 sm:bottom-4')}
          >
            <p className="mr-auto min-w-0 text-sm leading-snug">
              {missing.length > 0 && (
                <span className="font-medium text-caution">
                  {missing.length === 1 ? '1 answer needed' : `${missing.length} answers needed`}
                  <span className="font-normal text-muted">: {missing.map(fieldName).join(', ')}</span>
                </span>
              )}
              {/* Phones: "Unsaved changes" takes its own line, so no separator is left hanging. */}
              {missing.length > 0 && dirty && <span aria-hidden="true" className="text-muted max-sm:hidden"> · </span>}
              {dirty ? (
                <span className={cn('inline-flex items-center gap-2 text-ink', missing.length > 0 && 'max-sm:mt-1 max-sm:flex')}>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_rgb(var(--c-violet)/0.18)]" />
                  Unsaved changes
                </span>
              ) : (
                missing.length === 0 && (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <Check className="h-4 w-4" aria-hidden="true" /> No unsaved changes
                  </span>
                )
              )}
            </p>
            {/* When the bar wraps, the buttons keep to its right edge. */}
            <div className="ml-auto flex items-center gap-2 max-sm:w-full">
              {dirty && (
                <Button
                  variant="ghost"
                  onClick={discard}
                  aria-label="Discard changes"
                  icon={<Undo2 className="h-4 w-4" />}
                  magnetic={false}
                  className="flex-shrink-0 px-4 max-sm:px-3"
                >
                  <span className="hidden sm:inline">Discard changes</span>
                </Button>
              )}
              <Button
                ref={saveButton}
                onClick={() => void save()}
                aria-disabled={saving || undefined}
                aria-busy={saving || undefined}
                icon={saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                className="px-5 py-2.5 max-sm:flex-1"
              >
                {saving ? 'Saving…' : 'Save financial profile'}
              </Button>
            </div>
          </Surface>

          {footer}
          <LeaveGuard />
        </div>

        {/* Above the form on narrower screens; beside it on wide ones, staying in view while it scrolls. */}
        <div className="row-start-1 xl:sticky xl:top-28 xl:col-start-2 xl:row-start-1 xl:self-start">
          <ProfileHousehold model={household} />
          <StageIndex stages={sectionLinks} className="mt-4 hidden xl:block" />
        </div>
      </div>
    </section>
  );
}
