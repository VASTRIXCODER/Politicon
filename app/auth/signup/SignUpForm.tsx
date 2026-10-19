'use client';

import { useState, useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { onboardingPath, safeNextPath } from '@/lib/safeNext';
import Button from '@/components/ui/Button';
import { AuthPending } from '@/components/auth/LoaderMark';
import { friendlyAuthError } from '@/components/auth/authErrors';
import { FIELD_INPUT, FIELD_LABEL, FIELD_TOGGLE, FORM_ERROR, FORM_LINK, PANE_TITLE } from '@/components/auth/fields';
import styles from '@/components/auth/auth.module.css';
import { MIN_AGE, TERMS_VERSION } from '@/lib/legal';
import { track } from '@/lib/track';
import { cn } from '@/lib/utils';

const THIS_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 100 }, (_, i) => THIS_YEAR - i);
const RESEND_COOLDOWN_S = 60;

const supabase = createClient();

const nextParam = () => new URLSearchParams(window.location.search).get('next');
/** Where an already-onboarded member goes: a validated ?next, else the dashboard. */
const afterSignIn = () => safeNextPath(nextParam()) || '/dashboard';
/** Where a member who hasn't finished their profile goes: onboarding, then ?next. */
const toOnboarding = () => onboardingPath(nextParam());
/** The confirmation email's link: the auth callback, then on to ?next (via onboarding for a new account). */
const confirmRedirect = () => {
  const next = safeNextPath(nextParam());
  return `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
};

/** The sign-up form and its "check your inbox" step (the pane and page around it are server-rendered: see ./page.tsx). */
export default function SignUpForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  // Where a returning member goes once signed in (carried from the sign-in
  // page). A brand-new account always goes through onboarding first.
  const [next, setNext] = useState<string | null>(null);
  // When Supabase requires email confirmation, show a waiting screen instead of
  // silently pushing the user somewhere they can't do anything.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [consent, setConsent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resendNote, setResendNote] = useState('');
  const id = useId();
  const ids = {
    firstName: `${id}-first-name`,
    email: `${id}-email`,
    password: `${id}-password`,
    passwordHint: `${id}-password-hint`,
    birthYear: `${id}-birth-year`,
    ageError: `${id}-age-error`,
    error: `${id}-error`,
  };
  /** aria-describedby from whichever hint/error ids currently apply. */
  const describe = (...parts: (string | false)[]) => parts.filter(Boolean).join(' ') || undefined;

  // The form (and its focused submit button) is swapped out for the
  // confirmation view: move focus to its heading so it's announced.
  useEffect(() => {
    if (awaitingConfirmation) confirmHeadingRef.current?.focus();
  }, [awaitingConfirmation]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Without a full birth date we can't be exact, so anyone who could still be
  // 17 at some point this year (i.e. turns 18 this year or later) is asked to
  // come back once they're 18.
  const tooYoung = !!birthYear && THIS_YEAR - Number(birthYear) <= MIN_AGE;

  useEffect(() => {
    setNext(safeNextPath(new URLSearchParams(window.location.search).get('next')));
  }, []);

  // On mount: if the user is already fully signed in, route them appropriately.
  // We only redirect existing sessions — a brand-new signup always goes to onboarding.
  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('has_completed_onboarding')
          .eq('id', user.id)
          .single();
        router.replace(profile?.has_completed_onboarding ? afterSignIn() : toOnboarding());
      } else {
        setCheckingSession(false);
      }
    });
  }, [router]);

  // Listen for the SIGNED_IN event that fires when a user clicks their
  // confirmation email link. Route them to onboarding at that point.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('has_completed_onboarding')
          .eq('id', session.user.id)
          .single();
        router.push(profile?.has_completed_onboarding ? afterSignIn() : toOnboarding());
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthYear || tooYoung) { setError(`Politicon is for adults ${MIN_AGE} and older.`); return; }
    if (!consent) { setError('Please agree to the Terms and Privacy Policy to continue.'); return; }
    setLoading(true);
    setError('');

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Recorded on the profile by the handle_new_user trigger.
        data: { first_name: firstName.trim().slice(0, 80), terms_version: TERMS_VERSION, ai_processing_consent: true },
        // After clicking the confirmation email, redirect back to the OAuth
        // callback which already routes new vs. returning users correctly
        // (a ?next destination is reached after onboarding).
        emailRedirectTo: confirmRedirect(),
      },
    });

    if (err) {
      setError(friendlyAuthError(err, 'We couldn’t create your account. Please try again.'));
      setLoading(false);
      return;
    }

    // Supabase hides whether an email is registered; an existing account comes
    // back as a user with no identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError('An account with this email already exists. Sign in instead, or reset your password.');
      setLoading(false);
      return;
    }

    // An account was created (no details about it are sent).
    track('signup_completed', { status: data.session ? 'confirmed' : 'pending_confirmation' });

    if (data.session) {
      // Email confirmation is disabled — user is immediately signed in.
      // Push straight to onboarding.
      router.push(toOnboarding());
    } else {
      // Email confirmation is enabled — Supabase sent a confirmation link.
      // Show a "check your email" screen and wait for the SIGNED_IN event.
      setConfirmedEmail(email);
      setAwaitingConfirmation(true);
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    setResendNote('');
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: confirmedEmail,
      options: { emailRedirectTo: confirmRedirect() },
    });
    setResendNote(resendError
      ? friendlyAuthError(resendError, 'We couldn’t resend the email. Please try again in a minute.')
      : 'Sent. Check your inbox and spam folder.');
    setResendIn(RESEND_COOLDOWN_S);
  };

  // ── Loading / session-check ──────────────────────────────────────────────
  if (checkingSession) return <AuthPending label="Checking your session…" />;

  // ── Awaiting email confirmation ───────────────────────────────────────────
  if (awaitingConfirmation) {
    return (
      <div className="text-center">
        {/* An envelope of violet light, sealed. */}
        <div
          aria-hidden="true"
          className="relative mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-[0_0_0_6px_rgb(var(--c-violet)/0.06),0_14px_30px_-12px_rgb(var(--c-violet)/0.55)]"
        >
          <Mail className="h-7 w-7 text-primary-300" />
        </div>
        <h1 ref={confirmHeadingRef} tabIndex={-1} className={cn(PANE_TITLE, 'mb-3 outline-none')}>Check your inbox</h1>
        <p className="mb-2 text-sm leading-relaxed text-muted">
          We sent a confirmation link to
        </p>
        <p className="mb-6 break-all font-mono-data text-sm font-medium text-primary-300">{confirmedEmail}</p>
        <p className="mb-8 text-xs leading-relaxed text-muted">
          Click the link in the email to confirm your account and we&apos;ll take you straight into your profile setup. The link expires in 24 hours.
        </p>
        <div className="flex flex-col gap-3 border-t border-fg/8 pt-6">
          <button
            type="button"
            onClick={() => { setAwaitingConfirmation(false); setLoading(false); }}
            className="rounded-lg text-sm text-muted transition-colors hover:text-ink"
          >
            <span aria-hidden="true">← </span>Use a different email
          </button>
          <button
            type="button"
            onClick={resend}
            disabled={resendIn > 0}
            className="rounded-lg text-sm text-primary-300 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend confirmation email'}
          </button>
          {/* Always mounted so the note is announced when it appears. */}
          <p role="status" className="text-xs text-muted empty:hidden">{resendNote}</p>
        </div>
      </div>
    );
  }

  // ── Sign-up form ──────────────────────────────────────────────────────────
  return (
    <>
      <h1 className={cn(PANE_TITLE, 'mb-3')}>
        Get your <em>impact report</em>
      </h1>
      <p className="mb-8 text-sm leading-relaxed text-muted">Free. No credit card. Setup takes about two minutes.</p>

      <form onSubmit={handleSignUp} className="space-y-5">
        <div>
          <label htmlFor={ids.firstName} className={FIELD_LABEL}>First name</label>
          <input
            id={ids.firstName}
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="Alex"
            autoComplete="given-name"
            maxLength={80}
            className={FIELD_INPUT}
          />
        </div>

        <div>
          <label htmlFor={ids.email} className={FIELD_LABEL}>Email</label>
          <input
            id={ids.email}
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            aria-describedby={describe(!!error && ids.error)}
            className={FIELD_INPUT}
          />
        </div>

        <div>
          <label htmlFor={ids.password} className={FIELD_LABEL}>Password</label>
          <div className="relative">
            <input
              id={ids.password}
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              aria-describedby={describe(ids.passwordHint, !!error && ids.error)}
              className={cn(FIELD_INPUT, 'pr-12')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Show password"
              aria-pressed={showPassword}
              aria-controls={ids.password}
              className={FIELD_TOGGLE}
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          {/* The placeholder disappears once typing starts; this keeps the rule announced. */}
          <p id={ids.passwordHint} className="sr-only">At least 8 characters.</p>
        </div>

        <div>
          <label htmlFor={ids.birthYear} className={FIELD_LABEL}>Year of birth</label>
          <select
            id={ids.birthYear}
            required
            value={birthYear}
            onChange={e => setBirthYear(e.target.value)}
            aria-invalid={tooYoung || undefined}
            aria-describedby={describe(tooYoung && ids.ageError)}
            className={FIELD_INPUT}
          >
            <option value="">Select year…</option>
            {BIRTH_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {tooYoung && (
            <p id={ids.ageError} role="alert" className="mt-2 text-xs text-danger">Politicon is for adults {MIN_AGE} and older. If you turn {MIN_AGE} this year, please come back after your birthday next year.</p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-tile border border-fg/8 bg-fg/[0.02] p-3.5 text-xs leading-relaxed text-muted">
          <input
            type="checkbox"
            checked={consent}
            onChange={e => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary"
            required
          />
          <span>
            I&apos;m {MIN_AGE} or older and agree to the{' '}
            <Link href="/terms" className="rounded text-primary-300 underline underline-offset-2" target="_blank">Terms<span className="sr-only"> (opens in a new tab)</span></Link> and{' '}
            <Link href="/privacy" className="rounded text-primary-300 underline underline-offset-2" target="_blank">Privacy Policy<span className="sr-only"> (opens in a new tab)</span></Link>,
            including my answers being processed by an AI service to generate my analyses.
          </span>
        </label>

        {error && (
          <div id={ids.error} role="alert" className={cn(FORM_ERROR, styles.settle)}>
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <Button type="submit" variant="primary" fullWidth size="lg" disabled={loading || tooYoung || !consent || !birthYear}>
          {loading ? 'Creating account…' : 'Create free account'}
        </Button>
      </form>

      <p className="mt-7 border-t border-fg/8 pt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href={next ? `/auth/signin?next=${encodeURIComponent(next)}` : '/auth/signin'} className={FORM_LINK}>Sign in</Link>
      </p>
    </>
  );
}
