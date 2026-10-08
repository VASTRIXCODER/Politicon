'use client';

import { useState, useEffect, useId } from 'react';
import { m } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { onboardingPath, safeNextPath } from '@/lib/safeNext';
import ImpactCardDemo from '@/components/landing/ImpactCardDemo';
import Button from '@/components/ui/Button';
import Logo from '@/components/ui/Logo';
import AmbientBackground from '@/components/landing/AmbientBackground';
import FullPageLoader from '@/components/auth/FullPageLoader';
import { friendlyAuthError } from '@/components/auth/authErrors';

const supabase = createClient();

const LINK_ERRORS: Record<string, string> = {
  link_invalid: 'That link is invalid or has expired. Sign in, or request a new link.',
};

export default function SignInPage() {
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
    supabase.auth.getUser().then(async ({ data: { user } }) => {
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

  if (checkingSession) return <FullPageLoader label="Checking your session…" />;

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

          <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Welcome back</h1>
          <p className="text-text-muted text-sm mb-8">Sign in to see your personalized policy impact.</p>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label htmlFor={emailId} className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 block">Email</label>
              <input
                id={emailId}
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                aria-describedby={error ? errorId : undefined}
                className="input-glass w-full px-4 py-3.5 text-sm"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor={passwordId} className="text-xs font-medium text-text-muted uppercase tracking-wider">Password</label>
                <Link href="/auth/forgot" className="text-xs text-primary-300 hover:text-text-primary rounded">Forgot password?</Link>
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
                  className="input-glass w-full px-4 py-3.5 text-sm pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Show password"
                  aria-pressed={showPassword}
                  aria-controls={passwordId}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {error && (
              <div id={errorId} role="alert" className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <Button type="submit" variant="primary" fullWidth size="lg" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p className="text-center text-sm text-text-muted mt-6">
            Don&apos;t have an account?{' '}
            <Link href={next ? `/auth/signup?next=${encodeURIComponent(next)}` : '/auth/signup'} className="text-primary-300 hover:text-text-primary font-medium rounded">Sign up free</Link>
          </p>
        </m.div>
      </main>

      {/* Right: Animated card */}
      <aside aria-label="Example analysis preview" className="hidden lg:flex flex-1 items-center justify-center p-16 relative z-10">
        <div className="text-center">
          <p className="text-text-muted text-sm mb-8 font-mono-data">Example analysis, illustrative figures</p>
          <ImpactCardDemo />
        </div>
      </aside>
    </div>
  );
}
