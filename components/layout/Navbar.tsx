'use client';

import { useState, useEffect, useRef, useId, useCallback } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, LogOut, LayoutDashboard, Settings, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Logo from '@/components/ui/Logo';
import { useModalDialog } from '@/components/layout/useModalDialog';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const PUBLIC_LINKS = [
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Explorer', href: '/explorer' },
  { label: 'Help', href: '/help' },
];
const APP_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Policies', href: '/policies' },
  { label: 'My Impact', href: '/impact' },
  { label: 'Policy Guide', href: '/advisor' },
];

const MENU_ITEM = 'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all';

const menuItems = (menu: HTMLElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

/** Account menu (WAI-ARIA menu button): arrow keys move, Escape and Tab close. */
function UserDropdown({ user, onSignOut }: { user: SupabaseUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Which item to focus when the menu opens: first (click, Enter, ArrowDown) or last (ArrowUp).
  const focusOnOpen = useRef<'first' | 'last'>('first');
  const id = useId();
  const triggerId = `${id}-trigger`;
  const menuId = `${id}-menu`;
  const firstName = (user.user_metadata?.first_name as string) || user.email?.split('@')[0] || 'Account';
  const initials = firstName.slice(0, 2).toUpperCase();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const list = menuItems(menuRef.current);
    (focusOnOpen.current === 'last' ? list[list.length - 1] : list[0])?.focus();

    function handlePointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open]);

  const openWith = (where: 'first' | 'last') => {
    focusOnOpen.current = where;
    setOpen(true);
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); openWith('first'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); openWith('last'); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const list = menuItems(menuRef.current);
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (index + 1) % list.length;
    else if (e.key === 'ArrowUp') next = (index - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    else if (e.key === 'Tab') { close(false); return; }
    if (next === -1) return;
    e.preventDefault();
    list[next]?.focus();
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openWith('first'))}
        onKeyDown={onTriggerKeyDown}
        className="flex items-center gap-2 glass border-white/10 hover:border-white/20 rounded-xl px-3 py-2 transition-all"
      >
        <span aria-hidden="true" className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
          <span className="text-xs font-bold text-primary-300">{initials}</span>
        </span>
        <span className="text-sm text-text-primary hidden sm:block"><span className="sr-only">Account: </span>{firstName}</span>
        <ChevronDown aria-hidden="true" className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            onKeyDown={onMenuKeyDown}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-52 glass-strong border-white/10 rounded-2xl p-1.5 shadow-xl z-50"
          >
            <Link
              href="/dashboard"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={`${MENU_ITEM} text-text-muted hover:text-text-primary hover:bg-white/5 focus:text-text-primary focus:bg-white/5`}
            >
              <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> Dashboard
            </Link>
            <Link
              href="/settings"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={`${MENU_ITEM} text-text-muted hover:text-text-primary hover:bg-white/5 focus:text-text-primary focus:bg-white/5`}
            >
              <Settings className="w-4 h-4" aria-hidden="true" /> Settings
            </Link>
            <div role="separator" className="my-1 h-px bg-white/8" />
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => { close(true); onSignOut(); }}
              className={`${MENU_ITEM} text-red-400 hover:bg-red-500/10 focus:bg-red-500/10`}
            >
              <LogOut className="w-4 h-4" aria-hidden="true" /> Sign Out
            </button>
          </m.div>
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
  const pathname = usePathname();
  const navLinks = user ? APP_LINKS : PUBLIC_LINKS;
  const isActive = (href: string) => !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`));

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const drawerRef = useModalDialog<HTMLDivElement>(mobileOpen, closeMobile, { returnFocusRef: menuButtonRef, lockScroll: true });
  const drawerTitleId = useId();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 80);
    // A restored scroll position (refresh, back button) needs the solid bar straight away.
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // The drawer is for small screens; close it if the window grows past them.
  useEffect(() => {
    if (!mobileOpen) return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setMobileOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mobileOpen]);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (e) {
      // Misconfigured env: render the signed-out nav rather than crash every page.
      console.error('Navbar auth unavailable:', e);
      setAuthLoading(false);
      return;
    }
    // Get initial user
    supabase.auth.getUser()
      .then(({ data: { user } }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    // Sign out this device only; clear per-user UI state kept in the browser.
    const { error } = await createClient().auth.signOut({ scope: 'local' });
    if (error) console.error('Sign-out failed:', error);
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('politicon')).forEach((k) => localStorage.removeItem(k));
    } catch { /* storage unavailable */ }
    setUser(null);
    router.push('/');
    router.refresh();
  };

  return (
    <>
      {/* No entrance animation: the bar is server-rendered visible, so it paints before hydration. */}
      <nav
        aria-label="Main"
        className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${
          scrolled
            ? 'glass-nav py-3'
            : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <Logo />

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {!authLoading && navLinks.map(link => (
              <Link
                key={link.label}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`nav-underline text-sm transition-colors duration-200 font-body ${isActive(link.href) ? 'text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA / User */}
          <div className="hidden md:flex items-center gap-3">
            {authLoading ? (
              <div className="w-24 h-9 rounded-xl bg-white/5 animate-pulse" aria-hidden="true" />
            ) : user ? (
              <UserDropdown user={user} onSignOut={handleSignOut} />
            ) : (
              <>
                <Button href="/auth/signin" variant="ghost" size="sm">Sign In</Button>
                <Button href="/auth/signup" variant="primary" size="sm">Get Started</Button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            ref={menuButtonRef}
            type="button"
            className="md:hidden text-text-muted hover:text-text-primary transition-colors p-2 rounded-lg"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={mobileOpen}
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <m.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-[110] backdrop-blur-sm"
              onClick={closeMobile}
              aria-hidden="true"
              // Wheel/touch over the backdrop must not reach Lenis (the page is scroll-locked).
              data-lenis-prevent
            />
            <m.div
              key="drawer"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={drawerTitleId}
              tabIndex={-1}
              data-lenis-prevent
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 right-0 bottom-0 w-80 max-w-[85vw] glass-strong border-0 border-l border-white/8 z-[120] flex flex-col p-8 overflow-y-auto overscroll-contain focus:outline-none"
            >
              <div className="flex items-center justify-between mb-10">
                <h2 id={drawerTitleId} className="sr-only">Menu</h2>
                <Logo variant="wordmark" href={null} />
                <button
                  type="button"
                  onClick={closeMobile}
                  aria-label="Close menu"
                  className="text-text-muted hover:text-text-primary transition-colors p-2 rounded-lg"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <nav aria-label="Main" className="flex flex-col gap-2 flex-1">
                {navLinks.map((link, i) => (
                  <m.div
                    key={link.label}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.07, duration: 0.3 }}
                  >
                    <Link
                      href={link.href}
                      aria-current={isActive(link.href) ? 'page' : undefined}
                      className={`block py-3 px-4 hover:text-text-primary hover:bg-white/5 rounded-xl transition-all duration-200 font-body ${isActive(link.href) ? 'text-text-primary bg-white/5' : 'text-text-muted'}`}
                      onClick={closeMobile}
                    >
                      {link.label}
                    </Link>
                  </m.div>
                ))}
                {user && (
                  <>
                    <div className="my-2 h-px bg-white/8" aria-hidden="true" />
                    <Link href="/settings" onClick={closeMobile}
                      aria-current={isActive('/settings') ? 'page' : undefined}
                      className="flex items-center gap-3 py-3 px-4 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-xl transition-all">
                      <Settings className="w-4 h-4" aria-hidden="true" /> Settings
                    </Link>
                  </>
                )}
              </nav>
              <div className="flex flex-col gap-3 pt-6 border-t border-white/8">
                {user ? (
                  <button type="button" onClick={() => { closeMobile(); handleSignOut(); }}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-all">
                    <LogOut className="w-4 h-4" aria-hidden="true" /> Sign Out
                  </button>
                ) : (
                  <>
                    <Button href="/auth/signin" variant="ghost" fullWidth onClick={closeMobile}>Sign In</Button>
                    <Button href="/auth/signup" variant="primary" fullWidth onClick={closeMobile}>Get Started Free</Button>
                  </>
                )}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
