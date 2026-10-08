'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import AuthCard from '@/components/auth/AuthCard';

const COOLDOWN_S = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  // Read out by an always-mounted status region, so the confirmation is heard
  // when the form is swapped out and the resend countdown stays silent.
  const [announcement, setAnnouncement] = useState('');
  const id = useId();
  const emailId = `${id}-email`;
  const errorId = `${id}-error`;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const address = (sentTo || email).trim();
    if (!address || cooldown > 0) return;
    setSending(true);
    setError('');
    const { error: err } = await createClient().auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
    });
    setSending(false);
    // Unknown addresses succeed too, so reporting failures never reveals
    // whether an account exists; only a request that really went out shows "sent".
    if (err) {
      setError(
        /rate limit|too many|seconds/i.test(err.message)
          ? 'Too many requests. Please wait a minute and try again.'
          : 'We couldn’t send the email. Check the address and your connection, then try again.',
      );
      return;
    }
    setAnnouncement(
      sentTo
        ? `Sent another reset link to ${address}.`
        : `Check your email. If an account exists for ${address}, we've sent a link to reset your password.`,
    );
    setSentTo(address);
    setCooldown(COOLDOWN_S);
  }

  return (
    <AuthCard
      title={sentTo ? 'Check your email' : 'Reset your password'}
      subtitle={sentTo ? undefined : "Enter the email you signed up with and we'll send you a reset link."}
    >
      <p role="status" className="sr-only">{announcement}</p>
      {sentTo ? (
        <div className="glass rounded-2xl p-6 space-y-4">
          <MailCheck className="w-8 h-8 text-primary" aria-hidden />
          <p className="text-sm text-text-primary leading-relaxed">
            If an account exists for <span className="font-medium">{sentTo}</span>, we&apos;ve sent a link to reset your
            password. It expires in about an hour.
          </p>
          <p className="text-xs text-text-muted">Don&apos;t see it? Check your spam folder.</p>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <button
            type="button"
            onClick={() => send()}
            disabled={cooldown > 0 || sending}
            className="text-sm text-primary-300 hover:text-text-primary disabled:text-text-muted disabled:cursor-not-allowed rounded-lg"
          >
            {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the link'}
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={send} className="space-y-4">
            <div>
              <label htmlFor={emailId} className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">Email</label>
              <input
                id={emailId}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="input-glass w-full px-4 py-3.5 text-sm"
              />
            </div>
            {error && (
              <div id={errorId} role="alert" className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
            <Button type="submit" variant="primary" fullWidth size="lg" disabled={sending}>
              {sending ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
          <p className="text-center text-sm text-text-muted mt-6">
            Remembered it? <Link href="/auth/signin" className="text-primary-300 hover:text-text-primary font-medium rounded">Sign in</Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
