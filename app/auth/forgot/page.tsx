'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import AuthCard from '@/components/auth/AuthCard';
import { FIELD_INPUT, FIELD_LABEL, FORM_ERROR, FORM_LINK } from '@/components/auth/fields';

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
      eyebrow="Account recovery"
      title={sentTo ? 'Check your email' : 'Reset your password'}
      subtitle={sentTo ? undefined : "Enter the email you signed up with and we'll send you a reset link."}
    >
      <p role="status" className="sr-only">{announcement}</p>
      {sentTo ? (
        <div className="space-y-4 rounded-tile border border-fg/8 bg-fg/[0.02] p-5">
          <MailCheck className="h-8 w-8 text-primary-300" aria-hidden />
          <p className="text-sm leading-relaxed text-ink">
            If an account exists for <span className="font-medium">{sentTo}</span>, we&apos;ve sent a link to reset your
            password. It expires in about an hour.
          </p>
          <p className="text-xs text-muted">Don&apos;t see it? Check your spam folder.</p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={() => send()}
            disabled={cooldown > 0 || sending}
            className="rounded-lg text-sm text-primary-300 hover:text-ink disabled:cursor-not-allowed disabled:text-muted"
          >
            {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the link'}
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={send} className="space-y-4">
            <div>
              <label htmlFor={emailId} className={FIELD_LABEL}>Email</label>
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
                className={FIELD_INPUT}
              />
            </div>
            {error && (
              <div id={errorId} role="alert" className={FORM_ERROR}>
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}
            <Button type="submit" variant="primary" fullWidth size="lg" disabled={sending}>
              {sending ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            Remembered it? <Link href="/auth/signin" className={FORM_LINK}>Sign in</Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
