'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Zap, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import ImpactCardDemo from '@/components/landing/ImpactCardDemo';
import Button from '@/components/ui/Button';
import AmbientBackground from '@/components/landing/AmbientBackground';

const supabase = createClient();

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
      setError(err.message);
      setLoading(false);
    } else if (data.user) {
      // Check onboarding status
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('has_completed_onboarding')
        .eq('id', data.user.id)
        .single();
      if (profile?.has_completed_onboarding) {
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    }
  };

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
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

          {/* Google OAuth */}
          <div className="relative mb-6">
          <button
            onClick={handleGoogleSignIn}
            disabled
            className="w-full glass border border-white/10 rounded-2xl px-5 py-3.5 flex items-center justify-center gap-3 text-sm text-text-muted opacity-50 cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl">
            <span className="bg-surface border border-primary/30 text-primary text-xs font-semibold px-3 py-1 rounded-full">
              Coming Soon
            </span>
          </div>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-xs text-text-muted">or</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

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
