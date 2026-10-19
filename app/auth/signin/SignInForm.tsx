'use client';

import { useState, useEffect, useId } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { onboardingPath, safeNextPath } from '@/lib/safeNext';
import Button from '@/components/ui/Button';
import { AuthPending } from '@/components/auth/LoaderMark';
import { friendlyAuthError } from '@/components/auth/authErrors';
import { FIELD_INPUT, FIELD_LABEL, FIELD_TOGGLE, FORM_ERROR, FORM_LINK, PANE_TITLE } from '@/components/auth/fields';
import styles from '@/components/auth/auth.module.css';
import { cn } from '@/lib/utils';

const supabase = createClient();

const LINK_ERRORS: Record<string, string> = {
  link_invalid: 'That link is invalid or has expired. Sign in, or request a new link.',
};

/** The sign-in form (its pane and the page around it are server-rendered: see ./page.tsx). */
export default function SignInForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  // Where to go after signing in (e.g. the AI Policy Guide with a question
  // from the landing page); carried to the sign-up page too.
  const [next, setNext] = useState<string | null>(null);
  const id = useId();
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;
  const errorId = `${id}-error`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('error');
    if (code && LINK_ERRORS[code]) setError(LINK_ERRORS[code]);
    setNext(safeNextPath(params.get('next')));
  }, []);

  // If already logged in, redirect to the requested page (or the dashboard), or to onboarding
  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('has_completed_onboarding')
          .eq('id', user.id)
          .single();
        if (profile?.has_completed_onboarding) {
          router.replace(safeNextPath(new URLSearchParams(window.location.search).get('next')) || '/dashboard');
        } else {
          router.replace(onboardingPath(new URLSearchParams(window.location.search).get('next')));
        }
      } else {
        setCheckingSession(false);
      }
    });
  }, [router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(friendlyAuthError(err, 'We couldn’t sign you in. Please try again.'));
      setLoading(false);
    } else if (data.user) {
      // Check onboarding status
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('has_completed_onboarding')
        .eq('id', data.user.id)
        .single();
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(profile?.has_completed_onboarding ? safeNextPath(next) || '/dashboard' : onboardingPath(next));
    }
  };

  if (checkingSession) return <AuthPending label="Checking your session…" />;

  return (
    <>
      <h1 className={cn(PANE_TITLE, 'mb-3')}>
        Welcome <em>back</em>
      </h1>
      <p className="mb-8 text-sm leading-relaxed text-muted">Sign in to see your personalized policy impact.</p>

      <form onSubmit={handleSignIn} className="space-y-5">
        <div>
          <label htmlFor={emailId} className={FIELD_LABEL}>Email</label>
          <input
            id={emailId}
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            aria-describedby={error ? errorId : undefined}
            className={FIELD_INPUT}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor={passwordId} className={cn(FIELD_LABEL, 'mb-0')}>Password</label>
            <Link href="/auth/forgot" className="rounded text-xs text-primary-300 hover:text-ink">Forgot password?</Link>
          </div>
          <div className="relative">
            <input
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              aria-describedby={error ? errorId : undefined}
              className={cn(FIELD_INPUT, 'pr-12')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Show password"
              aria-pressed={showPassword}
              aria-controls={passwordId}
              className={FIELD_TOGGLE}
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {error && (
          <div id={errorId} role="alert" className={cn(FORM_ERROR, styles.settle)}>
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <Button type="submit" variant="primary" fullWidth size="lg" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-7 border-t border-fg/8 pt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{' '}
        <Link href={next ? `/auth/signup?next=${encodeURIComponent(next)}` : '/auth/signup'} className={FORM_LINK}>Sign up free</Link>
      </p>
    </>
  );
}
