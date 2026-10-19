'use client';

import { useId, useRef, useState } from 'react';
import { AlertTriangle, Check, Lock, RefreshCw } from 'lucide-react';
import { friendlyAuthError } from '@/components/auth/authErrors';
import Button from '@/components/ui/Button';
import type { ToastType } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { AccountRow, FIELD, FieldLabel, WAITING_SUBMIT } from './AccountParts';
import { PASSWORD_MIN_LENGTH, passwordChangeProblem, passwordStrength, type StrengthLabel } from './settingsModel';

/*
 * Account → Change password. Re-authenticates with the current password
 * first (so a hijacked session can't change it), then updates it and signs
 * every other device out. Accounts that only sign in with a provider have no
 * current password to give, so they set one directly.
 */

// The meter's light and the result word's colour (AA text tokens in both themes).
const TONE: Record<StrengthLabel, { bar: string; text: string }> = {
  Weak: { bar: 'bg-danger', text: 'text-danger' },
  Fair: { bar: 'bg-caution', text: 'text-caution' },
  Good: { bar: 'bg-primary', text: 'text-primary-300' },
  Strong: { bar: 'bg-primary shadow-[0_0_10px_rgb(var(--c-glow)/0.6)]', text: 'text-primary-300' },
};

/** The strength reading under the new password: four segments, the result in words, and each check. */
export function PasswordStrengthMeter({ id, password }: { id: string; password: string }) {
  if (!password) return null;
  const { checks, score, label } = passwordStrength(password);
  const tone = TONE[label];
  return (
    <div id={id} className="rounded-tile border border-fg/8 bg-fg/3 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Password strength: <span className={cn('font-semibold', tone.text)}>{label}</span>
        </p>
        <div className="flex w-24 flex-shrink-0 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300 ease-civic', i <= score ? tone.bar : 'bg-fg/12')}
            />
          ))}
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {checks.map((c) => (
          <li key={c.label} className={cn('flex items-center gap-2 text-meta', c.pass ? 'text-ink' : 'text-muted')}>
            <span
              aria-hidden="true"
              className={cn(
                'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border',
                c.pass ? 'border-primary-fill bg-primary-fill' : 'border-fg/30'
              )}
            >
              {c.pass && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
            </span>
            <span className="sr-only">{c.pass ? 'Has' : 'Missing'}: </span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AccountPassword({ email, hasPassword, notify }: {
  email: string;
  hasPassword: boolean;
  notify: (_message: string, _type?: ToastType) => void;
}) {
  const uid = useId();
  const ids = {
    title: `${uid}-password-title`,
    currentPassword: `${uid}-current-password`, newPassword: `${uid}-new-password`, confirmPassword: `${uid}-confirm-password`,
    passwordMismatch: `${uid}-password-mismatch`, passwordStrength: `${uid}-password-strength`,
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  const mismatch = !!newPassword && !!confirmPassword && newPassword !== confirmPassword;
  const incomplete = (hasPassword && !currentPassword) || !newPassword || newPassword !== confirmPassword || newPassword.length < PASSWORD_MIN_LENGTH;

  const changePassword = async () => {
    if (loading) return;
    const problem = passwordChangeProblem({ current: currentPassword, next: newPassword, confirm: confirmPassword, hasPassword });
    if (problem) { notify(problem, 'error'); return; }
    setLoading(true);
    const supabase = createClient();
    try {
      // Re-authenticate first so a hijacked session can't change the password.
      if (hasPassword) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
        if (reauthError) {
          const wrongPassword = reauthError.code === 'invalid_credentials' || reauthError.status === 400;
          notify(wrongPassword ? 'Your current password is incorrect.' : friendlyAuthError(reauthError, 'Your current password is incorrect.'), 'error');
          return;
        }
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { notify(friendlyAuthError(error, 'We couldn’t update your password. Please try again.'), 'error'); return; }
      // Any other device signed in with the old password is signed out.
      await supabase.auth.signOut({ scope: 'others' });
      // The fields empty (and the button waits for new ones): focus goes back to the first.
      firstField.current?.focus();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify('Password updated. Other devices have been signed out.', 'success');
    } catch (err: unknown) {
      notify(friendlyAuthError(err, 'We couldn’t update your password. Please try again.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccountRow title="Change password" titleId={ids.title} description="Choose a strong password you don't use elsewhere">
      <div className="space-y-4">
        {hasPassword && (
          <div>
            <FieldLabel htmlFor={ids.currentPassword}>Current password</FieldLabel>
            <input
              ref={firstField}
              id={ids.currentPassword}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Your current password"
              className={FIELD}
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={ids.newPassword}>New password</FieldLabel>
            <input
              ref={hasPassword ? undefined : firstField}
              id={ids.newPassword}
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              aria-describedby={newPassword ? ids.passwordStrength : undefined}
              className={FIELD}
            />
          </div>
          <div>
            <FieldLabel htmlFor={ids.confirmPassword}>Confirm new password</FieldLabel>
            <input
              id={ids.confirmPassword}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              aria-invalid={mismatch || undefined}
              aria-describedby={mismatch ? ids.passwordMismatch : undefined}
              className={FIELD}
            />
            {mismatch && (
              <p id={ids.passwordMismatch} className="mt-1.5 flex items-center gap-1.5 text-meta text-danger">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /> Passwords do not match
              </p>
            )}
          </div>
        </div>
        <PasswordStrengthMeter id={ids.passwordStrength} password={newPassword} />
        <div className="pt-1">
          <Button
            variant="secondary"
            onClick={changePassword}
            // Busy stays focusable (a disabled button would drop keyboard focus); nothing to send yet is disabled.
            disabled={!loading && incomplete}
            aria-disabled={loading || undefined}
            aria-busy={loading || undefined}
            icon={loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            className={cn(!loading && incomplete && WAITING_SUBMIT)}
          >
            {loading ? 'Saving…' : 'Update password'}
          </Button>
        </div>
      </div>
    </AccountRow>
  );
}
