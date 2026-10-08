'use client';

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User, Briefcase, DollarSign, Shield,
  Eye, Zap, ChevronRight, Check, AlertTriangle,
  Lock, Trash2, RefreshCw, Save, ArrowLeft, BookOpen
} from 'lucide-react';
import {
  AGE_RANGES, CONCERNS, DEBT_TYPES, DEPENDENT_AGE_BANDS, EDUCATION_LEVELS, EMPLOYMENT_STATUSES,
  FILING_STATUSES, HOME_VALUE_BANDS, HOUSING_SITUATIONS, INCOME_RANGES, INVESTMENT_TYPES, MAX_CONCERNS,
  MAX_DEPENDENTS, OCCUPATIONS, US_STATES, isHomeowner, validOnly, validOrEmpty,
} from '@/lib/profileOptions';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { FinancialProfileSchema } from '@/lib/profileSchema';
import { apiFetch } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Navbar from '@/components/layout/Navbar';
import { useReadingMode } from '@/components/providers/ReadingModeProvider';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import { Tabs, TabList, Tab, TabPanel, tabId } from '@/components/ui/Tabs';
import RadioGroup from '@/components/forms/RadioGroup';
import FullPageLoader from '@/components/auth/FullPageLoader';
import { friendlyAuthError } from '@/components/auth/authErrors';

// ─── constants ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'financial', label: 'Financial Profile', icon: DollarSign },
  { id: 'preferences', label: 'Preferences', icon: Eye },
  { id: 'security', label: 'Security', icon: Shield },
] as const;
type TabId = (typeof TABS)[number]['id'];
const SETTINGS_TABS_ID = 'settings';

const READING_MODES = [
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
];

const DEPENDENT_OPTIONS = [
  { value: 'no', label: 'No dependents' },
  { value: 'yes', label: 'I have dependents' },
] as const;

// Messages for ?notice=… (set by email links that land here).
const NOTICES: Record<string, { message: string; type: 'success' | 'error' }> = {
  email_change_pending: { message: 'Address confirmed. To finish changing your email, also open the link we sent to your other address.', type: 'success' },
  link_invalid: { message: 'That link is invalid or has expired. You’re still signed in.', type: 'error' },
};

const LABEL_CLASS = 'block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2';

// ─── tiny helpers ─────────────────────────────────────────────────────────────

/** Visible label for one form control. */
function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className={LABEL_CLASS}>{children}</label>;
}

/** Visible name for a group of buttons (chips, radios), referenced by aria-labelledby. */
function GroupLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return <p id={id} className={LABEL_CLASS}>{children}</p>;
}

function SelectField({ id, value, onChange, options, disabled, placeholder = '— Select —' }: {
  id: string; value: string; onChange: (_v: string) => void;
  options: readonly { value: string; label: string }[]; disabled?: boolean; placeholder?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="input-glass w-full px-4 py-3 text-sm rounded-xl bg-surface/60 border border-white/10 text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Pick-several chips: a labelled group of toggle buttons (aria-pressed). */
function MultiChip({ labelledBy, options, selected, onChange, max }: {
  labelledBy: string;
  options: readonly { value: string; label: string }[];
  selected: string[]; onChange: (_v: string[]) => void; max?: number;
}) {
  const full = !!max && selected.length >= max;
  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter(x => x !== val));
    } else {
      if (full) return;
      onChange([...selected, val]);
    }
  };
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {options.map(o => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={!active && full}
            onClick={() => toggle(o.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              active
                ? 'bg-primary/20 border-primary/50 text-primary-300'
                : 'border-white/10 text-text-muted hover:border-white/20 hover:text-text-primary'
            }`}
          >
            {active && <Check className="inline w-3 h-3 mr-1" aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { mode: readingMode, setMode: setReadingMode } = useReadingMode();

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();
  // The tab list is vertical beside the content on large screens, a scrolling row above it on small ones.
  const [verticalTabs, setVerticalTabs] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setVerticalTabs(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setVerticalTabs(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const uid = useId();
  const ids = {
    firstName: `${uid}-first-name`, newEmail: `${uid}-new-email`, newEmailHint: `${uid}-new-email-hint`,
    state: `${uid}-state`, city: `${uid}-city`, ageRange: `${uid}-age`, education: `${uid}-education`,
    employment: `${uid}-employment`, occupation: `${uid}-occupation`, income: `${uid}-income`, filing: `${uid}-filing`,
    housing: `${uid}-housing`, homeValue: `${uid}-home-value`, debts: `${uid}-debts`, dependents: `${uid}-dependents`,
    dependentsCount: `${uid}-dependents-count`, dependentAges: `${uid}-dependent-ages`, concerns: `${uid}-concerns`,
    investments: `${uid}-investments`,
    currentPassword: `${uid}-current-password`, newPassword: `${uid}-new-password`, confirmPassword: `${uid}-confirm-password`,
    passwordMismatch: `${uid}-password-mismatch`, passwordStrength: `${uid}-password-strength`,
    deleteZone: `${uid}-delete-zone`, deleteConfirm: `${uid}-delete-confirm`, deletePassword: `${uid}-delete-password`,
  };

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


  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      await loadProfileData();
    } catch {
      setLoadError(true);
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProfileData = async () => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!user) {
      // A network or server failure isn't a sign-out: offer the retry card.
      if (userError && (isAuthRetryableFetchError(userError) || (userError.status ?? 0) >= 500)) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      router.replace('/auth/signin');
      return;
    }

    setEmail(user.email || '');
    const providers = (user.app_metadata?.providers as string[] | undefined) || [user.app_metadata?.provider];
    setHasPassword(providers.includes('email'));
    setFirstName(user.user_metadata?.first_name || '');

    const { data, error: loadErr } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
    // Without the saved profile, saving would overwrite it with blanks.
    setLoadError(!!loadErr || !data);
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
  };

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Show a notice from an email link once the page (and its toast) is up.
  const noticeShown = useRef(false);
  useEffect(() => {
    if (loading || loadError || noticeShown.current) return;
    noticeShown.current = true;
    const notice = NOTICES[new URLSearchParams(window.location.search).get('notice') || ''];
    if (!notice) return;
    window.history.replaceState(null, '', window.location.pathname);
    showToast(notice.message, notice.type);
  }, [loading, loadError, showToast]);

  // ── save profile (name) ──────────────────────────────────────────────────
  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await supabase.auth.updateUser({ data: { first_name: firstName } });
      const { data: updated, error } = await supabase.from('user_profiles').update({ first_name: firstName }).eq('id', user.id).select('id');
      if (error || !updated?.length) throw error || new Error('Profile not saved');
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
    if (error) { showToast(friendlyAuthError(error, 'We couldn’t start the email change. Please try again.'), 'error'); return; }
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
        if (reauthError) {
          const wrongPassword = reauthError.code === 'invalid_credentials' || reauthError.status === 400;
          showToast(wrongPassword ? 'Your current password is incorrect' : friendlyAuthError(reauthError, 'Your current password is incorrect'), 'error');
          return;
        }
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { showToast(friendlyAuthError(error, 'Failed to update password'), 'error'); return; }
      // Any other device signed in with the old password is signed out.
      await supabase.auth.signOut({ scope: 'others' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated. Other devices have been signed out.', 'success');
    } catch (err: unknown) {
      showToast(friendlyAuthError(err, 'Failed to update password'), 'error');
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


  if (!loading && loadError) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4">
        <AmbientBackground />
        <main id="main" tabIndex={-1} className="relative z-10">
          <div role="alert" className="glass rounded-2xl p-8 max-w-md text-center">
            <h1 className="font-display text-xl font-semibold text-text-primary mb-2">We couldn&apos;t load your settings</h1>
            <p className="text-sm text-text-muted mb-6">Nothing has been changed. Check your connection and try again.</p>
            <button type="button" onClick={() => loadProfile()} className="bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary-300 px-5 py-2.5 rounded-xl text-sm font-medium">
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (loading) return <FullPageLoader label="Loading your settings…" />;

  const initials = firstName ? firstName.slice(0, 2).toUpperCase() : email.slice(0, 2).toUpperCase();
  const passwordMismatch = !!newPassword && !!confirmPassword && newPassword !== confirmPassword;
  const panelMotion = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } };

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <Navbar />
      <main id="main" tabIndex={-1} className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="w-9 h-9 rounded-xl glass border-white/10 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">Settings</h1>
            <p className="text-sm text-text-muted">Manage your account, profile and preferences</p>
          </div>
        </div>

        <Tabs id={SETTINGS_TABS_ID} value={activeTab} onValueChange={setActiveTab} orientation={verticalTabs ? 'vertical' : 'horizontal'}
          className="flex flex-col lg:flex-row gap-6">

          {/* Sidebar */}
          <div className="lg:w-56 flex-shrink-0">
            {/* Avatar card */}
            <div className="glass border-white/10 rounded-2xl p-5 mb-4 flex flex-col items-center text-center">
              <div aria-hidden="true" className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-secondary/20 border border-primary/30 flex items-center justify-center mb-3">
                <span className="font-display font-bold text-xl text-primary-300">{initials}</span>
              </div>
              <p className="font-medium text-text-primary text-sm">{firstName || 'User'}</p>
              <p className="text-xs text-text-muted truncate max-w-full">{email}</p>
            </div>

            {/* Tab list: a scrolling row on small screens, a column beside the content on large ones */}
            <TabList label="Settings sections" className="pb-2 lg:pb-0 lg:flex-col lg:items-stretch lg:overflow-visible">
              {TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <Tab
                    key={tab.id}
                    value={tab.id}
                    icon={<Icon className="w-4 h-4" />}
                    className="gap-3 py-3 border border-transparent hover:bg-white/5 aria-selected:border-primary/30 aria-selected:hover:bg-primary/15 lg:w-full group"
                  >
                    <span>{tab.label}</span>
                    <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 ml-auto hidden lg:group-aria-selected:block" />
                  </Tab>
                );
              })}
            </TabList>
          </div>

          {/* Panels */}
          <div className="flex-1 min-w-0">

            {/* ── PROFILE TAB ── */}
            <TabPanel value="profile">
              <m.div {...panelMotion} className="space-y-4">
                <SectionCard title="Personal Information" subtitle="Your display name shown across Politicon">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel htmlFor={ids.firstName}>First Name</FieldLabel>
                      <input
                        id={ids.firstName}
                        type="text"
                        autoComplete="given-name"
                        maxLength={80}
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
                    <label htmlFor={ids.newEmail} className="sr-only">New email address</label>
                    <input
                      id={ids.newEmail}
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="New email address"
                      aria-describedby={ids.newEmailHint}
                      className="input-glass flex-1 px-4 py-3 text-sm rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={changeEmail}
                      disabled={emailLoading || !newEmail.trim() || newEmail.trim().toLowerCase() === email.toLowerCase()}
                      className="px-5 py-3 rounded-xl bg-primary/20 border border-primary/30 text-primary-300 text-sm font-medium hover:bg-primary/30 transition-all disabled:opacity-40"
                    >
                      {emailLoading ? 'Sending…' : 'Change email'}
                    </button>
                  </div>
                  <p id={ids.newEmailHint} className="text-xs text-text-muted mt-2">We&apos;ll email a confirmation link. Your email changes once you confirm it.</p>
                </SectionCard>

                <InfoCard
                  icon={<Briefcase className="w-4 h-4 text-primary" />}
                  title="Financial Profile"
                  description="Your demographics and financial data are what make AI analysis personalized to you. Update them in the Financial Profile tab."
                  // The button's panel unmounts on the switch, so focus follows to the Financial tab.
                  action={{ label: 'Go to Financial Profile', onClick: () => {
                    setActiveTab('financial');
                    document.getElementById(tabId(SETTINGS_TABS_ID, 'financial'))?.focus();
                  } }}
                />
              </m.div>
            </TabPanel>

            {/* ── FINANCIAL PROFILE TAB ── */}
            <TabPanel value="financial">
              <m.div {...panelMotion} className="space-y-4">
                <div className="glass border-amber-500/20 bg-amber-500/5 rounded-2xl px-5 py-4 flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-amber-300/80">Changes here directly affect how the AI calculates your policy impact. Keep this accurate for best results.</p>
                </div>

                <SectionCard title="Location" subtitle="Used to factor in state taxes, cost of living and regional policies">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel htmlFor={ids.state}>State</FieldLabel>
                      <SelectField id={ids.state} value={state} onChange={setState} options={US_STATES.map(s => ({ value: s, label: s }))} />
                    </div>
                    <div>
                      <FieldLabel htmlFor={ids.city}>City (optional)</FieldLabel>
                      <input
                        id={ids.city}
                        type="text"
                        autoComplete="address-level2"
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
                      <FieldLabel htmlFor={ids.ageRange}>Age Range</FieldLabel>
                      <SelectField id={ids.ageRange} value={ageRange} onChange={setAgeRange} options={AGE_RANGES} />
                    </div>
                    <div>
                      <FieldLabel htmlFor={ids.education}>Education Level</FieldLabel>
                      <SelectField id={ids.education} value={educationStage} onChange={setEducationStage} options={EDUCATION_LEVELS} />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Economic Position" subtitle="Core data for tax liability, wage effects and employment impact estimates">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel htmlFor={ids.employment}>Employment Status</FieldLabel>
                      <SelectField id={ids.employment} value={employmentStatus} onChange={setEmploymentStatus} options={EMPLOYMENT_STATUSES} />
                    </div>
                    <div>
                      <FieldLabel htmlFor={ids.occupation}>Occupation Category</FieldLabel>
                      <SelectField id={ids.occupation} value={occupationCategory} onChange={setOccupationCategory} options={OCCUPATIONS} />
                    </div>
                    <div>
                      <FieldLabel htmlFor={ids.income}>Annual Household Income</FieldLabel>
                      <SelectField id={ids.income} value={incomeRange} onChange={setIncomeRange} options={INCOME_RANGES} />
                    </div>
                    <div>
                      <FieldLabel htmlFor={ids.filing}>Tax Filing Status</FieldLabel>
                      <SelectField id={ids.filing} value={filingStatus} onChange={setFilingStatus} options={FILING_STATUSES} />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Life Situation" subtitle="Housing, debt and dependents shape which policies most directly affect you">
                  <div className="space-y-5">
                    <div>
                      <FieldLabel htmlFor={ids.housing}>Housing Situation</FieldLabel>
                      <SelectField id={ids.housing} value={housingSituation} onChange={setHousingSituation} options={HOUSING_SITUATIONS} />
                    </div>
                    {isHomeowner(housingSituation) && (
                      <div>
                        <FieldLabel htmlFor={ids.homeValue}>Home Value (optional)</FieldLabel>
                        <SelectField id={ids.homeValue} value={homeValueBand} onChange={setHomeValueBand} options={HOME_VALUE_BANDS} placeholder="Prefer not to say" />
                      </div>
                    )}
                    <div>
                      <GroupLabel id={ids.debts}>Debt Types (select all that apply)</GroupLabel>
                      <MultiChip labelledBy={ids.debts} options={DEBT_TYPES} selected={debtTypes} onChange={next => {
                        // "No debt" is exclusive with every other choice.
                        const added = next.find(v => !debtTypes.includes(v));
                        setDebtTypes(added === 'none' ? ['none'] : next.filter(v => v !== 'none'));
                      }} />
                    </div>
                    <div>
                      <GroupLabel id={ids.dependents}>Dependents</GroupLabel>
                      <RadioGroup
                        labelledBy={ids.dependents}
                        options={DEPENDENT_OPTIONS}
                        value={hasDependents ? 'yes' : 'no'}
                        onChange={v => setHasDependents(v === 'yes')}
                        className="flex gap-3"
                        optionClassName={selected => `flex-1 py-2.5 px-4 rounded-xl text-sm border text-center ${
                          selected
                            ? 'bg-primary/15 border-primary/40 text-primary-300'
                            : 'border-white/10 text-text-muted hover:border-white/20'
                        }`}
                        renderOption={(o, selected) => (
                          <>
                            {selected && <Check className="inline w-3.5 h-3.5 mr-1.5" aria-hidden="true" />}
                            {o.label}
                          </>
                        )}
                      />
                      {hasDependents && (
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <FieldLabel htmlFor={ids.dependentsCount}>How many</FieldLabel>
                            <SelectField id={ids.dependentsCount} value={String(dependentsCount)} onChange={v => setDependentsCount(Number(v) || 1)}
                              options={Array.from({ length: MAX_DEPENDENTS }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
                          </div>
                          <div>
                            <GroupLabel id={ids.dependentAges}>Ages (optional)</GroupLabel>
                            <MultiChip labelledBy={ids.dependentAges} options={DEPENDENT_AGE_BANDS} selected={dependentAgeBands} onChange={setDependentAgeBands} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <GroupLabel id={ids.concerns}>Top Financial Concerns (up to {MAX_CONCERNS})</GroupLabel>
                      <MultiChip labelledBy={ids.concerns} options={CONCERNS} selected={topFinancialConcerns} onChange={setTopFinancialConcerns} max={MAX_CONCERNS} />
                    </div>
                    <div>
                      <FieldLabel htmlFor={ids.investments}>Investments (optional)</FieldLabel>
                      <SelectField id={ids.investments} value={investments} onChange={setInvestments} options={INVESTMENT_TYPES} placeholder="Prefer not to say" />
                    </div>
                  </div>
                </SectionCard>

                <SaveButton onClick={saveFinancial} loading={saving} label="Save Financial Profile" />
              </m.div>
            </TabPanel>

            {/* ── PREFERENCES TAB ── */}
            <TabPanel value="preferences">
              <m.div {...panelMotion} className="space-y-4">
                <SectionCard title="Reading Mode" subtitle="Controls how complex the AI analysis language is across the entire app">
                  <RadioGroup
                    label="Reading mode"
                    options={READING_MODES}
                    value={readingMode}
                    onChange={v => { if (v) setReadingMode(v); }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                    optionClassName={selected => `relative p-5 rounded-2xl border ${
                      selected ? 'bg-primary/10 border-primary/40' : 'border-white/10 hover:border-white/20 hover:bg-white/3'
                    }`}
                    renderOption={(o, selected) => {
                      const opt = READING_MODES.find(r => r.value === o.value)!;
                      return (
                        <>
                          {selected && (
                            <span aria-hidden="true" className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </span>
                          )}
                          <span aria-hidden="true" className={`block mb-3 ${selected ? 'text-primary-300' : 'text-text-muted'}`}>
                            {opt.icon}
                          </span>
                          <span className="block font-semibold text-sm text-text-primary mb-1">{opt.label}</span>
                          <span className="block text-xs text-text-muted leading-relaxed">{opt.description}</span>
                        </>
                      );
                    }}
                  />
                  <div className="mt-4 flex items-center gap-2 text-xs text-text-muted">
                    <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    Reading mode is saved automatically and synced across devices
                  </div>
                </SectionCard>

                <SectionCard title="Analysis Defaults" subtitle="Control how policy analysis behaves">
                  <div className="flex items-center justify-between gap-4 py-2">
                    <div>
                      <p className="text-sm font-medium text-text-primary">Re-run Onboarding</p>
                      <p className="text-xs text-text-muted mt-0.5">Walk through the full profile setup again from scratch</p>
                    </div>
                    <Button href="/onboarding" variant="ghost" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />}
                      className="flex-shrink-0 text-text-muted hover:text-text-primary">
                      Re-run
                    </Button>
                  </div>
                </SectionCard>
              </m.div>
            </TabPanel>

            {/* ── SECURITY TAB ── */}
            <TabPanel value="security">
              <m.div {...panelMotion} className="space-y-4">
                <SectionCard title="Change Password" subtitle="Choose a strong password you don't use elsewhere">
                  <div className="space-y-4">
                    {hasPassword && <div>
                      <FieldLabel htmlFor={ids.currentPassword}>Current Password</FieldLabel>
                      <input
                        id={ids.currentPassword}
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="Your current password"
                        className="input-glass w-full px-4 py-3 text-sm rounded-xl"
                      />
                    </div>}
                    <div>
                      <FieldLabel htmlFor={ids.newPassword}>New Password</FieldLabel>
                      <input
                        id={ids.newPassword}
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        aria-describedby={newPassword ? ids.passwordStrength : undefined}
                        className="input-glass w-full px-4 py-3 text-sm rounded-xl"
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={ids.confirmPassword}>Confirm New Password</FieldLabel>
                      <input
                        id={ids.confirmPassword}
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        aria-invalid={passwordMismatch || undefined}
                        aria-describedby={passwordMismatch ? ids.passwordMismatch : undefined}
                        className="input-glass w-full px-4 py-3 text-sm rounded-xl"
                      />
                      {passwordMismatch && (
                        <p id={ids.passwordMismatch} className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Passwords do not match
                        </p>
                      )}
                    </div>
                    <PasswordStrength id={ids.passwordStrength} password={newPassword} />
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
                    type="button"
                    onClick={signOutOthers}
                    disabled={signOutOthersLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-text-primary text-sm font-medium hover:bg-white/10 transition-all disabled:opacity-50"
                  >
                    {signOutOthersLoading && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
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
                    <Link href="/privacy" className="text-sm text-primary-300 hover:underline underline-offset-2 rounded">How we use your data</Link>
                  </div>
                </SectionCard>

                {/* Danger Zone */}
                <div className="glass border-red-500/20 rounded-2xl overflow-hidden">
                  <h2>
                    <button
                      type="button"
                      onClick={() => setShowDeleteZone(v => !v)}
                      aria-expanded={showDeleteZone}
                      aria-controls={ids.deleteZone}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-red-500/5 transition-colors rounded-2xl"
                    >
                      <span className="flex items-center gap-3">
                        <Trash2 className="w-4 h-4 text-red-400" aria-hidden="true" />
                        <span className="text-left">
                          <span className="block text-sm font-semibold text-red-400">Delete Account</span>
                          <span className="block text-xs text-text-muted font-normal">Permanently delete your account and all data</span>
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className={`w-4 h-4 text-red-400/60 transition-transform ${showDeleteZone ? 'rotate-90' : ''}`} />
                    </button>
                  </h2>

                  <AnimatePresence initial={false}>
                    {showDeleteZone && (
                      <m.div
                        id={ids.deleteZone}
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
                            <FieldLabel htmlFor={ids.deleteConfirm}>Type DELETE to confirm</FieldLabel>
                            <input
                              id={ids.deleteConfirm}
                              type="text"
                              autoComplete="off"
                              autoCapitalize="characters"
                              spellCheck={false}
                              value={deleteConfirm}
                              onChange={e => setDeleteConfirm(e.target.value)}
                              placeholder="DELETE"
                              className="input-glass w-full px-4 py-3 text-sm rounded-xl border border-red-500/20 focus:border-red-500/50"
                            />
                          </div>
                          {hasPassword && <div>
                            <FieldLabel htmlFor={ids.deletePassword}>Your password</FieldLabel>
                            <input
                              id={ids.deletePassword}
                              type="password"
                              autoComplete="current-password"
                              value={deletePassword}
                              onChange={e => setDeletePassword(e.target.value)}
                              placeholder="Confirm with your password"
                              className="input-glass w-full px-4 py-3 text-sm rounded-xl border border-red-500/20 focus:border-red-500/50"
                            />
                          </div>}
                          <button
                            type="button"
                            onClick={deleteAccount}
                            disabled={deleteConfirm !== 'DELETE' || (hasPassword && !deletePassword) || deleteLoading}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {deleteLoading ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
                            {deleteLoading ? 'Deleting…' : 'Permanently Delete My Account'}
                          </button>
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              </m.div>
            </TabPanel>
          </div>
        </Tabs>
      </main>

      {toast}
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="glass border-white/10 rounded-2xl p-6">
      <div className="mb-5">
        <h2 className="font-display font-semibold text-text-primary text-base">{title}</h2>
        <p className="text-xs text-text-muted mt-1">{subtitle}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function InfoCard({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="glass border-white/8 rounded-2xl p-5 flex gap-4 items-start">
      <div aria-hidden="true" className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">{description}</p>
        {action && (
          <button type="button" onClick={action.onClick} className="mt-3 text-xs text-primary-300 hover:text-text-primary font-medium flex items-center gap-1 transition-colors rounded">
            {action.label} <ChevronRight className="w-3 h-3" aria-hidden="true" />
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
      <Button
        onClick={onClick}
        disabled={loading || disabled}
        aria-busy={loading || undefined}
        icon={loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : (icon || <Save className="w-4 h-4" />)}
        className="px-5 py-2.5"
      >
        {loading ? 'Saving…' : label}
      </Button>
    </div>
  );
}

function PasswordStrength({ id, password }: { id: string; password: string }) {
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
    <div id={id}>
      <div className="flex gap-1 mb-2" aria-hidden="true">
        {[1,2,3,4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? color : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">Password strength: <span className={score >= 3 ? 'text-emerald-400' : 'text-amber-400'}>{label}</span></p>
        <ul className="flex flex-wrap gap-3">
          {checks.map(c => (
            <li key={c.label} className={`text-xs ${c.pass ? 'text-emerald-400' : 'text-text-muted'}`}>
              <span aria-hidden="true">{c.pass ? '✓' : '·'} </span>
              <span className="sr-only">{c.pass ? 'Has' : 'Missing'}: </span>
              {c.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
