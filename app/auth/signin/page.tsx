'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Zap, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { safeNextPath } from '@/lib/safeNext';
import ImpactCardDemo from '@/components/landing/ImpactCardDemo';
import Button from '@/components/ui/Button';
import AmbientBackground from '@/components/landing/AmbientBackground';

const supabase = createClient();

const LINK_ERRORS: Record<string, string> = {
  link_invalid: 'That link is invalid or has expired. Sign in, or request a new link.',
};

/** Supabase's raw auth errors, in plain language. */
function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match. Check them and try again.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first. Check your inbox for the link.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  return message;
}

export default function SignInPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  // If already logged in, redirect to dashboard or onboarding
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code && LINK_ERRORS[code]) setError(LINK_ERRORS[code]);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('has_completed_onboarding')
          .eq('id', user.id)
          .single();
        if (profile?.has_completed_onboarding) {
          router.replace('/dashboard');
        } else {
          router.replace('/onboarding');
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
      setError(friendlyAuthError(err.message));
      setLoading(false);
    } else if (data.user) {
      // Check onboarding status
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('has_completed_onboarding')
        .eq('id', data.user.id)
        .single();
      if (profile?.has_completed_onboarding) {
        const next = safeNextPath(new URLSearchParams(window.location.search).get('next'));
        router.push(next || '/dashboard');
      } else {
        router.push('/onboarding');
      }
    }
  };

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

          {/* Logo */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <span className="font-display font-semibold text-xl">Politi<span className="text-primary">con</span></span>
          </div>

          <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Welcome back</h1>
          <p className="text-text-muted text-sm mb-8">Sign in to see your personalized policy impact.</p>

          <form onSubmit={handleSignIn} className="space-y-4">
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
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Password</label>
                <Link href="/auth/forgot" className="text-xs text-primary hover:text-primary/80">Forgot password?</Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
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

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <Button type="submit" variant="primary" fullWidth size="lg" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p className="text-center text-sm text-text-muted mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="text-primary hover:text-primary/80 font-medium">Sign up free</Link>
          </p>
        </motion.div>
      </div>

      {/* Right: Animated card */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-16 relative z-10">
        <div className="text-center">
          <p className="text-text-muted text-sm mb-8 font-mono-data">Live policy analysis preview</p>
          <ImpactCardDemo />
        </div>
      </div>
    </div>
  );
}
