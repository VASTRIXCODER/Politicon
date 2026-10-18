'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import FullPageLoader from '@/components/auth/FullPageLoader';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import Surface from '@/components/ui/Surface';
import { useToast } from '@/components/ui/Toast';
import { apiFetch } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import AccountSection from './_components/AccountSection';
import Experience from './_components/Experience';
import ProfileSection from './_components/ProfileSection';
import {
  EMPTY_PROFILE_DRAFT, PROFILE_INCOMPLETE_MESSAGE, PROFILE_SAVED_MESSAGE, draftFromRow, parseProfileDraft,
  type ProfileDraft,
} from './_components/ProfileModel';
import SettingsNav, { jumpToSection } from './_components/SettingsNav';
import { SECTION_SCROLL_MARGIN, SettingsSection } from './_components/SettingsSection';
import { initialsFor, isSettingsSection, noticeFor, sectionHeadingId, type SettingsAccount } from './_components/settingsModel';
import { useFocusClearance } from './_components/viewportClearance';

/*
 * Settings, one editorial page in three sections, in this order:
 *   Profile     the financial profile, "Your household" (ProfileSection)
 *   Experience  theme, visual effects, pause motion, sound, reading mode
 *   Account     name, email, password, sessions, your data, deleting the account
 * with a section nav beside them (a sticky bar under the navbar on phones,
 * which lets go while the profile's save bar follows the screen, so the two
 * don't box the form in).
 *
 * This file loads what the sections share (who is signed in, the saved
 * profile), saves the profile, owns the page's one toast and shows the
 * notices email links land with (?notice=…). Each section's own forms live
 * in app/settings/_components.
 *
 * No animation library: what moves here is CSS (the dialog that confirms
 * deleting the account brings motion/react with it, loaded on demand).
 */

const NO_ACCOUNT: SettingsAccount = { email: '', firstName: '', hasPassword: true };

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [account, setAccount] = useState<SettingsAccount>(NO_ACCOUNT);
  const [profile, setProfile] = useState<ProfileDraft>(EMPTY_PROFILE_DRAFT);
  const [saving, setSaving] = useState(false);
  // The profile's save bar is following the screen.
  const [profileStuck, setProfileStuck] = useState(false);
  const { toast, showToast } = useToast();
  // A control that takes keyboard focus under the navbar, the section bar, the save bar or the toast is scrolled clear.
  useFocusClearance();

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

    const providers = (user.app_metadata?.providers as string[] | undefined) || [user.app_metadata?.provider];
    const metadataName: string = user.user_metadata?.first_name || '';

    const { data, error: loadErr } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
    // Without the saved profile, saving would overwrite it with blanks.
    setLoadError(!!loadErr || !data);
    setAccount({
      email: user.email || '',
      // OAuth-only accounts have no password to confirm with.
      hasPassword: providers.includes('email'),
      firstName: data?.first_name || metadataName,
    });
    if (data) setProfile(draftFromRow(data));
    setLoading(false);
  };

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

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  // Once the page (and its toast) is up: show a notice from an email link,
  // and go to the section a link asked for (/settings#account).
  const arrived = useRef(false);
  useEffect(() => {
    if (loading || loadError || arrived.current) return;
    arrived.current = true;
    const section = window.location.hash.slice(1);
    if (isSettingsSection(section)) jumpToSection(section, { smooth: false });
    const notice = noticeFor(window.location.search);
    if (!notice) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    showToast(notice.message, notice.type);
  }, [loading, loadError, showToast]);

  // ── save the financial profile ───────────────────────────────────────────
  // ProfileSection hands over the answers on screen; it resolves true once saved.
  const saveFinancial = async (draft: ProfileDraft) => {
    const parsed = parseProfileDraft(draft);
    if (!parsed.success) {
      showToast(PROFILE_INCOMPLETE_MESSAGE, 'error');
      return false;
    }
    setSaving(true);
    const res = await apiFetch('/api/profile', { method: 'PUT', body: { profile: parsed.data } });
    setSaving(false);
    showToast(res.ok ? PROFILE_SAVED_MESSAGE : res.message, res.ok ? 'success' : 'error');
    return res.ok;
  };

  if (!loading && loadError) {
    return (
      <AppShell mainClassName="flex min-h-[70vh] items-center justify-center">
        <Surface role="alert" pad="lg" className="max-w-md text-center">
          <h1 className="mb-2 font-display text-2xl font-medium text-ink">We couldn&apos;t load your settings</h1>
          <p className="mb-6 text-sm text-muted">Nothing has been changed. Check your connection and try again.</p>
          <Button variant="secondary" onClick={() => loadProfile()} icon={<RefreshCw className="h-4 w-4" />}>
            Try again
          </Button>
        </Surface>
      </AppShell>
    );
  }

  if (loading) return <FullPageLoader label="Loading your settings…" />;

  const { email, firstName } = account;

  return (
    <AppShell>
      {/* While the profile's save bar follows the screen, the toast rises above it (viewportClearance.ts). */}
      <div data-settings-toast="" className="contents [&>.fixed]:mb-[var(--settings-bottom-clearance,0px)]">{toast}</div>

      <PageHeader
        eyebrow="Your account"
        title="Settings"
        lede="Manage your profile, preferences and account."
        actions={
          // Who these settings belong to.
          <div className="flex min-w-0 max-w-full items-center gap-3 rounded-full border border-fg/10 bg-raised/60 py-1.5 pl-1.5 pr-5">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-primary/25 bg-[radial-gradient(circle_at_50%_0%,rgb(var(--c-violet)/0.22),rgb(var(--c-violet)/0.08)_70%)]"
            >
              <span className="font-mono-data text-xs font-semibold tracking-wide text-primary-300">{initialsFor(firstName, email)}</span>
            </span>
            <span className="min-w-0">
              <span className="sr-only">Signed in as </span>
              <span className="block truncate text-sm font-medium text-ink">{firstName || 'User'}</span>
              <span className="block truncate text-meta text-muted">{email}</span>
            </span>
          </div>
        }
      />

      <div className="mt-10 lg:mt-14 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-12">
        {/* Phones: a bar that sticks under the floating navbar (not while the save bar holds the bottom). lg: a column that stays beside the sections. */}
        <SettingsNav className={cn('z-20 lg:sticky lg:top-28', !profileStuck && 'sticky top-[4.75rem]')} />

        <div className="mt-8 min-w-0 space-y-20 lg:mt-0 lg:space-y-24">
          <ProfileSection
            profile={profile}
            saving={saving}
            onSave={saveFinancial}
            onStuckChange={setProfileStuck}
            headingId={sectionHeadingId('profile')}
            className={SECTION_SCROLL_MARGIN}
            footer={
              // Starting over belongs with the profile it rebuilds.
              <Surface pad="none" variant="outline" className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <div>
                  <h3 className="text-[0.9375rem] font-semibold text-ink">Re-run Onboarding</h3>
                  <p className="mt-1 text-sm text-muted">Walk through the full profile setup again from scratch</p>
                </div>
                <Button href="/onboarding" variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} className="flex-shrink-0 self-start sm:self-auto">
                  Re-run
                </Button>
              </Surface>
            }
          />

          <SettingsSection
            id="experience"
            title={<>Your <em>experience</em></>}
            lede="How Politicon looks, moves, sounds and reads. The first four are saved on this device; reading mode follows you everywhere."
          >
            <Experience />
          </SettingsSection>

          <SettingsSection
            id="account"
            title={<>Your <em>account</em></>}
            lede="Your name, how you sign in, a copy of everything we store, and closing your account."
          >
            <AccountSection
              account={account}
              onNameSaved={(name) => setAccount((a) => ({ ...a, firstName: name }))}
              notify={showToast}
            />
          </SettingsSection>
        </div>
      </div>
    </AppShell>
  );
}
