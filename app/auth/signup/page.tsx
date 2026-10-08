'use client';

import { useState, useEffect, useId, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ArrowLeft, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import ImpactCardDemo from '@/components/landing/ImpactCardDemo';
import Button from '@/components/ui/Button';
import Logo from '@/components/ui/Logo';
import AmbientBackground from '@/components/landing/AmbientBackground';
import FullPageLoader from '@/components/auth/FullPageLoader';
import { friendlyAuthError } from '@/components/auth/authErrors';
import { MIN_AGE, TERMS_VERSION } from '@/lib/legal';

const THIS_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 100 }, (_, i) => THIS_YEAR - i);
const RESEND_COOLDOWN_S = 60;

const supabase = createClient();

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
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

  // On mount: if the user is already fully signed in, route them appropriately.
  // We only redirect existing sessions — a brand-new signup always goes to onboarding.
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('has_completed_onboarding')
          .eq('id', user.id)
          .single();
        router.replace(profile?.has_completed_onboarding ? '/dashboard' : '/onboarding');
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
        router.push(profile?.has_completed_onboarding ? '/dashboard' : '/onboarding');
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
        // callback which already routes new vs. returning users correctly.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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

    if (data.session) {
      // Email confirmation is disabled — user is immediately signed in.
      // Push straight to onboarding.
      router.push('/onboarding');
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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setResendNote(resendError
      ? friendlyAuthError(resendError, 'We couldn’t resend the email. Please try again in a minute.')
      : 'Sent. Check your inbox and spam folder.');
    setResendIn(RESEND_COOLDOWN_S);
  };

  // ── Loading / session-check spinner ──────────────────────────────────────
  if (checkingSession) return <FullPageLoader label="Checking your session…" />;

  // ── Awaiting email confirmation ───────────────────────────────────────────
  if (awaitingConfirmation) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-8">
        <AmbientBackground />
        <m.main
          id="main"
          tabIndex={-1}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-md text-center"
        >
          <div className="glass border-white/10 rounded-3xl p-6 sm:p-10">
            <div aria-hidden="true" className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-6">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h1 ref={confirmHeadingRef} tabIndex={-1} className="font-display text-2xl font-bold text-text-primary mb-3 outline-none">Check your inbox</h1>
            <p className="text-text-muted text-sm leading-relaxed mb-2">
              We sent a confirmation link to
            </p>
            <p className="text-primary-300 font-medium text-sm mb-6 break-all">{confirmedEmail}</p>
            <p className="text-text-muted text-xs leading-relaxed mb-8">
              Click the link in the email to confirm your account and we&apos;ll take you straight into your profile setup. The link expires in 24 hours.
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { setAwaitingConfirmation(false); setLoading(false); }}
                className="text-sm text-text-muted hover:text-text-primary transition-colors rounded-lg"
              >
                <span aria-hidden="true">← </span>Use a different email
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={resendIn > 0}
                className="text-sm text-primary-300 hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
              >
                {resendIn > 0 ? `Resend available in ${resendIn}s` : 'Resend confirmation email'}
              </button>
              {/* Always mounted so the note is announced when it appears. */}
              <p role="status" className="text-xs text-text-muted empty:hidden">{resendNote}</p>
            </div>
          </div>
        </m.main>
      </div>
    );
  }

  // ── Sign-up form ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative flex">
      <AmbientBackground />

      {/* Left: Form */}
      <main id="main" tabIndex={-1} className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-8">
        <m.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Link href="/" className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors mb-8 group rounded-lg">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" aria-hidden="true" />
            <span className="text-sm">Back to home</span>
          </Link>

          <Logo size="lg" href={null} className="mb-8 flex" />

          <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Get your impact report</h1>
          <p className="text-text-muted text-sm mb-8">Free. No credit card. Setup takes about two minutes.</p>

          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label htmlFor={ids.firstName} className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">First name</label>
              <input
                id={ids.firstName}
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Alex"
                autoComplete="given-name"
                maxLength={80}
                className="input-glass w-full px-4 py-3.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor={ids.email} className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">Email</label>
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
                className="input-glass w-full px-4 py-3.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor={ids.password} className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">Password</label>
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
                  className="input-glass w-full px-4 py-3.5 text-sm pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Show password"
                  aria-pressed={showPassword}
                  aria-controls={ids.password}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
              {/* The placeholder disappears once typing starts; this keeps the rule announced. */}
              <p id={ids.passwordHint} className="sr-only">At least 8 characters.</p>
            </div>

            <div>
              <label htmlFor={ids.birthYear} className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">Year of birth</label>
              <select
                id={ids.birthYear}
                required
                value={birthYear}
                onChange={e => setBirthYear(e.target.value)}
                aria-invalid={tooYoung || undefined}
                aria-describedby={describe(tooYoung && ids.ageError)}
                className="input-glass w-full px-4 py-3.5 text-sm"
              >
                <option value="">Select year…</option>
                {BIRTH_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {tooYoung && (
                <p id={ids.ageError} role="alert" className="text-xs text-red-300 mt-2">Politicon is for adults {MIN_AGE} and older. If you turn {MIN_AGE} this year, please come back after your birthday next year.</p>
              )}
            </div>

            <label className="flex items-start gap-3 text-xs text-text-muted leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={e => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#7B61FF]"
                required
              />
              <span>
                I&apos;m {MIN_AGE} or older and agree to the{' '}
                <Link href="/terms" className="text-primary-300 underline-offset-2 hover:underline rounded" target="_blank">Terms<span className="sr-only"> (opens in a new tab)</span></Link> and{' '}
                <Link href="/privacy" className="text-primary-300 underline-offset-2 hover:underline rounded" target="_blank">Privacy Policy<span className="sr-only"> (opens in a new tab)</span></Link>,
                including my answers being processed by an AI service to generate my analyses.
              </span>
            </label>

            <AnimatePresence>
              {error && (
                <m.div
                  id={ids.error}
                  role="alert"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"
                >
                  <p className="text-sm text-red-400">{error}</p>
                </m.div>
              )}
            </AnimatePresence>

            <Button type="submit" variant="primary" fullWidth size="lg" disabled={loading || tooYoung || !consent || !birthYear}>
              {loading ? 'Creating account…' : 'Create free account'}
            </Button>
          </form>

          <p className="text-center text-sm text-text-muted mt-6">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-primary-300 hover:text-text-primary font-medium rounded">Sign in</Link>
          </p>
        </m.div>
      </main>

      {/* Right */}
      <aside aria-label="Example analyses" className="hidden lg:flex flex-1 items-center justify-center p-16 relative z-10">
        <div className="text-center">
          <p className="text-text-muted text-sm mb-2">What you&apos;ll see after setup</p>
          <p className="text-text-muted text-xs mb-10 max-w-xs mx-auto">Example analyses. Yours are built from your own profile.</p>
          <ImpactCardDemo />
        </div>
      </aside>
    </div>
  );
}
