'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, LogOut, Mail, RefreshCw, Save } from 'lucide-react';
import { friendlyAuthError } from '@/components/auth/authErrors';
import Button from '@/components/ui/Button';
import type { ToastType } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { AccountRow, FIELD, FieldLabel, WAITING_SUBMIT } from './AccountParts';
import AccountDelete from './AccountDelete';
import AccountPassword from './AccountPassword';
import { SettingsPane } from './SettingsSection';
import { isValidEmail, type SettingsAccount } from './settingsModel';

/*
 * Settings → Account: the name shown across Politicon, the sign-in email and
 * password, other sessions, a copy of your data, and deleting the account.
 * Each form saves on its own and reports through the page's toast. A button
 * that's busy stays focusable (aria-disabled, not disabled, which would drop
 * keyboard focus); a form that empties once it's done moves focus to its field.
 */

export interface AccountSectionProps {
  account: SettingsAccount;
  /** The first name was saved (the page's header shows it). */
  onNameSaved: (_firstName: string) => void;
  notify: (_message: string, _type?: ToastType) => void;
}

/** Personal Information: the first name, kept in the auth profile and in user_profiles. */
function NameRow({ initialName, onSaved, notify }: { initialName: string; onSaved: (_name: string) => void; notify: AccountSectionProps['notify'] }) {
  const uid = useId();
  const id = `${uid}-first-name`;
  const [firstName, setFirstName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    if (saving) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await supabase.auth.updateUser({ data: { first_name: firstName } });
      const { data: updated, error } = await supabase.from('user_profiles').update({ first_name: firstName }).eq('id', user.id).select('id');
      if (error || !updated?.length) throw error || new Error('Profile not saved');
      onSaved(firstName);
      notify('Profile updated successfully', 'success');
    } catch {
      notify('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountRow title="Personal Information" description="Your display name shown across Politicon">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <FieldLabel htmlFor={id}>First Name</FieldLabel>
          <input
            id={id}
            type="text"
            autoComplete="given-name"
            maxLength={80}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Your first name"
            className={FIELD}
          />
        </div>
        <Button
          variant="secondary"
          onClick={saveProfile}
          aria-disabled={saving || undefined}
          aria-busy={saving || undefined}
          icon={saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          className="self-start sm:self-auto"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </AccountRow>
  );
}

/** Email Address: starts a change that finishes once the new address is confirmed. */
function EmailRow({ email, notify }: { email: string; notify: AccountSectionProps['notify'] }) {
  const uid = useId();
  const ids = { newEmail: `${uid}-new-email`, newEmailHint: `${uid}-new-email-hint` };
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const unchanged = !newEmail.trim() || newEmail.trim().toLowerCase() === email.toLowerCase();

  const changeEmail = async () => {
    if (loading) return;
    const next = newEmail.trim();
    if (!isValidEmail(next)) { notify('Enter a valid email address', 'error'); return; }
    setLoading(true);
    const { error } = await createClient().auth.updateUser(
      { email: next },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/settings` },
    );
    setLoading(false);
    if (error) { notify(friendlyAuthError(error, 'We couldn’t start the email change. Please try again.'), 'error'); return; }
    // The field empties (and the button waits for a new address): focus goes back to the field.
    field.current?.focus();
    setNewEmail('');
    notify(`Check ${next} for a confirmation link to finish the change.`, 'success');
  };

  return (
    <AccountRow
      title="Email Address"
      description={
        <>
          Currently <span className="font-medium text-ink">{email}</span>
        </>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={ids.newEmail} className="sr-only">New email address</label>
        <input
          ref={field}
          id={ids.newEmail}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="New email address"
          aria-describedby={ids.newEmailHint}
          className={`${FIELD} min-w-0 flex-1`}
        />
        <Button
          variant="secondary"
          onClick={changeEmail}
          disabled={!loading && unchanged}
          aria-disabled={loading || undefined}
          aria-busy={loading || undefined}
          icon={<Mail className="h-4 w-4" />}
          className={cn('self-start sm:self-auto', !loading && unchanged && WAITING_SUBMIT)}
        >
          {loading ? 'Sending…' : 'Change email'}
        </Button>
      </div>
      <p id={ids.newEmailHint} className="mt-2 text-meta text-muted">We&apos;ll email a confirmation link. Your email changes once you confirm it.</p>
    </AccountRow>
  );
}

/** Sessions: ends every session but this one. */
function SessionsRow({ notify }: { notify: AccountSectionProps['notify'] }) {
  const [loading, setLoading] = useState(false);
  const signOutOthers = async () => {
    if (loading) return;
    setLoading(true);
    const { error } = await createClient().auth.signOut({ scope: 'others' });
    setLoading(false);
    notify(error ? 'Could not sign out other devices. Please try again.' : 'Signed out of all other devices', error ? 'error' : 'success');
  };
  return (
    <AccountRow title="Sessions" description="Signed in somewhere you don't recognize? End every other session.">
      <Button
        variant="ghost"
        onClick={signOutOthers}
        aria-disabled={loading || undefined}
        aria-busy={loading || undefined}
        icon={loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      >
        Sign out all other devices
      </Button>
    </AccountRow>
  );
}

export default function AccountSection({ account, onNameSaved, notify }: AccountSectionProps) {
  return (
    <div className="space-y-6">
      <SettingsPane label="Who you are">
        <NameRow initialName={account.firstName} onSaved={onNameSaved} notify={notify} />
        <EmailRow email={account.email} notify={notify} />
      </SettingsPane>

      <SettingsPane label="Signing in">
        <AccountPassword email={account.email} hasPassword={account.hasPassword} notify={notify} />
        <SessionsRow notify={notify} />
      </SettingsPane>

      <SettingsPane>
        <AccountRow title="Your Data" description="Download everything Politicon stores about you">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
            {/* A plain link: the browser downloads the file the route sends. */}
            <a
              href="/api/account/export"
              download
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-fg/15 bg-raised/60 px-6 py-3 text-sm font-medium text-ink transition-colors duration-200 ease-civic hover:border-primary/40 hover:bg-raised"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download my data (JSON)
            </a>
            <Link href="/privacy" className="rounded text-sm text-primary-300 underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
              How we use your data
            </Link>
          </div>
        </AccountRow>
      </SettingsPane>

      <AccountDelete hasPassword={account.hasPassword} />
    </div>
  );
}
