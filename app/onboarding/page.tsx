'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, Check, Zap, MapPin, User, Briefcase, Home } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api';
import AmbientBackground from '@/components/landing/AmbientBackground';
import {
  AGE_RANGES, CONCERNS, DEBT_TYPES, DEPENDENT_AGE_BANDS, EDUCATION_LEVELS, EMPLOYMENT_STATUSES,
  FILING_STATUSES, HOME_VALUE_BANDS, HOUSING_SITUATIONS, INCOME_RANGES, INVESTMENT_TYPES, MAX_CONCERNS,
  MAX_DEPENDENTS, OCCUPATIONS, US_STATES, isHomeowner, validOnly as keepAll, validOrEmpty as keep,
} from '@/lib/profileOptions';
import { FinancialProfileSchema } from '@/lib/profileSchema';

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

function OptionButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={`w-full text-left px-5 py-4 rounded-2xl border text-sm transition-all ${
      selected ? 'bg-primary/15 border-primary/40 text-text-primary' : 'glass border-white/10 text-text-muted hover:text-text-primary hover:border-white/20'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {selected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
      </div>
    </button>
  );
}

function MultiOptionButton({ label, selected, disabled, onClick }: { label: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} disabled={disabled} className={`text-left px-4 py-3 rounded-xl border text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
      selected ? 'bg-primary/15 border-primary/40 text-text-primary' : 'glass border-white/10 text-text-muted hover:text-text-primary hover:border-white/20'
    }`}>
      <div className="flex items-center gap-2">
        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
          selected ? 'bg-primary border-primary' : 'border-white/20'
        }`}>{selected && <Check className="w-2.5 h-2.5 text-white" />}</div>
        <span>{label}</span>
      </div>
    </button>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.25 }}>
      <h1 className={`font-display text-2xl sm:text-3xl font-bold text-text-primary ${hint ? 'mb-2' : 'mb-8'}`}>{title}</h1>
      {hint && <p className="text-sm text-text-muted mb-6">{hint}</p>}
      {children}
    </motion.div>
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
    setTimeout(() => router.push('/dashboard'), 1600);
  };

  const next = () => {
    if (!canAdvance()) return;
    if (step < TOTAL_STEPS - 1) setStep(s => s + 1);
    else handleComplete();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault();
      next();
    }
  };

  const questions = [
    <Question key="state" title="What state do you live in?">
      <label htmlFor="state" className="sr-only">State</label>
      <select id="state" value={p.state} onChange={e => set('state', e.target.value)} className="input-glass w-full px-4 py-4 text-base sm:text-sm">
        <option value="">Select your state…</option>
        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </Question>,

    <Question key="city" title="What city or county?" hint="Optional. Helps with local taxes and cost of living.">
      <label htmlFor="city" className="sr-only">City or county</label>
      <input id="city" type="text" maxLength={100} placeholder="e.g. Columbus, Cook County…" value={p.city}
        onChange={e => set('city', e.target.value)} className="input-glass w-full px-4 py-4 text-base sm:text-sm" autoFocus />
    </Question>,

    <Question key="age" title="Which age range are you in?">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {AGE_RANGES.map(o => <OptionButton key={o.value} label={o.label} selected={p.ageRange === o.value} onClick={() => set('ageRange', o.value)} />)}
      </div>
    </Question>,

    <Question key="edu" title="Highest education completed?">
      <div className="space-y-2">
        {EDUCATION_LEVELS.map(o => <OptionButton key={o.value} label={o.label} selected={p.educationStage === o.value} onClick={() => set('educationStage', o.value)} />)}
      </div>
    </Question>,

    <Question key="emp" title="What's your work situation?">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {EMPLOYMENT_STATUSES.map(o => <OptionButton key={o.value} label={o.label} selected={p.employmentStatus === o.value} onClick={() => set('employmentStatus', o.value)} />)}
      </div>
    </Question>,

    <Question key="occ" title="What field do you work in?" hint="If you're not working, pick the field you last worked in, or “Not working right now”.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OCCUPATIONS.map(o => <OptionButton key={o.value} label={o.label} selected={p.occupationCategory === o.value} onClick={() => set('occupationCategory', o.value)} />)}
      </div>
    </Question>,

    <Question key="income" title="Approximate household income?" hint="We only ever use the range, never an exact number.">
      <div className="space-y-2">
        {INCOME_RANGES.map(o => <OptionButton key={o.value} label={o.label} selected={p.incomeRange === o.value} onClick={() => set('incomeRange', o.value)} />)}
      </div>
    </Question>,

    <Question key="filing" title="How do you file taxes?">
      <div className="space-y-2">
        {FILING_STATUSES.map(o => <OptionButton key={o.value} label={o.label} selected={p.filingStatus === o.value} onClick={() => set('filingStatus', o.value)} />)}
      </div>
    </Question>,

    <Question key="housing" title="What's your housing situation?">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {HOUSING_SITUATIONS.map(o => <OptionButton key={o.value} label={o.label} selected={p.housingSituation === o.value} onClick={() => set('housingSituation', o.value)} />)}
      </div>
      {isHomeowner(p.housingSituation) && (
        <div className="mt-8">
          <p className="text-sm font-medium text-text-primary mb-1">Roughly what is your home worth?</p>
          <p className="text-xs text-text-muted mb-3">Optional. Used for property-value effects.</p>
          <div className="grid grid-cols-2 gap-3">
            {HOME_VALUE_BANDS.map(o => (
              <OptionButton key={o.value} label={o.label} selected={p.homeValueBand === o.value}
                onClick={() => set('homeValueBand', p.homeValueBand === o.value ? '' : o.value)} />
            ))}
          </div>
        </div>
      )}
    </Question>,

    <Question key="debts" title="What kinds of debt do you have?" hint="Select all that apply.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DEBT_TYPES.map(o => <MultiOptionButton key={o.value} label={o.label} selected={p.debtTypes.includes(o.value)} onClick={() => toggle('debtTypes', o.value)} />)}
      </div>
    </Question>,

    <Question key="dependents" title="Do you have children or other dependents?" hint="Dependents change tax credits, childcare and education costs.">
      <div className="grid grid-cols-2 gap-3">
        <OptionButton label="Yes" selected={p.hasDependents === true} onClick={() => set('hasDependents', true)} />
        <OptionButton label="No" selected={p.hasDependents === false} onClick={() => set('hasDependents', false)} />
      </div>
      {p.hasDependents && (
        <div className="mt-8 space-y-6">
          <div>
            <label htmlFor="dependents-count" className="block text-sm font-medium text-text-primary mb-2">How many?</label>
            <select id="dependents-count" value={p.dependentsCount} onChange={e => set('dependentsCount', Number(e.target.value))}
              className="input-glass w-full sm:w-40 px-4 py-3 text-base sm:text-sm">
              {Array.from({ length: MAX_DEPENDENTS }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}{n === MAX_DEPENDENTS ? '+' : ''}</option>)}
            </select>
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary mb-1">Their ages</p>
            <p className="text-xs text-text-muted mb-3">Optional. Select all that apply.</p>
            <div className="grid grid-cols-2 gap-3">
              {DEPENDENT_AGE_BANDS.map(o => <MultiOptionButton key={o.value} label={o.label} selected={p.dependentAgeBands.includes(o.value)} onClick={() => toggle('dependentAgeBands', o.value)} />)}
            </div>
          </div>
        </div>
      )}
    </Question>,

    <Question key="concerns" title="What are your top financial concerns?" hint={`Pick up to ${MAX_CONCERNS}.`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CONCERNS.map(o => {
          const selected = p.topFinancialConcerns.includes(o.value);
          return (
            <MultiOptionButton key={o.value} label={o.label} selected={selected}
              disabled={!selected && p.topFinancialConcerns.length >= MAX_CONCERNS}
              onClick={() => toggle('topFinancialConcerns', o.value)} />
          );
        })}
      </div>
    </Question>,

    <Question key="investments" title="Do you have investments?" hint="Optional. Helps estimate how market moves affect you. You can skip this.">
      <div className="space-y-2">
        {INVESTMENT_TYPES.map(o => (
          <OptionButton key={o.value} label={o.label} selected={p.investments === o.value}
            onClick={() => set('investments', p.investments === o.value ? '' : o.value)} />
        ))}
      </div>
    </Question>,
  ];

  if (!userId) {
    return (
      <div className="min-h-screen relative flex items-center justify-center" aria-busy="true">
        <AmbientBackground />
        <div className="relative z-10 flex gap-1" aria-label="Loading">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  const currentStage = STAGES.findIndex(s => s.steps.includes(step));
  const progress = ((step + 1) / TOTAL_STEPS) * 100;
  const isLast = step === TOTAL_STEPS - 1;

  return (
    <div className="min-h-screen relative flex flex-col" onKeyDown={onKeyDown}>
      <AmbientBackground />
      <div className="relative z-10 flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-8">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="font-display font-semibold text-lg">Politi<span className="text-primary">con</span></span>
        </div>

        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <ol className="flex items-center gap-3 sm:gap-4">
              {STAGES.map((stage, i) => {
                const Icon = stage.icon;
                const isActive = i === currentStage;
                const isDone = i < currentStage;
                return (
                  <li key={stage.label} className="flex items-center gap-2" aria-current={isActive ? 'step' : undefined}>
                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all ${
                      isDone ? 'bg-primary border-primary' : isActive ? 'border-primary bg-primary/20' : 'border-white/20 bg-white/5'
                    }`}>
                      {isDone ? <Check className="w-3.5 h-3.5 text-white" /> : <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'text-text-muted'}`} />}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block ${isActive ? 'text-text-primary' : isDone ? 'text-primary' : 'text-text-muted'}`}>{stage.label}</span>
                  </li>
                );
              })}
            </ol>
            <span className="text-xs text-text-muted font-mono-data">Step {step + 1} of {TOTAL_STEPS}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step + 1}>
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
          </div>
        </div>

        <div className="flex-1">
          <AnimatePresence mode="wait">{questions[step]}</AnimatePresence>
        </div>

        <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/10">
          <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button type="button" onClick={next} disabled={!canAdvance() || saving}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-medium transition-all">
            {isLast ? (saving ? 'Saving…' : p.investments ? 'See my impact' : 'Skip and see my impact') : step === 1 && !p.city ? 'Skip' : 'Continue'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {saveError && <p role="alert" className="mt-4 text-sm text-red-400 text-center">{saveError}</p>}
      </div>

      <AnimatePresence>
        {showDone && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm px-4" role="status">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="glass-strong rounded-3xl p-10 sm:p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-5">
                <Check className="w-7 h-7 text-primary" />
              </div>
              <h2 className="font-display text-3xl font-bold text-text-primary mb-2">Profile saved</h2>
              <p className="text-text-muted">Building your personalized policy feed…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
