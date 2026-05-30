'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, X, Zap, User, LogOut, LayoutDashboard, Settings, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const navLinks = [
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Policies', href: '/policies' },
  { label: 'Explorer', href: '/explorer' },
  { label: 'Advisor', href: '/advisor' },
];

function UserDropdown({ user, onSignOut }: { user: SupabaseUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const firstName = (user.user_metadata?.first_name as string) || user.email?.split('@')[0] || 'Account';
  const initials = firstName.slice(0, 2).toUpperCase();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 glass border border-white/10 hover:border-white/20 rounded-xl px-3 py-2 transition-all"
      >
        <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
          <span className="text-xs font-bold text-primary">{initials}</span>
        </div>
        <span className="text-sm text-text-primary hidden sm:block">{firstName}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-52 glass-strong border border-white/10 rounded-2xl p-1.5 shadow-xl z-50"
          >
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-text-muted hover:text-text-primary hover:bg-white/5 transition-all"
            >
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-text-muted hover:text-text-primary hover:bg-white/5 transition-all"
            >
              <Settings className="w-4 h-4" /> Settings
            </Link>
            <div className="my-1 h-px bg-white/8" />
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setAuthLoading(false);
    });
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${
          scrolled
            ? 'glass-strong border-b border-white/8 py-3'
            : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-display font-semibold text-lg text-text-primary tracking-tight">
              Politi<span className="text-primary">con</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(link => (
              <Link
                key={link.label}
                href={link.href}
                className="nav-underline text-sm text-text-muted hover:text-text-primary transition-colors duration-200 font-body"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA / User */}
          <div className="hidden md:flex items-center gap-3">
            {authLoading ? (
              <div className="w-24 h-9 rounded-xl bg-white/5 animate-pulse" />
            ) : user ? (
              <UserDropdown user={user} onSignOut={handleSignOut} />
            ) : (
              <>
                <Link href="/auth/signin">
                  <Button variant="ghost" size="sm">Sign In</Button>
                </Link>
                <Link href="/auth/signup">
                  <Button variant="primary" size="sm">Get Started</Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-text-muted hover:text-text-primary transition-colors p-2"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </motion.nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-[110] backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 right-0 bottom-0 w-80 glass-strong border-l border-white/8 z-[120] flex flex-col p-8"
            >
              <div className="flex items-center justify-between mb-10">
                <span className="font-display font-semibold text-lg">
                  Politi<span className="text-primary">con</span>
                </span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="text-text-muted hover:text-text-primary transition-colors p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex flex-col gap-2 flex-1">
                {navLinks.map((link, i) => (
                  <motion.div
                    key={link.label}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.07, duration: 0.3 }}
                  >
                    <Link
                      href={link.href}
                      className="block py-3 px-4 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-xl transition-all duration-200 font-body"
                      onClick={() => setMobileOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                ))}
                {user && (
                  <>
                    <div className="my-2 h-px bg-white/8" />
                    <Link href="/dashboard" onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 py-3 px-4 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-xl transition-all">
                      <LayoutDashboard className="w-4 h-4" /> Dashboard
                    </Link>
                    <Link href="/settings" onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 py-3 px-4 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-xl transition-all">
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                  </>
                )}
              </nav>
              <div className="flex flex-col gap-3 pt-6 border-t border-white/8">
                {user ? (
                  <button onClick={() => { setMobileOpen(false); handleSignOut(); }}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-all">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                ) : (
                  <>
                    <Link href="/auth/signin" onClick={() => setMobileOpen(false)}>
                      <Button variant="ghost" fullWidth>Sign In</Button>
                    </Link>
                    <Link href="/auth/signup" onClick={() => setMobileOpen(false)}>
                      <Button variant="primary" fullWidth>Get Started Free</Button>
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
