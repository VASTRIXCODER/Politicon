'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, Check, Zap, MapPin, Briefcase, Home } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AmbientBackground from '@/components/landing/AmbientBackground';

const usStates = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];
const ageRanges = [{value:'under_18',label:'Under 18'},{value:'18_22',label:'18–22'},{value:'23_30',label:'23–30'},{value:'31_45',label:'31–45'},{value:'46_60',label:'46–60'},{value:'60_plus',label:'60+'}];
const educationStages = [{value:'middle_high',label:'Middle / High school'},{value:'college_2yr',label:'College (2-year)'},{value:'college_4yr',label:'College (4-year)'},{value:'graduate',label:'Graduate / Professional'},{value:'not_enrolled',label:'Not currently enrolled'}];
const employmentStatuses = [{value:'student',label:'Student'},{value:'employed_full',label:'Employed full-time'},{value:'employed_part',label:'Employed part-time'},{value:'self_employed',label:'Self-employed'},{value:'unemployed',label:'Unemployed'},{value:'retired',label:'Retired'}];
const occupationCategories = [{value:'tech',label:'Tech / Engineering'},{value:'healthcare',label:'Healthcare'},{value:'education',label:'Education'},{value:'service_retail',label:'Service / Retail'},{value:'manufacturing',label:'Manufacturing'},{value:'business_finance',label:'Business / Finance'},{value:'creative_media',label:'Creative / Media'},{value:'public_sector',label:'Public sector'},{value:'other',label:'Other'},{value:'not_applicable',label:'Not applicable'}];
const incomeRanges = [{value:'under_25k',label:'Under $25,000'},{value:'25k_50k',label:'$25,000 – $50,000'},{value:'50k_75k',label:'$50,000 – $75,000'},{value:'75k_100k',label:'$75,000 – $100,000'},{value:'100k_plus',label:'$100,000+'}];
const filingStatuses = [{value:'single',label:'Single'},{value:'married_joint',label:'Married filing jointly'},{value:'married_separate',label:'Married filing separately'},{value:'head_of_household',label:'Head of household'},{value:'prefer_not',label:'Prefer not to say'}];
const housingSituations = [{value:'rent',label:'Rent'},{value:'own',label:'Own'},{value:'family',label:'Live with family'},{value:'campus',label:'Campus housing'},{value:'other',label:'Other'}];
const debtTypes = [{value:'student_loans',label:'Student loans'},{value:'credit_card',label:'Credit card debt'},{value:'auto_loans',label:'Auto loans'},{value:'mortgage',label:'Mortgage'},{value:'none',label:'None'}];
const topFinancialConcernOptions = [{value:'cost_of_living',label:'Rising cost of living'},{value:'healthcare',label:'Healthcare expenses'},{value:'student_debt',label:'Student loan debt'},{value:'job_security',label:'Job security'},{value:'housing',label:'Housing affordability'},{value:'retirement',label:'Saving for retirement'},{value:'childcare',label:'Childcare costs'},{value:'taxes',label:'Tax burden'},{value:'inflation',label:'Inflation impact'}];

const stages = [
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'finances', label: 'Finances', icon: Briefcase },
  { id: 'life', label: 'Life Situation', icon: Home },
];

const TOTAL_STEPS = 11;

function OptionButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full text-left px-5 py-4 rounded-2xl border text-sm transition-all ${
      selected ? 'bg-primary/15 border-primary/40 text-text-primary' : 'glass border-white/8 text-text-muted hover:text-text-primary hover:border-white/16'
    }`}>
      <div className="flex items-center justify-between">
        <span>{label}</span>
        {selected && <Check className="w-4 h-4 text-primary" />}
      </div>
    </button>
  );
}

function MultiOptionButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-left px-4 py-3 rounded-xl border text-sm transition-all ${
      selected ? 'bg-primary/15 border-primary/40 text-text-primary' : 'glass border-white/8 text-text-muted hover:text-text-primary hover:border-white/16'
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

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    state: '', city: '', country: 'United States', ageRange: '', educationStage: '',
    employmentStatus: '', occupationCategory: '', incomeRange: '', filingStatus: '',
    housingSituation: '', debtTypes: [] as string[], hasDependents: false, topFinancialConcerns: [] as string[],
  });

  const currentStage = step < 4 ? 0 : step < 9 ? 1 : 2;
  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  const toggleMulti = (key: 'debtTypes' | 'topFinancialConcerns', value: string) => {
    setProfile(prev => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter(v => v !== value) : [...prev[key], value],
    }));
  };

  const canAdvance = () => {
    const checks: boolean[] = [
      !!profile.state, !!profile.city, !!profile.ageRange, !!profile.educationStage,
      !!profile.employmentStatus, !!profile.occupationCategory, !!profile.incomeRange,
      !!profile.filingStatus, !!profile.housingSituation, profile.debtTypes.length > 0,
      profile.topFinancialConcerns.length > 0,
    ];
    return checks[step] ?? true;
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from('user_profiles').upsert({
          id: user.id,
          has_completed_onboarding: true,
          state: profile.state,
          city: profile.city,
          age_range: profile.ageRange,
          education_stage: profile.educationStage,
          employment_status: profile.employmentStatus,
          occupation_category: profile.occupationCategory,
          income_range: profile.incomeRange,
          filing_status: profile.filingStatus,
          housing_situation: profile.housingSituation,
          debt_types: profile.debtTypes,
          has_dependents: profile.hasDependents,
          top_financial_concerns: profile.topFinancialConcerns,
        }, { onConflict: 'id' });
        if (error) console.error('Profile save error:', error);
      }
    } catch (e) { console.error('Profile save failed:', e); }
    setShowConfetti(true);
    setTimeout(() => router.push('/dashboard'), 2200);
  };

  const questions = [
    <motion.div key="state" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-8">What state do you live in?</p>
      <select value={profile.state} onChange={e => setProfile(p => ({ ...p, state: e.target.value }))} className="input-glass w-full px-4 py-4 text-sm">
        <option value="">Select your state...</option>
        {usStates.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </motion.div>,

    <motion.div key="city" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-8">What city or county?</p>
      <input type="text" placeholder="e.g. San Francisco, Cook County..." value={profile.city} onChange={e => setProfile(p => ({ ...p, city: e.target.value }))} className="input-glass w-full px-4 py-4 text-sm" autoFocus />
      <p className="text-xs text-text-muted mt-3">Used for local policies and cost-of-living adjustments.</p>
    </motion.div>,

    <motion.div key="age" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-8">Which age range are you in?</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ageRanges.map(opt => <OptionButton key={opt.value} label={opt.label} selected={profile.ageRange === opt.value} onClick={() => setProfile(p => ({ ...p, ageRange: opt.value }))} />)}
      </div>
    </motion.div>,

    <motion.div key="edu" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-8">Current education stage?</p>
      <div className="space-y-2">
        {educationStages.map(opt => <OptionButton key={opt.value} label={opt.label} selected={profile.educationStage === opt.value} onClick={() => setProfile(p => ({ ...p, educationStage: opt.value }))} />)}
      </div>
    </motion.div>,

    <motion.div key="emp" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-8">Employment situation?</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {employmentStatuses.map(opt => <OptionButton key={opt.value} label={opt.label} selected={profile.employmentStatus === opt.value} onClick={() => setProfile(p => ({ ...p, employmentStatus: opt.value }))} />)}
      </div>
    </motion.div>,

    <motion.div key="occ" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-8">What field do you work in?</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {occupationCategories.map(opt => <OptionButton key={opt.value} label={opt.label} selected={profile.occupationCategory === opt.value} onClick={() => setProfile(p => ({ ...p, occupationCategory: opt.value }))} />)}
      </div>
    </motion.div>,

    <motion.div key="income" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-8">Approximate household income?</p>
      <div className="space-y-2">
        {incomeRanges.map(opt => <OptionButton key={opt.value} label={opt.label} selected={profile.incomeRange === opt.value} onClick={() => setProfile(p => ({ ...p, incomeRange: opt.value }))} />)}
      </div>
      <p className="text-xs text-text-muted mt-3">Your exact income stays private. We use ranges only.</p>
    </motion.div>,

    <motion.div key="filing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-8">Tax filing status?</p>
      <div className="space-y-2">
        {filingStatuses.map(opt => <OptionButton key={opt.value} label={opt.label} selected={profile.filingStatus === opt.value} onClick={() => setProfile(p => ({ ...p, filingStatus: opt.value }))} />)}
      </div>
    </motion.div>,

    <motion.div key="housing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-8">Current housing situation?</p>
      <div className="grid grid-cols-2 gap-3">
        {housingSituations.map(opt => <OptionButton key={opt.value} label={opt.label} selected={profile.housingSituation === opt.value} onClick={() => setProfile(p => ({ ...p, housingSituation: opt.value }))} />)}
      </div>
    </motion.div>,

    <motion.div key="debts" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-8">What types of debt do you have?</p>
      <div className="grid grid-cols-2 gap-3">
        {debtTypes.map(opt => <MultiOptionButton key={opt.value} label={opt.label} selected={profile.debtTypes.includes(opt.value)} onClick={() => toggleMulti('debtTypes', opt.value)} />)}
      </div>
    </motion.div>,

    <motion.div key="concerns" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
      <p className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-2">Top financial concerns?</p>
      <p className="text-xs text-text-muted mb-6">Select up to 3</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {topFinancialConcernOptions.map(opt => (
          <MultiOptionButton key={opt.value} label={opt.label} selected={profile.topFinancialConcerns.includes(opt.value)}
            onClick={() => {
              if (!profile.topFinancialConcerns.includes(opt.value) && profile.topFinancialConcerns.length >= 3) return;
              toggleMulti('topFinancialConcerns', opt.value);
            }}
          />
        ))}
      </div>
    </motion.div>,
  ];

  return (
    <div className="min-h-screen relative flex flex-col">
      <AmbientBackground />
      <div className="relative z-10 flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-8">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="font-display font-semibold text-lg">Politi<span className="text-primary">con</span></span>
        </div>

        {/* Progress */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              {stages.map((stage, i) => {
                const Icon = stage.icon;
                const isActive = i === currentStage;
                const isDone = i < currentStage;
                return (
                  <div key={stage.id} className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all ${
                      isDone ? 'bg-primary border-primary' : isActive ? 'border-primary bg-primary/20' : 'border-white/20 bg-white/5'
                    }`}>
                      {isDone ? <Check className="w-3.5 h-3.5 text-white" /> : <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'text-text-muted'}`} />}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block ${
                      isActive ? 'text-text-primary' : isDone ? 'text-primary' : 'text-text-muted'
                    }`}>{stage.label}</span>
                  </div>
                );
              })}
            </div>
            <span className="text-xs text-text-muted font-mono-data">{step + 1}/{TOTAL_STEPS}</span>
          </div>
          <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
          </div>
        </div>

        <div className="flex-1">
          <AnimatePresence mode="wait">{questions[step]}</AnimatePresence>
        </div>

        <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/8">
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {step < TOTAL_STEPS - 1 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-medium transition-all">
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleComplete} disabled={!canAdvance() || saving}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white px-6 py-3 rounded-xl text-sm font-medium transition-all">
              {saving ? 'Saving...' : 'See my impact'} <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showConfetti && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="glass-strong rounded-3xl p-12 text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="font-display text-3xl font-bold text-text-primary mb-2">Profile complete!</h2>
              <p className="text-text-muted">Analyzing policies for your situation...</p>
              <div className="mt-6 flex justify-center gap-1">
                {[...Array(3)].map((_, i) => (
                  <motion.div key={i} className="w-2 h-2 rounded-full bg-primary"
                    animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }} />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
