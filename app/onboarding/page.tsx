'use client';

import { useState, useEffect, useCallback, useRef, useId, createContext, useContext } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, Check, MapPin, User, Briefcase, Home } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api';
import AmbientBackground from '@/components/landing/AmbientBackground';
import FullPageLoader from '@/components/auth/FullPageLoader';
import Button from '@/components/ui/Button';
import Logo from '@/components/ui/Logo';
import RadioCards from '@/components/forms/RadioGroup';
import {
  AGE_RANGES, CONCERNS, DEBT_TYPES, DEPENDENT_AGE_BANDS, EDUCATION_LEVELS, EMPLOYMENT_STATUSES,
  FILING_STATUSES, HOME_VALUE_BANDS, HOUSING_SITUATIONS, INCOME_RANGES, INVESTMENT_TYPES, MAX_CONCERNS,
  MAX_DEPENDENTS, OCCUPATIONS, US_STATES, isHomeowner, validOnly as keepAll, validOrEmpty as keep,
} from '@/lib/profileOptions';
import { FinancialProfileSchema } from '@/lib/profileSchema';
import { afterOnboardingPath } from '@/lib/safeNext';

interface Draft {
  state: string;
  city: string;
  ageRange: string;
  educationStage: string;
  employmentStatus: string;
  occupationCategory: string;
  incomeRange: string;
  filingStatus: string;
  housingSituation: string;
  homeValueBand: string;
  debtTypes: string[];
  hasDependents: boolean | null;
  dependentsCount: number;
  dependentAgeBands: string[];
  topFinancialConcerns: string[];
  investments: string;
}

const EMPTY: Draft = {
  state: '', city: '', ageRange: '', educationStage: '', employmentStatus: '', occupationCategory: '',
  incomeRange: '', filingStatus: '', housingSituation: '', homeValueBand: '', debtTypes: [],
  hasDependents: null, dependentsCount: 1, dependentAgeBands: [], topFinancialConcerns: [], investments: '',
};

const STAGES = [
  { label: 'Location', icon: MapPin, steps: [0, 1] },
  { label: 'About you', icon: User, steps: [2, 3, 4, 5] },
  { label: 'Finances', icon: Briefcase, steps: [6, 7, 8, 9] },
  { label: 'Household', icon: Home, steps: [10, 11, 12] },
];
const TOTAL_STEPS = 13;

const draftKey = (userId: string) => `politicon:onboarding-draft:${userId}`;

type Option = { value: string; label: string };

const YES_NO: readonly Option[] = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

/** The current question's heading and hint, so its controls can point at them. */
const QuestionContext = createContext<{ titleId?: string; hintId?: string }>({});
/** True once the user has moved between steps; each new question then takes focus. */
const StepFocusContext = createContext(false);

/** Single-answer cards, named by the current question unless told otherwise. */
function RadioGroup({ labelledBy, describedBy, ...props }: {
  options: readonly Option[]; value: string; onChange: (_v: string) => void; allowDeselect?: boolean;
  labelledBy?: string; describedBy?: string; className?: string;
}) {
  const { titleId, hintId } = useContext(QuestionContext);
  return (
    <RadioCards
      {...props}
      labelledBy={labelledBy ?? titleId}
      describedBy={describedBy ?? hintId}
      optionClassName={selected => `w-full px-5 py-4 rounded-2xl border text-sm ${
        selected ? 'bg-primary/15 border-primary/40 text-text-primary' : 'glass backdrop-filter-none border-white/10 text-text-muted hover:text-text-primary hover:border-white/20'
      }`}
      renderOption={(o, selected) => (
        <span className="flex items-center justify-between gap-3">
          <span>{o.label}</span>
          {selected && <Check className="w-4 h-4 text-primary-300 flex-shrink-0" aria-hidden="true" />}
        </span>
      )}
    />
  );
}

/** One choice in a pick-several group: a toggle button (aria-pressed). */
function MultiOptionButton({ label, selected, disabled, onClick }: { label: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} disabled={disabled} className={`text-left px-4 py-3 rounded-xl border text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
      selected ? 'bg-primary/15 border-primary/40 text-text-primary' : 'glass backdrop-filter-none border-white/10 text-text-muted hover:text-text-primary hover:border-white/20'
    }`}>
      <div className="flex items-center gap-2">
        <div aria-hidden="true" className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
          selected ? 'bg-primary border-primary' : 'border-white/20'
        }`}>{selected && <Check className="w-2.5 h-2.5 text-white" />}</div>
        <span>{label}</span>
      </div>
    </button>
  );
}

/** A labelled group of toggle buttons (pick several). */
function MultiGroup({ labelledBy, describedBy, className, children }: {
  labelledBy?: string; describedBy?: string; className?: string; children: React.ReactNode;
}) {
  const { titleId, hintId } = useContext(QuestionContext);
  return (
    <div role="group" aria-labelledby={labelledBy ?? titleId} aria-describedby={describedBy ?? hintId} className={className}>
      {children}
    </div>
  );
}

/** The optional city field, described by its question's hint. */
function CityInput({ id, value, onChange }: { id: string; value: string; onChange: (_v: string) => void }) {
  const { hintId } = useContext(QuestionContext);
  return (
    <input id={id} type="text" maxLength={100} placeholder="e.g. Columbus, Cook County…" value={value}
      onChange={e => onChange(e.target.value)} aria-describedby={hintId} autoComplete="address-level2"
      className="input-glass w-full px-4 py-4 text-sm" autoFocus />
  );
}

/**
 * One onboarding step. The heading names the step's controls; with `fieldId`
 * it is also the <label> of that single field.
 */
function Question({ title, hint, fieldId, children }: { title: string; hint?: string; fieldId?: string; children: React.ReactNode }) {
  const id = useId();
  const titleId = `${id}-title`;
  const hintId = hint ? `${id}-hint` : undefined;
  const boxRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Read once: a question that is already leaving must not grab focus back.
  const focusOnMount = useRef(useContext(StepFocusContext));

  // After Continue/Back, move focus to the new question so it is read out,
  // unless one of its fields already took focus (autoFocus).
  useEffect(() => {
    if (focusOnMount.current && !boxRef.current?.contains(document.activeElement)) titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <QuestionContext.Provider value={{ titleId, hintId }}>
      <m.div ref={boxRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.25 }}>
        <h1 ref={titleRef} id={titleId} tabIndex={-1} className={`font-display text-2xl sm:text-3xl font-bold text-text-primary outline-none ${hint ? 'mb-2' : 'mb-8'}`}>
          {fieldId ? <label htmlFor={fieldId}>{title}</label> : title}
        </h1>
        {hint && <p id={hintId} className="text-sm text-text-muted mb-6">{hint}</p>}
        {children}
      </m.div>
    </QuestionContext.Provider>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Draft>(EMPTY);
  const [showDone, setShowDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Drafts are only written once the user has actually changed an answer.
  const dirty = useRef(false);
  const [navigated, setNavigated] = useState(false);
  const fid = useId();
  const ids = {
    state: `${fid}-state`, city: `${fid}-city`, homeValue: `${fid}-home-value`, homeValueHint: `${fid}-home-value-hint`,
    dependentsCount: `${fid}-dependents-count`, dependentAges: `${fid}-dependent-ages`, dependentAgesHint: `${fid}-dependent-ages-hint`,
    saveError: `${fid}-save-error`,
  };

  // Load the session, then prefill from a saved draft or the existing profile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth/signin?next=/onboarding'); return; }

      let next: Draft = EMPTY;
      const { data: row } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
      if (row) {
        next = {
          state: US_STATES.includes(row.state) ? row.state : '',
          city: row.city || '',
          ageRange: keep(AGE_RANGES, row.age_range),
          educationStage: keep(EDUCATION_LEVELS, row.education_stage),
          employmentStatus: keep(EMPLOYMENT_STATUSES, row.employment_status),
          occupationCategory: keep(OCCUPATIONS, row.occupation_category),
          incomeRange: keep(INCOME_RANGES, row.income_range),
          filingStatus: keep(FILING_STATUSES, row.filing_status),
          housingSituation: keep(HOUSING_SITUATIONS, row.housing_situation),
          homeValueBand: keep(HOME_VALUE_BANDS, row.home_value_band),
          debtTypes: keepAll(DEBT_TYPES, row.debt_types),
          hasDependents: row.dependents_count === null || row.dependents_count === undefined ? null : row.dependents_count > 0,
          dependentsCount: row.dependents_count > 0 ? row.dependents_count : 1,
          dependentAgeBands: keepAll(DEPENDENT_AGE_BANDS, row.dependent_age_bands),
          topFinancialConcerns: keepAll(CONCERNS, row.top_financial_concerns).slice(0, MAX_CONCERNS),
          investments: keep(INVESTMENT_TYPES, row.investments),
        };
      }
      try {
        const saved = localStorage.getItem(draftKey(user.id));
        if (saved) {
          const draft = JSON.parse(saved) as { savedAt?: string; answers?: Partial<Draft> };
          // A profile saved since the draft (e.g. from Settings) wins over the draft.
          const serverNewer = row?.financial_updated_at && draft.savedAt && new Date(row.financial_updated_at) > new Date(draft.savedAt);
          if (draft.answers && !serverNewer) next = { ...next, ...draft.answers };
          if (serverNewer) localStorage.removeItem(draftKey(user.id));
        }
      } catch { /* storage unavailable or corrupt draft */ }

      if (cancelled) return;
      setUserId(user.id);
      setP(next);
    })();
    return () => { cancelled = true; };
  }, [router, supabase]);

  // Save a draft after every change so a refresh doesn't lose answers.
  useEffect(() => {
    if (!userId || !dirty.current) return;
    try {
      localStorage.setItem(draftKey(userId), JSON.stringify({ savedAt: new Date().toISOString(), answers: p }));
    } catch { /* storage unavailable */ }
  }, [p, userId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    dirty.current = true;
    setP(prev => ({ ...prev, [key]: value }));
  };

  const toggle = (key: 'debtTypes' | 'topFinancialConcerns' | 'dependentAgeBands', value: string) => {
    dirty.current = true;
    setP(prev => {
      const list = prev[key];
      if (list.includes(value)) return { ...prev, [key]: list.filter(v => v !== value) };
      if (key === 'debtTypes') {
        // "No debt" is exclusive with every other choice.
        return { ...prev, debtTypes: value === 'none' ? ['none'] : [...list.filter(v => v !== 'none'), value] };
      }
      if (key === 'topFinancialConcerns' && list.length >= MAX_CONCERNS) return prev;
      return { ...prev, [key]: [...list, value] };
    });
  };

  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 0: return !!p.state;
      case 1: return true; // city is optional
      case 2: return !!p.ageRange;
      case 3: return !!p.educationStage;
      case 4: return !!p.employmentStatus;
      case 5: return !!p.occupationCategory;
      case 6: return !!p.incomeRange;
      case 7: return !!p.filingStatus;
      case 8: return !!p.housingSituation;
      case 9: return p.debtTypes.length > 0;
      case 10: return p.hasDependents === false || (p.hasDependents === true && p.dependentsCount > 0);
      case 11: return p.topFinancialConcerns.length > 0;
      default: return true; // optional final step
    }
  }, [step, p]);

  const handleComplete = async () => {
    setSaveError('');
    const parsed = FinancialProfileSchema.safeParse({
      state: p.state,
      city: p.city,
      ageRange: p.ageRange,
      educationStage: p.educationStage,
      employmentStatus: p.employmentStatus,
      occupationCategory: p.occupationCategory,
      incomeRange: p.incomeRange,
      filingStatus: p.filingStatus,
      housingSituation: p.housingSituation,
      debtTypes: p.debtTypes,
      hasDependents: !!p.hasDependents,
      dependentsCount: p.hasDependents ? p.dependentsCount : 0,
      dependentAgeBands: p.hasDependents ? p.dependentAgeBands : [],
      topFinancialConcerns: p.topFinancialConcerns,
      investments: p.investments || null,
      homeValueBand: isHomeowner(p.housingSituation) && p.homeValueBand ? p.homeValueBand : null,
    });
    if (!parsed.success) {
      setSaveError('Some answers are missing. Please go back and check each step.');
      return;
    }
    setSaving(true);
    const res = await apiFetch('/api/profile', { method: 'PUT', body: { profile: parsed.data } });
    if (!res.ok) {
      setSaveError(res.status === 401 ? 'Your session expired. Please sign in again.' : res.message);
      setSaving(false);
      return;
    }
    try { if (userId) localStorage.removeItem(draftKey(userId)); } catch { /* storage unavailable */ }
    setShowDone(true);
    // Back to where they were heading (e.g. a question for the AI Policy Guide), else the dashboard.
    const after = afterOnboardingPath(new URLSearchParams(window.location.search).get('next')) || '/dashboard';
    setTimeout(() => router.push(after), 1600);
  };

  const next = () => {
    if (!canAdvance()) return;
    if (step < TOTAL_STEPS - 1) { setNavigated(true); setStep(s => s + 1); }
    else handleComplete();
  };

  const back = () => {
    setNavigated(true);
    setStep(s => Math.max(0, s - 1));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault();
      next();
    }
  };

  const questions = [
    <Question key="state" title="What state do you live in?" fieldId={ids.state}>
      <select id={ids.state} value={p.state} onChange={e => set('state', e.target.value)} autoComplete="address-level1"
        className="input-glass w-full px-4 py-4 text-sm">
        <option value="">Select your state…</option>
        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </Question>,

    <Question key="city" title="What city or county?" hint="Optional. Helps with local taxes and cost of living." fieldId={ids.city}>
      <CityInput id={ids.city} value={p.city} onChange={v => set('city', v)} />
    </Question>,

    <Question key="age" title="Which age range are you in?">
      <RadioGroup options={AGE_RANGES} value={p.ageRange} onChange={v => set('ageRange', v)} className="grid grid-cols-2 sm:grid-cols-3 gap-3" />
    </Question>,

    <Question key="edu" title="Highest education completed?">
      <RadioGroup options={EDUCATION_LEVELS} value={p.educationStage} onChange={v => set('educationStage', v)} className="space-y-2" />
    </Question>,

    <Question key="emp" title="What's your work situation?">
      <RadioGroup options={EMPLOYMENT_STATUSES} value={p.employmentStatus} onChange={v => set('employmentStatus', v)} className="grid grid-cols-1 sm:grid-cols-2 gap-3" />
    </Question>,

    <Question key="occ" title="What field do you work in?" hint="If you're not working, pick the field you last worked in, or “Not working right now”.">
      <RadioGroup options={OCCUPATIONS} value={p.occupationCategory} onChange={v => set('occupationCategory', v)} className="grid grid-cols-1 sm:grid-cols-2 gap-3" />
    </Question>,

    <Question key="income" title="Approximate household income?" hint="We only ever use the range, never an exact number.">
      <RadioGroup options={INCOME_RANGES} value={p.incomeRange} onChange={v => set('incomeRange', v)} className="space-y-2" />
    </Question>,

    <Question key="filing" title="How do you file taxes?">
      <RadioGroup options={FILING_STATUSES} value={p.filingStatus} onChange={v => set('filingStatus', v)} className="space-y-2" />
    </Question>,

    <Question key="housing" title="What's your housing situation?">
      <RadioGroup options={HOUSING_SITUATIONS} value={p.housingSituation} onChange={v => set('housingSituation', v)} className="grid grid-cols-1 sm:grid-cols-2 gap-3" />
      {isHomeowner(p.housingSituation) && (
        <div className="mt-8">
          <p id={ids.homeValue} className="text-sm font-medium text-text-primary mb-1">Roughly what is your home worth?</p>
          <p id={ids.homeValueHint} className="text-xs text-text-muted mb-3">Optional. Used for property-value effects.</p>
          <RadioGroup options={HOME_VALUE_BANDS} value={p.homeValueBand} onChange={v => set('homeValueBand', v)} allowDeselect
            labelledBy={ids.homeValue} describedBy={ids.homeValueHint} className="grid grid-cols-2 gap-3" />
        </div>
      )}
    </Question>,

    <Question key="debts" title="What kinds of debt do you have?" hint="Select all that apply.">
      <MultiGroup className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DEBT_TYPES.map(o => <MultiOptionButton key={o.value} label={o.label} selected={p.debtTypes.includes(o.value)} onClick={() => toggle('debtTypes', o.value)} />)}
      </MultiGroup>
    </Question>,

    <Question key="dependents" title="Do you have children or other dependents?" hint="Dependents change tax credits, childcare and education costs.">
      <RadioGroup options={YES_NO} value={p.hasDependents === null ? '' : p.hasDependents ? 'yes' : 'no'}
        onChange={v => set('hasDependents', v === 'yes')} className="grid grid-cols-2 gap-3" />
      {p.hasDependents && (
        <div className="mt-8 space-y-6">
          <div>
            <label htmlFor={ids.dependentsCount} className="block text-sm font-medium text-text-primary mb-2">How many?</label>
            <select id={ids.dependentsCount} value={p.dependentsCount} onChange={e => set('dependentsCount', Number(e.target.value))}
              className="input-glass w-full sm:w-40 px-4 py-3 text-sm">
              {Array.from({ length: MAX_DEPENDENTS }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}{n === MAX_DEPENDENTS ? '+' : ''}</option>)}
            </select>
          </div>
          <div>
            <p id={ids.dependentAges} className="text-sm font-medium text-text-primary mb-1">Their ages</p>
            <p id={ids.dependentAgesHint} className="text-xs text-text-muted mb-3">Optional. Select all that apply.</p>
            <MultiGroup labelledBy={ids.dependentAges} describedBy={ids.dependentAgesHint} className="grid grid-cols-2 gap-3">
              {DEPENDENT_AGE_BANDS.map(o => <MultiOptionButton key={o.value} label={o.label} selected={p.dependentAgeBands.includes(o.value)} onClick={() => toggle('dependentAgeBands', o.value)} />)}
            </MultiGroup>
          </div>
        </div>
      )}
    </Question>,

    <Question key="concerns" title="What are your top financial concerns?" hint={`Pick up to ${MAX_CONCERNS}.`}>
      <MultiGroup className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CONCERNS.map(o => {
          const selected = p.topFinancialConcerns.includes(o.value);
          return (
            <MultiOptionButton key={o.value} label={o.label} selected={selected}
              disabled={!selected && p.topFinancialConcerns.length >= MAX_CONCERNS}
              onClick={() => toggle('topFinancialConcerns', o.value)} />
          );
        })}
      </MultiGroup>
    </Question>,

    <Question key="investments" title="Do you have investments?" hint="Optional. Helps estimate how market moves affect you. You can skip this.">
      <RadioGroup options={INVESTMENT_TYPES} value={p.investments} onChange={v => set('investments', v)} allowDeselect className="space-y-2" />
    </Question>,
  ];

  if (!userId) return <FullPageLoader label="Loading your profile…" />;

  const currentStage = STAGES.findIndex(s => s.steps.includes(step));
  const progress = ((step + 1) / TOTAL_STEPS) * 100;
  const isLast = step === TOTAL_STEPS - 1;

  return (
    <div className="min-h-screen relative flex flex-col" onKeyDown={onKeyDown}>
      <AmbientBackground />
      <main id="main" tabIndex={-1} className="relative z-10 flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-8">
        <Logo href={null} className="mb-10 flex" />

        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <ol aria-label="Sections" className="flex items-center gap-3 sm:gap-4">
              {STAGES.map((stage, i) => {
                const Icon = stage.icon;
                const isActive = i === currentStage;
                const isDone = i < currentStage;
                return (
                  <li key={stage.label} className="flex items-center gap-2" aria-current={isActive ? 'step' : undefined}>
                    <div aria-hidden="true" className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all ${
                      isDone ? 'bg-primary border-primary' : isActive ? 'border-primary bg-primary/20' : 'border-white/20 bg-white/5'
                    }`}>
                      {isDone ? <Check className="w-3.5 h-3.5 text-white" /> : <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary-300' : 'text-text-muted'}`} />}
                    </div>
                    <span className={`text-xs font-medium sr-only sm:not-sr-only ${isActive ? 'text-text-primary' : isDone ? 'text-primary-300' : 'text-text-muted'}`}>
                      {stage.label}
                      <span className="sr-only">{isDone ? ' (done)' : isActive ? ' (current)' : ''}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <span className="text-xs text-text-muted font-mono-data" aria-hidden="true">Step {step + 1} of {TOTAL_STEPS}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden" role="progressbar" aria-label="Profile setup progress"
            aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${TOTAL_STEPS}`}>
            <m.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
          </div>
        </div>

        <div className="flex-1">
          <StepFocusContext.Provider value={navigated}>
            <AnimatePresence mode="wait">{questions[step]}</AnimatePresence>
          </StepFocusContext.Provider>
        </div>

        <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/10">
          <button type="button" onClick={back} disabled={step === 0}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded-lg">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Back
          </button>
          <Button onClick={next} disabled={!canAdvance() || saving} icon={<ChevronRight className="w-4 h-4" />} iconPosition="end"
            aria-describedby={saveError ? ids.saveError : undefined}>
            {isLast ? (saving ? 'Saving…' : p.investments ? 'See my impact' : 'Skip and see my impact') : step === 1 && !p.city ? 'Skip' : 'Continue'}
          </Button>
        </div>
        {saveError && <p id={ids.saveError} role="alert" className="mt-4 text-sm text-red-400 text-center">{saveError}</p>}
      </main>

      <AnimatePresence>
        {showDone && (
          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm px-4" role="status">
            <m.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="glass-strong rounded-3xl p-10 sm:p-12 text-center">
              <div aria-hidden="true" className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-5">
                <Check className="w-7 h-7 text-primary" />
              </div>
              <h2 className="font-display text-3xl font-bold text-text-primary mb-2">Profile saved</h2>
              <p className="text-text-muted">Building your personalized policy feed…</p>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
