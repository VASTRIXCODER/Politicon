'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User, MapPin, Briefcase, DollarSign, Shield, Bell,
  Eye, Zap, ChevronRight, Check, AlertTriangle, X,
  Lock, Trash2, RefreshCw, Save, ArrowLeft, BookOpen
} from 'lucide-react';
import {
  AGE_RANGES, CONCERNS, DEBT_TYPES, DEPENDENT_AGE_BANDS, EDUCATION_LEVELS, EMPLOYMENT_STATUSES,
  FILING_STATUSES, HOME_VALUE_BANDS, HOUSING_SITUATIONS, INCOME_RANGES, INVESTMENT_TYPES, MAX_CONCERNS,
  MAX_DEPENDENTS, OCCUPATIONS, US_STATES, isHomeowner, validOnly, validOrEmpty,
} from '@/lib/profileOptions';
import { FinancialProfileSchema } from '@/lib/profileSchema';
import { apiFetch } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import AmbientBackground from '@/components/landing/AmbientBackground';
import { useReadingMode } from '@/components/providers/ReadingModeProvider';

// ─── constants ───────────────────────────────────────────────────────────────

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

function SelectField({ value, onChange, options, disabled, placeholder = '— Select —' }: {
  value: string; onChange: (v: string) => void;
  options: readonly { value: string; label: string }[]; disabled?: boolean; placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="input-glass w-full px-4 py-3 text-sm rounded-xl bg-surface/60 border border-white/10 text-text-primary focus:border-primary/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function MultiChip({ options, selected, onChange, max }: {
  options: readonly { value: string; label: string }[];
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
  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  // OAuth-only accounts have no password to confirm with.
  const [hasPassword, setHasPassword] = useState(true);
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
  const [dependentsCount, setDependentsCount] = useState(1);
  const [dependentAgeBands, setDependentAgeBands] = useState<string[]>([]);
  const [investments, setInvestments] = useState('');
  const [homeValueBand, setHomeValueBand] = useState('');
  const [topFinancialConcerns, setTopFinancialConcerns] = useState<string[]>([]);

  // Security state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [signOutOthersLoading, setSignOutOthersLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteZone, setShowDeleteZone] = useState(false);

  const showToast = (message: string, type: ToastType) => setToast({ message, type });

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/auth/signin'); return; }

    setEmail(user.email || '');
    const providers = (user.app_metadata?.providers as string[] | undefined) || [user.app_metadata?.provider];
    setHasPassword(providers.includes('email'));
    setFirstName(user.user_metadata?.first_name || '');

    const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
    if (data) {
      setFirstName(data.first_name || firstName);
      // Anything outside the current vocabulary shows as blank so it gets re-picked.
      setCity(data.city || '');
      setState(US_STATES.includes(data.state) ? data.state : '');
      setAgeRange(validOrEmpty(AGE_RANGES, data.age_range));
      setEducationStage(validOrEmpty(EDUCATION_LEVELS, data.education_stage));
      setEmploymentStatus(validOrEmpty(EMPLOYMENT_STATUSES, data.employment_status));
      setOccupationCategory(validOrEmpty(OCCUPATIONS, data.occupation_category));
      setIncomeRange(validOrEmpty(INCOME_RANGES, data.income_range));
      setFilingStatus(validOrEmpty(FILING_STATUSES, data.filing_status));
      setHousingSituation(validOrEmpty(HOUSING_SITUATIONS, data.housing_situation));
      setHomeValueBand(validOrEmpty(HOME_VALUE_BANDS, data.home_value_band));
      setDebtTypes(validOnly(DEBT_TYPES, data.debt_types));
      setHasDependents((data.dependents_count ?? (data.has_dependents ? 1 : 0)) > 0);
      setDependentsCount(data.dependents_count > 0 ? data.dependents_count : 1);
      setDependentAgeBands(validOnly(DEPENDENT_AGE_BANDS, data.dependent_age_bands));
      setTopFinancialConcerns(validOnly(CONCERNS, data.top_financial_concerns).slice(0, MAX_CONCERNS));
      setInvestments(validOrEmpty(INVESTMENT_TYPES, data.investments));
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
    const parsed = FinancialProfileSchema.safeParse({
      state, city, ageRange, educationStage, employmentStatus, occupationCategory, incomeRange,
      filingStatus, housingSituation, debtTypes, hasDependents,
      dependentsCount: hasDependents ? dependentsCount : 0,
      dependentAgeBands: hasDependents ? dependentAgeBands : [],
      topFinancialConcerns,
      investments: investments || null,
      homeValueBand: isHomeowner(housingSituation) && homeValueBand ? homeValueBand : null,
    });
    if (!parsed.success) {
      showToast('Please answer every required field before saving.', 'error');
      return;
    }
    setSaving(true);
    const res = await apiFetch('/api/profile', { method: 'PUT', body: { profile: parsed.data } });
    setSaving(false);
    showToast(
      res.ok ? 'Saved. Your policy feed will rebuild from your updated profile.' : res.message,
      res.ok ? 'success' : 'error',
    );
  };

  // ── change email ─────────────────────────────────────────────────────────
  const changeEmail = async () => {
    const next = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) { showToast('Enter a valid email address', 'error'); return; }
    setEmailLoading(true);
    const { error } = await supabase.auth.updateUser(
      { email: next },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/settings` },
    );
    setEmailLoading(false);
    if (error) { showToast(error.message, 'error'); return; }
    setNewEmail('');
    showToast(`Check ${next} for a confirmation link to finish the change.`, 'success');
  };

  // ── change password ──────────────────────────────────────────────────────
  const changePassword = async () => {
    if (newPassword.length < 8) { showToast('Password must be at least 8 characters', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('Passwords do not match', 'error'); return; }
    if (hasPassword && !currentPassword) { showToast('Enter your current password', 'error'); return; }
    setPasswordLoading(true);
    try {
      // Re-authenticate first so a hijacked session can't change the password.
      if (hasPassword) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
        if (reauthError) throw new Error('Your current password is incorrect');
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // Any other device signed in with the old password is signed out.
      await supabase.auth.signOut({ scope: 'others' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated. Other devices have been signed out.', 'success');
    } catch (err: unknown) {
      showToast((err as Error).message || 'Failed to update password', 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  // ── sign out other devices ───────────────────────────────────────────────
  const signOutOthers = async () => {
    setSignOutOthersLoading(true);
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setSignOutOthersLoading(false);
    showToast(error ? 'Could not sign out other devices. Please try again.' : 'Signed out of all other devices', error ? 'error' : 'success');
  };

  // ── delete account ───────────────────────────────────────────────────────
  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { showToast('Type DELETE to confirm', 'error'); return; }
    if (hasPassword && !deletePassword) { showToast('Enter your password to confirm', 'error'); return; }
    setDeleteLoading(true);
    const res = await apiFetch('/api/account/delete', { method: 'DELETE', body: hasPassword ? { password: deletePassword } : {} });
    if (!res.ok) {
      showToast(res.message, 'error');
      setDeleteLoading(false);
      return;
    }
    try {
      Object.keys(localStorage).filter(k => k.startsWith('politicon')).forEach(k => localStorage.removeItem(k));
    } catch { /* storage unavailable */ }
    await supabase.auth.signOut({ scope: 'local' });
    router.push('/');
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
                      </div>
                      <SaveButton onClick={saveProfile} loading={saving} />
                    </SectionCard>

                    <SectionCard title="Email Address" subtitle={`Currently ${email}`}>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <label htmlFor="new-email" className="sr-only">New email address</label>
                        <input
                          id="new-email"
                          type="email"
                          autoComplete="email"
                          value={newEmail}
                          onChange={e => setNewEmail(e.target.value)}
                          placeholder="New email address"
                          className="input-glass flex-1 px-4 py-3 text-sm rounded-xl"
                        />
                        <button
                          type="button"
                          onClick={changeEmail}
                          disabled={emailLoading || !newEmail.trim() || newEmail.trim().toLowerCase() === email.toLowerCase()}
                          className="px-5 py-3 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 transition-all disabled:opacity-40"
                        >
                          {emailLoading ? 'Sending…' : 'Change email'}
                        </button>
                      </div>
                      <p className="text-xs text-text-muted mt-2">We&apos;ll email a confirmation link. Your email changes once you confirm it.</p>
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
                            maxLength={100}
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
                          <SelectField value={educationStage} onChange={setEducationStage} options={EDUCATION_LEVELS} />
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Economic Position" subtitle="Core data for tax liability, wage effects and employment impact estimates">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <FieldLabel>Employment Status</FieldLabel>
                          <SelectField value={employmentStatus} onChange={setEmploymentStatus} options={EMPLOYMENT_STATUSES} />
                        </div>
                        <div>
                          <FieldLabel>Occupation Category</FieldLabel>
                          <SelectField value={occupationCategory} onChange={setOccupationCategory} options={OCCUPATIONS} />
                        </div>
                        <div>
                          <FieldLabel>Annual Household Income</FieldLabel>
                          <SelectField value={incomeRange} onChange={setIncomeRange} options={INCOME_RANGES} />
                        </div>
                        <div>
                          <FieldLabel>Tax Filing Status</FieldLabel>
                          <SelectField value={filingStatus} onChange={setFilingStatus} options={FILING_STATUSES} />
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Life Situation" subtitle="Housing, debt and dependents shape which policies most directly affect you">
                      <div className="space-y-5">
                        <div>
                          <FieldLabel>Housing Situation</FieldLabel>
                          <SelectField value={housingSituation} onChange={setHousingSituation} options={HOUSING_SITUATIONS} />
                        </div>
                        {isHomeowner(housingSituation) && (
                          <div>
                            <FieldLabel>Home Value (optional)</FieldLabel>
                            <SelectField value={homeValueBand} onChange={setHomeValueBand} options={HOME_VALUE_BANDS} placeholder="Prefer not to say" />
                          </div>
                        )}
                        <div>
                          <FieldLabel>Debt Types (select all that apply)</FieldLabel>
                          <MultiChip options={DEBT_TYPES} selected={debtTypes} onChange={next => {
                            // "No debt" is exclusive with every other choice.
                            const added = next.find(v => !debtTypes.includes(v));
                            setDebtTypes(added === 'none' ? ['none'] : next.filter(v => v !== 'none'));
                          }} />
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
                          {hasDependents && (
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <FieldLabel>How many</FieldLabel>
                                <SelectField value={String(dependentsCount)} onChange={v => setDependentsCount(Number(v) || 1)}
                                  options={Array.from({ length: MAX_DEPENDENTS }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
                              </div>
                              <div>
                                <FieldLabel>Ages (optional)</FieldLabel>
                                <MultiChip options={DEPENDENT_AGE_BANDS} selected={dependentAgeBands} onChange={setDependentAgeBands} />
                              </div>
                            </div>
                          )}
                        </div>
                        <div>
                          <FieldLabel>Top Financial Concerns (up to {MAX_CONCERNS})</FieldLabel>
                          <MultiChip options={CONCERNS} selected={topFinancialConcerns} onChange={setTopFinancialConcerns} max={MAX_CONCERNS} />
                        </div>
                        <div>
                          <FieldLabel>Investments (optional)</FieldLabel>
                          <SelectField value={investments} onChange={setInvestments} options={INVESTMENT_TYPES} placeholder="Prefer not to say" />
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
                        {hasPassword && <div>
                          <FieldLabel>Current Password</FieldLabel>
                          <input
                            type="password"
                            autoComplete="current-password"
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                            placeholder="Your current password"
                            className="input-glass w-full px-4 py-3 text-sm rounded-xl"
                          />
                        </div>}
                        <div>
                          <FieldLabel>New Password</FieldLabel>
                          <input
                            type="password"
                            autoComplete="new-password"
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
                        disabled={(hasPassword && !currentPassword) || !newPassword || newPassword !== confirmPassword || newPassword.length < 8}
                      />
                    </SectionCard>

                    <SectionCard title="Sessions" subtitle="Signed in somewhere you don't recognize? End every other session.">
                      <button
                        onClick={signOutOthers}
                        disabled={signOutOthersLoading}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-text-primary text-sm font-medium hover:bg-white/10 transition-all disabled:opacity-50"
                      >
                        {signOutOthersLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                        Sign out all other devices
                      </button>
                    </SectionCard>

                    <SectionCard title="Your Data" subtitle="Download everything Politicon stores about you">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <a
                          href="/api/account/export"
                          download
                          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-text-primary text-sm font-medium hover:bg-white/10 transition-all"
                        >
                          Download my data (JSON)
                        </a>
                        <Link href="/privacy" className="text-sm text-primary hover:underline underline-offset-2">How we use your data</Link>
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
                              {hasPassword && <div>
                                <FieldLabel>Your password</FieldLabel>
                                <input
                                  type="password"
                                  autoComplete="current-password"
                                  value={deletePassword}
                                  onChange={e => setDeletePassword(e.target.value)}
                                  placeholder="Confirm with your password"
                                  className="input-glass w-full px-4 py-3 text-sm rounded-xl border border-red-500/20 focus:border-red-500/50"
                                />
                              </div>}
                              <button
                                onClick={deleteAccount}
                                disabled={deleteConfirm !== 'DELETE' || (hasPassword && !deletePassword) || deleteLoading}
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
