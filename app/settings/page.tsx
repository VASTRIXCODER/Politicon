'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  User, MapPin, Briefcase, DollarSign, Shield, Bell,
  Eye, Zap, ChevronRight, Check, AlertTriangle, X,
  Lock, Trash2, RefreshCw, Save, ArrowLeft, BookOpen
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AmbientBackground from '@/components/landing/AmbientBackground';
import { useReadingMode } from '@/components/providers/ReadingModeProvider';

// ─── constants ───────────────────────────────────────────────────────────────

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois',
  'Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts',
  'Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota',
  'Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina',
  'South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington',
  'West Virginia','Wisconsin','Wyoming',
];

const AGE_RANGES = [
  { value: '18_25', label: '18–25' },
  { value: '26_30', label: '26–30' },
  { value: '31_45', label: '31–45' },
  { value: '46_55', label: '46–55' },
  { value: '56_65', label: '56–65' },
  { value: '65_plus', label: '65+' },
];
const EDUCATION = [
  { value: 'high_school', label: 'High School / GED' },
  { value: 'some_college', label: 'Some College' },
  { value: 'college_2yr', label: "Associate's Degree" },
  { value: 'college_4yr', label: "Bachelor's Degree" },
  { value: 'graduate', label: 'Graduate Degree' },
  { value: 'professional', label: 'Professional Degree (JD/MD)' },
  { value: 'doctorate', label: 'Doctorate' },
];
const EMPLOYMENT = [
  { value: 'employed_full', label: 'Employed Full-Time' },
  { value: 'employed_part', label: 'Employed Part-Time' },
  { value: 'self_employed', label: 'Self-Employed / Freelance' },
  { value: 'unemployed', label: 'Unemployed / Seeking Work' },
  { value: 'student', label: 'Student' },
  { value: 'retired', label: 'Retired' },
  { value: 'disabled', label: 'Unable to Work' },
];
const OCCUPATION = [
  { value: 'tech_software', label: 'Technology / Software' },
  { value: 'healthcare_medical', label: 'Healthcare / Medical' },
  { value: 'education_teaching', label: 'Education / Teaching' },
  { value: 'business_finance', label: 'Business / Finance' },
  { value: 'legal', label: 'Legal' },
  { value: 'arts_entertainment', label: 'Arts / Entertainment' },
  { value: 'construction_trades', label: 'Construction / Trades' },
  { value: 'retail_service', label: 'Retail / Service' },
  { value: 'government_military', label: 'Government / Military' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'other', label: 'Other' },
];
const INCOME = [
  { value: 'under_30k', label: 'Under $30,000' },
  { value: '30k_50k', label: '$30,000 – $50,000' },
  { value: '50k_75k', label: '$50,000 – $75,000' },
  { value: '75k_100k', label: '$75,000 – $100,000' },
  { value: '100k_150k', label: '$100,000 – $150,000' },
  { value: '150k_250k', label: '$150,000 – $250,000' },
  { value: 'over_250k', label: 'Over $250,000' },
];
const FILING = [
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married Filing Jointly' },
  { value: 'married_separate', label: 'Married Filing Separately' },
  { value: 'head_household', label: 'Head of Household' },
  { value: 'qualifying_widow', label: 'Qualifying Widow(er)' },
];
const HOUSING = [
  { value: 'own_outright', label: 'Own Outright (No Mortgage)' },
  { value: 'own_mortgage', label: 'Own with Mortgage' },
  { value: 'rent', label: 'Renting' },
  { value: 'rent_assisted', label: 'Renting with Assistance' },
  { value: 'live_with_family', label: 'Living with Family' },
  { value: 'other', label: 'Other' },
];
const DEBT_TYPES = [
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'student_loans', label: 'Student Loans' },
  { value: 'auto_loan', label: 'Auto Loan' },
  { value: 'credit_card', label: 'Credit Card Debt' },
  { value: 'medical', label: 'Medical Debt' },
  { value: 'personal_loan', label: 'Personal Loan' },
  { value: 'business_loan', label: 'Business Loan' },
];
const CONCERNS = [
  { value: 'cost_of_living', label: 'Cost of Living' },
  { value: 'retirement', label: 'Retirement Security' },
  { value: 'healthcare_costs', label: 'Healthcare Costs' },
  { value: 'housing_costs', label: 'Housing Costs' },
  { value: 'student_debt', label: 'Student Debt' },
  { value: 'job_security', label: 'Job Security' },
  { value: 'taxes', label: 'Tax Burden' },
  { value: 'inflation', label: 'Inflation' },
  { value: 'savings', label: 'Building Savings' },
  { value: 'investment', label: 'Investment Returns' },
];

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'financial', label: 'Financial Profile', icon: DollarSign },
  { id: 'preferences', label: 'Preferences', icon: Eye },
  { id: 'security', label: 'Security', icon: Shield },
];

// ─── tiny helpers ─────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{children}</label>;
}

function SelectField({ value, onChange, options, disabled }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="input-glass w-full px-4 py-3 text-sm rounded-xl bg-surface/60 border border-white/10 text-text-primary focus:border-primary/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="">— Select —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function MultiChip({ options, selected, onChange, max }: {
  options: { value: string; label: string }[];
  selected: string[]; onChange: (v: string[]) => void; max?: number;
}) {
  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter(x => x !== val));
    } else {
      if (max && selected.length >= max) return;
      onChange([...selected, val]);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              active
                ? 'bg-primary/20 border-primary/50 text-primary'
                : 'border-white/10 text-text-muted hover:border-white/20 hover:text-text-primary'
            }`}
          >
            {active && <Check className="inline w-3 h-3 mr-1" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── toast ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error';
function Toast({ message, type, onDismiss }: { message: string; type: ToastType; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 4000); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.96 }}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border text-sm font-medium ${
        type === 'success'
          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
          : 'bg-red-500/15 border-red-500/30 text-red-400'
      }`}
    >
      {type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      {message}
      <button onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
    </motion.div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { mode: readingMode, setMode: setReadingMode } = useReadingMode();

  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Profile state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');

  // Financial profile state
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [educationStage, setEducationStage] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('');
  const [occupationCategory, setOccupationCategory] = useState('');
  const [incomeRange, setIncomeRange] = useState('');
  const [filingStatus, setFilingStatus] = useState('');
  const [housingSituation, setHousingSituation] = useState('');
  const [debtTypes, setDebtTypes] = useState<string[]>([]);
  const [hasDependents, setHasDependents] = useState(false);
  const [topFinancialConcerns, setTopFinancialConcerns] = useState<string[]>([]);

  // Security state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteZone, setShowDeleteZone] = useState(false);

  const showToast = (message: string, type: ToastType) => setToast({ message, type });

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/auth/signin'); return; }

    setEmail(user.email || '');
    setFirstName(user.user_metadata?.first_name || '');

    const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
    if (data) {
      setFirstName(data.first_name || firstName);
      setCity(data.city || '');
      setState(data.state || '');
      setAgeRange(data.age_range || '');
      setEducationStage(data.education_stage || '');
      setEmploymentStatus(data.employment_status || '');
      setOccupationCategory(data.occupation_category || '');
      setIncomeRange(data.income_range || '');
      setFilingStatus(data.filing_status || '');
      setHousingSituation(data.housing_situation || '');
      setDebtTypes(data.debt_types || []);
      setHasDependents(data.has_dependents || false);
      setTopFinancialConcerns(data.top_financial_concerns || []);
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // ── save profile (name) ──────────────────────────────────────────────────
  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await supabase.auth.updateUser({ data: { first_name: firstName } });
      const { error } = await supabase.from('user_profiles').update({ first_name: firstName }).eq('id', user.id);
      if (error) throw error;
      showToast('Profile updated successfully', 'success');
    } catch {
      showToast('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── save financial profile ───────────────────────────────────────────────
  const saveFinancial = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('user_profiles').update({
        city,
        state,
        age_range: ageRange,
        education_stage: educationStage,
        employment_status: employmentStatus,
        occupation_category: occupationCategory,
        income_range: incomeRange,
        filing_status: filingStatus,
        housing_situation: housingSituation,
        debt_types: debtTypes,
        has_dependents: hasDependents,
        top_financial_concerns: topFinancialConcerns,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
      if (error) throw error;
      showToast('Financial profile updated — AI analysis will reflect your new data', 'success');
    } catch {
      showToast('Failed to save financial profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── change password ──────────────────────────────────────────────────────
  const changePassword = async () => {
    if (newPassword.length < 8) { showToast('Password must be at least 8 characters', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('Passwords do not match', 'error'); return; }
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated successfully', 'success');
    } catch (err: unknown) {
      showToast((err as Error).message || 'Failed to update password', 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  // ── delete account ───────────────────────────────────────────────────────
  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { showToast('Type DELETE to confirm', 'error'); return; }
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!res.ok) throw new Error('Deletion failed');
      await supabase.auth.signOut();
      router.push('/');
    } catch {
      showToast('Failed to delete account. Contact support.', 'error');
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const initials = firstName ? firstName.slice(0, 2).toUpperCase() : email.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-24">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl glass border border-white/10 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">Settings</h1>
            <p className="text-sm text-text-muted">Manage your account, profile and preferences</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* Sidebar nav */}
          <aside className="lg:w-56 flex-shrink-0">
            {/* Avatar card */}
            <div className="glass border border-white/10 rounded-2xl p-5 mb-4 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-secondary/20 border border-primary/30 flex items-center justify-center mb-3">
                <span className="font-display font-bold text-xl text-primary">{initials}</span>
              </div>
              <p className="font-medium text-text-primary text-sm">{firstName || 'User'}</p>
              <p className="text-xs text-text-muted truncate max-w-full">{email}</p>
            </div>

            {/* Tab nav — horizontal on mobile, vertical on desktop */}
            <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                      active
                        ? 'bg-primary/15 border border-primary/30 text-primary'
                        : 'text-text-muted hover:text-text-primary hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{tab.label}</span>
                    {active && <ChevronRight className="w-3.5 h-3.5 ml-auto hidden lg:block" />}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >

                {/* ── PROFILE TAB ── */}
                {activeTab === 'profile' && (
                  <div className="space-y-4">
                    <SectionCard title="Personal Information" subtitle="Your display name shown across Politicon">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <FieldLabel>First Name</FieldLabel>
                          <input
                            type="text"
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            placeholder="Your first name"
                            className="input-glass w-full px-4 py-3 text-sm rounded-xl"
                          />
                        </div>
                        <div>
                          <FieldLabel>Email Address</FieldLabel>
                          <input
                            type="email"
                            value={email}
                            disabled
                            className="input-glass w-full px-4 py-3 text-sm rounded-xl opacity-50 cursor-not-allowed"
                          />
                          <p className="text-xs text-text-muted mt-1.5">Email cannot be changed here</p>
                        </div>
                      </div>
                      <SaveButton onClick={saveProfile} loading={saving} />
                    </SectionCard>

                    <InfoCard
                      icon={<Briefcase className="w-4 h-4 text-primary" />}
                      title="Financial Profile"
                      description="Your demographics and financial data are what make AI analysis personalized to you. Update them in the Financial Profile tab."
                      action={{ label: 'Go to Financial Profile', onClick: () => setActiveTab('financial') }}
                    />
                  </div>
                )}

                {/* ── FINANCIAL PROFILE TAB ── */}
                {activeTab === 'financial' && (
                  <div className="space-y-4">
                    <div className="glass border border-amber-500/20 bg-amber-500/5 rounded-2xl px-5 py-4 flex gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-300/80">Changes here directly affect how the AI calculates your policy impact. Keep this accurate for best results.</p>
                    </div>

                    <SectionCard title="Location" subtitle="Used to factor in state taxes, cost of living and regional policies">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <FieldLabel>State</FieldLabel>
                          <SelectField value={state} onChange={setState} options={US_STATES.map(s => ({ value: s, label: s }))} />
                        </div>
                        <div>
                          <FieldLabel>City (optional)</FieldLabel>
                          <input
                            type="text"
                            value={city}
                            onChange={e => setCity(e.target.value)}
                            placeholder="e.g. Austin"
                            className="input-glass w-full px-4 py-3 text-sm rounded-xl"
                          />
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Demographics" subtitle="Helps calibrate tax brackets, credits and program eligibility">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <FieldLabel>Age Range</FieldLabel>
                          <SelectField value={ageRange} onChange={setAgeRange} options={AGE_RANGES} />
                        </div>
                        <div>
                          <FieldLabel>Education Level</FieldLabel>
                          <SelectField value={educationStage} onChange={setEducationStage} options={EDUCATION} />
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Economic Position" subtitle="Core data for tax liability, wage effects and employment impact estimates">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <FieldLabel>Employment Status</FieldLabel>
                          <SelectField value={employmentStatus} onChange={setEmploymentStatus} options={EMPLOYMENT} />
                        </div>
                        <div>
                          <FieldLabel>Occupation Category</FieldLabel>
                          <SelectField value={occupationCategory} onChange={setOccupationCategory} options={OCCUPATION} />
                        </div>
                        <div>
                          <FieldLabel>Annual Household Income</FieldLabel>
                          <SelectField value={incomeRange} onChange={setIncomeRange} options={INCOME} />
                        </div>
                        <div>
                          <FieldLabel>Tax Filing Status</FieldLabel>
                          <SelectField value={filingStatus} onChange={setFilingStatus} options={FILING} />
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Life Situation" subtitle="Housing, debt and dependents shape which policies most directly affect you">
                      <div className="space-y-5">
                        <div>
                          <FieldLabel>Housing Situation</FieldLabel>
                          <SelectField value={housingSituation} onChange={setHousingSituation} options={HOUSING} />
                        </div>
                        <div>
                          <FieldLabel>Debt Types (select all that apply)</FieldLabel>
                          <MultiChip options={DEBT_TYPES} selected={debtTypes} onChange={setDebtTypes} />
                        </div>
                        <div>
                          <FieldLabel>Dependents</FieldLabel>
                          <div className="flex gap-3">
                            {[{ v: false, l: 'No dependents' }, { v: true, l: 'I have dependents' }].map(opt => (
                              <button
                                key={String(opt.v)}
                                type="button"
                                onClick={() => setHasDependents(opt.v)}
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm border transition-all ${
                                  hasDependents === opt.v
                                    ? 'bg-primary/15 border-primary/40 text-primary'
                                    : 'border-white/10 text-text-muted hover:border-white/20'
                                }`}
                              >
                                {hasDependents === opt.v && <Check className="inline w-3.5 h-3.5 mr-1.5" />}
                                {opt.l}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <FieldLabel>Top Financial Concerns (up to 5)</FieldLabel>
                          <MultiChip options={CONCERNS} selected={topFinancialConcerns} onChange={setTopFinancialConcerns} max={5} />
                        </div>
                      </div>
                    </SectionCard>

                    <SaveButton onClick={saveFinancial} loading={saving} label="Save Financial Profile" />
                  </div>
                )}

                {/* ── PREFERENCES TAB ── */}
                {activeTab === 'preferences' && (
                  <div className="space-y-4">
                    <SectionCard title="Reading Mode" subtitle="Controls how complex the AI analysis language is across the entire app">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {([
                          {
                            value: 'simple' as const,
                            icon: <BookOpen className="w-5 h-5" />,
                            label: 'Simple Mode',
                            description: 'Plain English, grade-8 reading level. Numbers translated into everyday examples.',
                          },
                          {
                            value: 'expert' as const,
                            icon: <Zap className="w-5 h-5" />,
                            label: 'Expert Mode',
                            description: 'Full financial terminology, detailed metrics, technical breakdowns.',
                          },
                        ] as const).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setReadingMode(opt.value)}
                            className={`relative text-left p-5 rounded-2xl border transition-all ${
                              readingMode === opt.value
                                ? 'bg-primary/10 border-primary/40'
                                : 'border-white/10 hover:border-white/20 hover:bg-white/3'
                            }`}
                          >
                            {readingMode === opt.value && (
                              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                            <div className={`mb-3 ${readingMode === opt.value ? 'text-primary' : 'text-text-muted'}`}>
                              {opt.icon}
                            </div>
                            <p className="font-semibold text-sm text-text-primary mb-1">{opt.label}</p>
                            <p className="text-xs text-text-muted leading-relaxed">{opt.description}</p>
                          </button>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center gap-2 text-xs text-text-muted">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Reading mode is saved automatically and synced across devices
                      </div>
                    </SectionCard>

                    <SectionCard title="Notifications" subtitle="Control what Politicon sends you">
                      {[
                        { label: 'Policy alerts', desc: 'Get notified when a high-impact policy passes that affects your profile', defaultOn: true },
                        { label: 'Weekly digest', desc: 'A summary of the top 3 policies affecting your finances each week', defaultOn: false },
                        { label: 'Analysis complete', desc: 'Confirmation when a full AI analysis finishes', defaultOn: true },
                      ].map(n => (
                        <NotificationRow key={n.label} label={n.label} desc={n.desc} defaultOn={n.defaultOn} />
                      ))}
                    </SectionCard>

                    <SectionCard title="Analysis Defaults" subtitle="Control how policy analysis behaves">
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium text-text-primary">Re-run Onboarding</p>
                          <p className="text-xs text-text-muted mt-0.5">Walk through the full profile setup again from scratch</p>
                        </div>
                        <button
                          onClick={() => router.push('/onboarding')}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-white/10 hover:border-white/20 text-sm text-text-muted hover:text-text-primary transition-all"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Re-run
                        </button>
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* ── SECURITY TAB ── */}
                {activeTab === 'security' && (
                  <div className="space-y-4">
                    <SectionCard title="Change Password" subtitle="Choose a strong password you don't use elsewhere">
                      <div className="space-y-4">
                        <div>
                          <FieldLabel>New Password</FieldLabel>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="At least 8 characters"
                            className="input-glass w-full px-4 py-3 text-sm rounded-xl"
                          />
                        </div>
                        <div>
                          <FieldLabel>Confirm New Password</FieldLabel>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Repeat new password"
                            className="input-glass w-full px-4 py-3 text-sm rounded-xl"
                          />
                          {newPassword && confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Passwords do not match</p>
                          )}
                        </div>
                        <PasswordStrength password={newPassword} />
                      </div>
                      <SaveButton
                        onClick={changePassword}
                        loading={passwordLoading}
                        label="Update Password"
                        icon={<Lock className="w-4 h-4" />}
                        disabled={!newPassword || newPassword !== confirmPassword || newPassword.length < 8}
                      />
                    </SectionCard>

                    <SectionCard title="Active Sessions" subtitle="You are currently signed in on this device">
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                          </div>
                          <div>
                            <p className="text-sm text-text-primary font-medium">Current session</p>
                            <p className="text-xs text-text-muted">Active now</p>
                          </div>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                      </div>
                    </SectionCard>

                    {/* Danger Zone */}
                    <div className="glass border border-red-500/20 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setShowDeleteZone(v => !v)}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-red-500/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Trash2 className="w-4 h-4 text-red-400" />
                          <div className="text-left">
                            <p className="text-sm font-semibold text-red-400">Delete Account</p>
                            <p className="text-xs text-text-muted">Permanently delete your account and all data</p>
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-red-400/60 transition-transform ${showDeleteZone ? 'rotate-90' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showDeleteZone && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-6 pb-6 space-y-4 border-t border-red-500/15 pt-4">
                              <p className="text-sm text-text-muted leading-relaxed">
                                This will permanently delete your account, all analyzed policies, chat history and financial profile. <strong className="text-red-400">This cannot be undone.</strong>
                              </p>
                              <div>
                                <FieldLabel>Type DELETE to confirm</FieldLabel>
                                <input
                                  type="text"
                                  value={deleteConfirm}
                                  onChange={e => setDeleteConfirm(e.target.value)}
                                  placeholder="DELETE"
                                  className="input-glass w-full px-4 py-3 text-sm rounded-xl border border-red-500/20 focus:border-red-500/50"
                                />
                              </div>
                              <button
                                onClick={deleteAccount}
                                disabled={deleteConfirm !== 'DELETE' || deleteLoading}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {deleteLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                {deleteLoading ? 'Deleting…' : 'Permanently Delete My Account'}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="glass border border-white/10 rounded-2xl p-6">
      <div className="mb-5">
        <h2 className="font-display font-semibold text-text-primary text-base">{title}</h2>
        <p className="text-xs text-text-muted mt-1">{subtitle}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function InfoCard({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="glass border border-white/8 rounded-2xl p-5 flex gap-4 items-start">
      <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">{description}</p>
        {action && (
          <button onClick={action.onClick} className="mt-3 text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors">
            {action.label} <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function SaveButton({ onClick, loading, label = 'Save Changes', icon, disabled }: {
  onClick: () => void; loading: boolean; label?: string;
  icon?: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div className="pt-2 flex justify-end">
      <button
        onClick={onClick}
        disabled={loading || disabled}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : (icon || <Save className="w-4 h-4" />)}
        {loading ? 'Saving…' : label}
      </button>
    </div>
  );
}

function NotificationRow({ label, desc, defaultOn }: { label: string; desc: string; defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/6 last:border-0">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => setOn(v => !v)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-primary' : 'bg-white/15'}`}
      >
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${on ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { label: '8+ characters', pass: password.length >= 8 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
    { label: 'Special character', pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.pass).length;
  const color = score <= 1 ? 'bg-red-500' : score === 2 ? 'bg-amber-500' : score === 3 ? 'bg-yellow-400' : 'bg-emerald-500';
  const label = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong';
  return (
    <div>
      <div className="flex gap-1 mb-2">
        {[1,2,3,4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? color : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">Password strength: <span className={score >= 3 ? 'text-emerald-400' : 'text-amber-400'}>{label}</span></p>
        <div className="flex gap-3">
          {checks.map(c => (
            <span key={c.label} className={`text-xs ${c.pass ? 'text-emerald-400' : 'text-text-muted'}`}>
              {c.pass ? '✓' : '·'} {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
