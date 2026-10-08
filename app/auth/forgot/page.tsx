'use client';

import { useEffect, useState } from 'react';
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
    // Whether an account exists is never revealed; only throttling is reported.
    if (err && /rate limit|too many|seconds/i.test(err.message)) {
      setError('Too many requests. Please wait a minute and try again.');
      return;
    }
    setSentTo(address);
    setCooldown(COOLDOWN_S);
  }

  if (sentTo) {
    return (
      <AuthCard title="Check your email">
        <div className="glass rounded-2xl p-6 space-y-4" role="status">
          <MailCheck className="w-8 h-8 text-primary" aria-hidden />
          <p className="text-sm text-text-primary leading-relaxed">
            If an account exists for <span className="font-medium">{sentTo}</span>, we&apos;ve sent a link to reset your
            password. It expires in about an hour.
          </p>
          <p className="text-xs text-text-muted">Don&apos;t see it? Check your spam folder.</p>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <button
            onClick={() => send()}
            disabled={cooldown > 0 || sending}
            className="text-sm text-primary hover:text-primary/80 disabled:text-text-muted disabled:cursor-not-allowed"
          >
            {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the link'}
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" subtitle="Enter the email you signed up with and we'll send you a reset link.">
      <form onSubmit={send} className="space-y-4">
        <div>
          <label htmlFor="email" className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="input-glass w-full px-4 py-3.5 text-base sm:text-sm"
          />
        </div>
        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        <Button type="submit" variant="primary" fullWidth size="lg" disabled={sending}>
          {sending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className="text-center text-sm text-text-muted mt-6">
        Remembered it? <Link href="/auth/signin" className="text-primary hover:text-primary/80 font-medium">Sign in</Link>
      </p>
    </AuthCard>
  );
}
