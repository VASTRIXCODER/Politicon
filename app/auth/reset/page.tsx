'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import AuthCard from '@/components/auth/AuthCard';
import { endRecovery, recoveryStatus } from './actions';

const MIN_LENGTH = 8;

/**
 * Where the password-reset email lands (via /auth/callback or /auth/confirm,
 * which sign the user in with a short-lived recovery session). Only that
 * session can set a password here; anyone else signed in is sent to Settings.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready' | 'no_session' | 'not_recovery' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    recoveryStatus().then(setStatus, () => setStatus('no_session'));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) { setError(`Use at least ${MIN_LENGTH} characters.`); return; }
    if (password !== confirm) { setError('The passwords don’t match.'); return; }
    setSaving(true);
    setError('');
    // The reset window is short; re-check it in case the page sat open.
    const current = await recoveryStatus().catch(() => 'no_session' as const);
    if (current !== 'ready') { setSaving(false); setStatus(current); return; }
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setSaving(false);
      setError(
        /same|different from the old/i.test(err.message) ? 'Choose a password you haven’t used for this account before.'
          : /weak|short|characters/i.test(err.message) ? 'That password is too weak. Try a longer one.'
          : 'We couldn’t update your password. Request a new link and try again.',
      );
      return;
    }
    // Anyone still signed in elsewhere with the old password is signed out.
    await supabase.auth.signOut({ scope: 'others' });
    await endRecovery().catch(() => {});
    setStatus('done');
    setTimeout(() => router.replace('/dashboard'), 1500);
  }

  if (status === 'checking') {
    return (
      <AuthCard title="Reset your password">
        <Loader2 className="w-5 h-5 animate-spin text-primary" aria-label="Loading" />
      </AuthCard>
    );
  }

  if (status === 'no_session') {
    return (
      <AuthCard title="Link expired" subtitle="This reset link is invalid or has expired. Links work once and only for about an hour.">
        <Link href="/auth/forgot" className="inline-flex items-center justify-center w-full rounded-xl bg-primary text-white font-medium px-8 py-4">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  if (status === 'not_recovery') {
    return (
      <AuthCard title="Change your password in Settings" subtitle="You're already signed in, so change your password in Settings instead.">
        <Link href="/settings" className="inline-flex items-center justify-center w-full rounded-xl bg-primary text-white font-medium px-8 py-4">
          Go to Settings
        </Link>
      </AuthCard>
    );
  }

  if (status === 'done') {
    return (
      <AuthCard title="Password updated" subtitle="You're signed in. Taking you to your dashboard…">
        <p role="status" className="sr-only">Password updated.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="Other devices will be signed out once you save it.">
      <form onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="new-password" className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">New password</label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? 'text' : 'password'}
              required
              minLength={MIN_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="input-glass w-full px-4 py-3.5 text-base sm:text-sm pr-12"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1.5">At least {MIN_LENGTH} characters.</p>
        </div>
        <div>
          <label htmlFor="confirm-password" className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">Confirm password</label>
          <input
            id="confirm-password"
            type={show ? 'text' : 'password'}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="input-glass w-full px-4 py-3.5 text-base sm:text-sm"
          />
        </div>
        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        <Button type="submit" variant="primary" fullWidth size="lg" disabled={saving}>
          {saving ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthCard>
  );
}
