'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Zap, ArrowLeft, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import ImpactCardDemo from '@/components/landing/ImpactCardDemo';
import Button from '@/components/ui/Button';
import AmbientBackground from '@/components/landing/AmbientBackground';
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
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [consent, setConsent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resendNote, setResendNote] = useState('');

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
      setError(err.message);
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
    setResendNote(resendError ? resendError.message : 'Sent. Check your inbox and spam folder.');
    setResendIn(RESEND_COOLDOWN_S);
  };

  // ── Loading / session-check spinner ──────────────────────────────────────
  if (checkingSession) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Awaiting email confirmation ───────────────────────────────────────────
  if (awaitingConfirmation) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-8">
        <AmbientBackground />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-md text-center"
        >
          <div className="glass border border-white/10 rounded-3xl p-10">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-6">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display text-2xl font-bold text-text-primary mb-3">Check your inbox</h1>
            <p className="text-text-muted text-sm leading-relaxed mb-2">
              We sent a confirmation link to
            </p>
            <p className="text-primary font-medium text-sm mb-6">{confirmedEmail}</p>
            <p className="text-text-muted text-xs leading-relaxed mb-8">
              Click the link in the email to confirm your account and we&apos;ll take you straight into your profile setup. The link expires in 24 hours.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setAwaitingConfirmation(false); setLoading(false); }}
                className="text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                ← Use a different email
              </button>
              <button
                onClick={resend}
                disabled={resendIn > 0}
                className="text-xs text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
              >
                {resendIn > 0 ? `Resend available in ${resendIn}s` : 'Resend confirmation email'}
              </button>
              {resendNote && <p role="status" className="text-xs text-text-muted">{resendNote}</p>}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Sign-up form ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative flex">
      <AmbientBackground />

      {/* Left: Form */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Link href="/" className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors mb-8 group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm">Back to home</span>
          </Link>

          <div className="flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <span className="font-display font-semibold text-xl">Politi<span className="text-primary">con</span></span>
          </div>

          <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Get your impact report</h1>
          <p className="text-text-muted text-sm mb-8">Free. No credit card. Setup takes about two minutes.</p>

          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Alex"
                autoComplete="given-name"
                className="input-glass w-full px-4 py-3.5 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="input-glass w-full px-4 py-3.5 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="input-glass w-full px-4 py-3.5 text-sm pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="birth-year" className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">Year of birth</label>
              <select
                id="birth-year"
                required
                value={birthYear}
                onChange={e => setBirthYear(e.target.value)}
                className="input-glass w-full px-4 py-3.5 text-base sm:text-sm"
              >
                <option value="">Select year…</option>
                {BIRTH_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {tooYoung && (
                <p role="alert" className="text-xs text-red-300 mt-2">Politicon is for adults {MIN_AGE} and older. If you turn {MIN_AGE} this year, please come back after your birthday next year.</p>
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
                <Link href="/terms" className="text-primary underline-offset-2 hover:underline" target="_blank">Terms</Link> and{' '}
                <Link href="/privacy" className="text-primary underline-offset-2 hover:underline" target="_blank">Privacy Policy</Link>,
                including my answers being processed by an AI service to generate my analyses.
              </span>
            </label>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"
                >
                  <p className="text-sm text-red-400">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <Button type="submit" variant="primary" fullWidth size="lg" disabled={loading || tooYoung || !consent || !birthYear}>
              {loading ? 'Creating account…' : 'Create free account'}
            </Button>
          </form>

          <p className="text-center text-sm text-text-muted mt-6">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-primary hover:text-primary/80 font-medium">Sign in</Link>
          </p>
        </motion.div>
      </div>

      {/* Right */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-16 relative z-10">
        <div className="text-center">
          <p className="text-text-muted text-sm mb-2">What you&apos;ll see after setup</p>
          <p className="text-text-muted text-xs mb-10 max-w-xs mx-auto">Example analyses. Yours are built from your own profile.</p>
          <ImpactCardDemo />
        </div>
      </div>
    </div>
  );
}
