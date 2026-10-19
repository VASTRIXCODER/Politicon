'use client';

import { useState, useEffect, useRef, useId, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, LogOut, LayoutDashboard, Settings, ChevronDown, ArrowUpRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Logo from '@/components/ui/Logo';
import MotionToggle from '@/components/ui/MotionToggle';
import SoundToggle from '@/components/ui/SoundToggle';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useModalDialog } from '@/components/layout/useModalDialog';
import { usePresence } from '@/components/layout/usePresence';
import { useNavNight } from '@/components/layout/useNavNight';
import { cn } from '@/lib/utils';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const PUBLIC_LINKS = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Explorer', href: '/explorer' },
  { label: 'Help', href: '/help' },
];
const APP_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Policies', href: '/policies' },
  { label: 'My Impact', href: '/impact' },
  { label: 'Policy Guide', href: '/advisor' },
];

/** How long the account menu and the drawer take to leave (their CSS transitions). */
const MENU_EXIT_MS = 180;
const DRAWER_EXIT_MS = 450;

const MENU_ITEM =
  'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors duration-200 ease-civic';

/*
 * A desktop link: a quiet pill whose underline is a short bar of violet light.
 * Hover lights it halfway; the current page keeps it lit, with a faint tint.
 */
const DESKTOP_LINK = cn(
  // Tighter at md, where the bar is narrowest with every link showing.
  'relative rounded-full px-2.5 py-2 text-sm font-body transition-colors duration-200 ease-civic lg:px-3.5',
  "after:pointer-events-none after:absolute after:bottom-[5px] after:left-1/2 after:h-[2px] after:w-5 after:-translate-x-1/2 after:rounded-full after:content-['']",
  'after:bg-primary after:shadow-[0_0_10px_1px_rgb(var(--c-violet)/0.6)]',
  'after:origin-center after:scale-x-0 after:opacity-0 after:transition-[transform,opacity] after:duration-300 after:ease-civic',
  'hover:after:scale-x-100 hover:after:opacity-50 focus-visible:after:scale-x-100 focus-visible:after:opacity-50'
);
const DESKTOP_LINK_ACTIVE = 'bg-primary/8 text-ink after:!scale-x-100 after:!opacity-100';

/** The motion, sound and theme buttons: narrower on the smallest phones and at md, where the bar is fullest. */
const PREF_BUTTON = 'max-[359px]:w-8 md:max-lg:w-8';

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
  const menu = usePresence(open, MENU_EXIT_MS);
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
        className={cn(
          'flex h-10 items-center gap-2 rounded-full border border-fg/10 bg-raised/70 pl-1 pr-2.5 transition-colors duration-200 ease-civic',
          'hover:border-primary/30 hover:bg-raised',
          open && 'border-primary/30 bg-raised'
        )}
      >
        {/* Initials on a disc lit from above by violet light. */}
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/25 bg-[radial-gradient(circle_at_50%_0%,rgb(var(--c-violet)/0.22),rgb(var(--c-violet)/0.08)_70%)]"
        >
          <span className="font-mono-data text-[0.6875rem] font-semibold tracking-wide text-primary-300">{initials}</span>
        </span>
        {/* The name is always part of the button's name; it's shown on wide screens only. */}
        <span className="text-sm text-ink">
          <span className="sr-only">Account: </span>
          <span className="sr-only lg:not-sr-only lg:inline-block lg:max-w-[9rem] lg:truncate lg:align-bottom">{firstName}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('h-3.5 w-3.5 text-muted transition-transform duration-200 ease-civic', open && 'rotate-180')}
        />
      </button>

      {menu.mounted && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          onKeyDown={onMenuKeyDown}
          inert={!open}
          data-shown={menu.shown || undefined}
          className={cn(
            'absolute right-0 z-50 mt-2.5 w-56 origin-top-right rounded-2xl border border-fg/10 bg-raised p-1.5 shadow-lift',
            'translate-y-1.5 scale-[0.98] opacity-0 transition-[opacity,transform] duration-[180ms] ease-civic motion-reduce:transition-none',
            'data-[shown]:translate-y-0 data-[shown]:scale-100 data-[shown]:opacity-100'
          )}
        >
          <Link
            href="/dashboard"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className={`${MENU_ITEM} text-muted hover:text-ink hover:bg-fg/5 focus:text-ink focus:bg-primary/8`}
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Dashboard
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className={`${MENU_ITEM} text-muted hover:text-ink hover:bg-fg/5 focus:text-ink focus:bg-primary/8`}
          >
            <Settings className="h-4 w-4" aria-hidden="true" /> Settings
          </Link>
          <div role="separator" className="mx-2 my-1 h-px bg-fg/8" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => { close(true); onSignOut(); }}
            className={`${MENU_ITEM} text-danger hover:bg-danger/10 focus:bg-danger/10`}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
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
  const drawer = usePresence(mobileOpen, DRAWER_EXIT_MS);
  // Over a night section the bar turns to night glass with it (its tokens flip).
  const barRef = useRef<HTMLDivElement>(null);
  const overNight = useNavNight(barRef);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
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
      {/*
        A floating bar of frosted glass (glass is for navigation and controls).
        No entrance animation: it is server-rendered visible, so it paints
        before hydration. At the top of the page it rests lighter and lower;
        once the page scrolls it rises a little and turns more opaque. Over a
        night section (the film at dusk, the closing call to action) it turns
        to night glass, so its links keep their contrast.
      */}
      <nav
        aria-label="Main"
        data-night={overNight ? '' : undefined}
        className={cn(
          'fixed inset-x-0 top-0 z-nav px-3 transition-[padding] duration-300 ease-civic sm:px-5',
          scrolled ? 'pt-2 sm:pt-3' : 'pt-3 sm:pt-4'
        )}
      >
        <div
          ref={barRef}
          className={cn(
            'glass-nav relative mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 rounded-full border border-fg/10 pl-4 pr-2 sm:pl-5 lg:gap-3',
            'transition-[background-color,border-color,box-shadow] duration-300 ease-civic',
            // Opaque when less transparency is asked for (beats the theme tints below).
            '[@media(prefers-reduced-transparency:reduce)]:!bg-surface',
            // A thin rim of violet light along the top edge.
            'before:pointer-events-none before:absolute before:inset-x-10 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/45 before:to-transparent',
            scrolled
              ? 'border-fg/12 shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_14px_36px_-18px_rgb(var(--c-fg)/0.32)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.07),0_18px_40px_-18px_rgb(0_0_0/0.75)]'
              : 'bg-canvas/55 shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] dark:bg-canvas/45 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]'
          )}
        >
          <Logo className="flex-shrink-0" />

          {/* Desktop links */}
          <div className="hidden items-center gap-0.5 md:flex">
            {!authLoading && navLinks.map(link => (
              <Link
                key={link.label}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={cn(DESKTOP_LINK, isActive(link.href) ? DESKTOP_LINK_ACTIVE : 'text-muted hover:text-ink')}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Preferences, then the CTA or the account menu (desktop) / the menu button (mobile).
              The three preference buttons slim down where the bar is narrowest. */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <MotionToggle className={PREF_BUTTON} />
            <SoundToggle className={PREF_BUTTON} />
            <ThemeToggle className={PREF_BUTTON} />
            <span aria-hidden="true" className="mx-1.5 hidden h-5 w-px bg-fg/12 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              {authLoading ? (
                <div className="h-9 w-40 rounded-full bg-fg/5 animate-pulse" aria-hidden="true" />
              ) : user ? (
                <UserDropdown user={user} onSignOut={handleSignOut} />
              ) : (
                <>
                  <Button href="/auth/signin" variant="ghost" size="sm" className="border-transparent bg-transparent px-3 hover:border-fg/10">Sign in</Button>
                  <Button href="/auth/signup" variant="primary" size="sm">Get started</Button>
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              ref={menuButtonRef}
              type="button"
              className="ml-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-fg/10 bg-raised/70 text-ink transition-colors duration-200 ease-civic hover:border-primary/30 hover:bg-raised md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu: a full-height sheet of paper (night in the dark theme) with large editorial links. */}
      {drawer.mounted && (
        <>
          <div
            data-shown={drawer.shown || undefined}
            className="fixed inset-0 z-overlay bg-ink/40 opacity-0 backdrop-blur-sm transition-opacity duration-300 ease-civic data-[shown]:opacity-100 motion-reduce:transition-none dark:bg-black/60"
            onClick={closeMobile}
            aria-hidden="true"
            // Wheel/touch over the backdrop must not reach Lenis (the page is scroll-locked).
            data-lenis-prevent
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerTitleId}
            tabIndex={-1}
            data-lenis-prevent
            // Leaving: out of reach at once, while it slides away.
            inert={!mobileOpen}
            data-shown={drawer.shown || undefined}
            className={cn(
              'group/drawer fixed inset-y-0 right-0 z-modal flex w-full flex-col overflow-y-auto overscroll-contain bg-canvas focus:outline-none sm:max-w-sm sm:border-l sm:border-fg/10',
              'shadow-[-24px_0_60px_-30px_rgb(var(--c-fg)/0.35)] dark:shadow-[-24px_0_60px_-24px_rgb(0_0_0/0.8)]',
              'translate-x-full transition-transform duration-[450ms] ease-civic data-[shown]:translate-x-0 motion-reduce:transition-none'
            )}
          >
            {/* Light falling into the sheet from its top corner. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_80%_70%_at_85%_-10%,rgb(var(--c-violet)/0.16),transparent_70%)]"
            />

            <div className="relative flex items-center justify-between px-5 pb-4 pt-5">
              <h2 id={drawerTitleId} className="sr-only">Menu</h2>
              <Logo variant="wordmark" href={null} />
              <button
                type="button"
                onClick={closeMobile}
                aria-label="Close menu"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-fg/10 bg-raised/70 text-ink transition-colors duration-200 ease-civic hover:border-primary/30 hover:bg-raised"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="Main" className="relative flex flex-1 flex-col px-5 pt-6">
              <ol className="flex flex-col">
                {navLinks.map((link, i) => {
                  const active = isActive(link.href);
                  return (
                    <li
                      key={link.label}
                      // Each link rises in after the sheet, one after another.
                      style={{ transitionDelay: `${80 + i * 50}ms` }}
                      className={cn(
                        'border-b border-fg/8 translate-y-3.5 opacity-0 transition-[opacity,transform] duration-[450ms] ease-civic motion-reduce:transition-none',
                        'group-data-[shown]/drawer:translate-y-0 group-data-[shown]/drawer:opacity-100'
                      )}
                    >
                      <Link
                        href={link.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group flex items-baseline gap-4 rounded-lg py-4 font-display text-[2rem] leading-none tracking-[-0.02em] transition-colors duration-200 ease-civic',
                          active ? 'text-ink' : 'text-ink/80 hover:text-ink'
                        )}
                        onClick={closeMobile}
                      >
                        <span aria-hidden="true" className="w-6 font-mono-data text-meta text-muted">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        {/* The current page in the display face's violet italic (.font-display .accent). */}
                        <span className={active ? 'accent' : undefined}>{link.label}</span>
                        {active && (
                          <span
                            aria-hidden="true"
                            className="ml-auto h-2 w-2 self-center rounded-full bg-primary shadow-[0_0_10px_2px_rgb(var(--c-violet)/0.55)]"
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ol>
              {user && (
                <Link
                  href="/settings"
                  onClick={closeMobile}
                  aria-current={isActive('/settings') ? 'page' : undefined}
                  className="mt-6 flex w-fit items-center gap-2.5 rounded-lg py-2 text-base text-muted transition-colors hover:text-ink"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" /> Settings
                </Link>
              )}
            </nav>

            <div className="relative flex flex-col gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
              {user ? (
                <button
                  type="button"
                  onClick={() => { closeMobile(); void handleSignOut(); }}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-danger/25 text-sm text-danger transition-colors hover:bg-danger/10"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
                </button>
              ) : (
                <>
                  <Button href="/auth/signin" variant="ghost" size="lg" fullWidth onClick={closeMobile}>Sign in</Button>
                  <Button href="/auth/signup" variant="primary" size="lg" fullWidth onClick={closeMobile} icon={<ArrowUpRight className="h-4 w-4" />} iconPosition="end">
                    Get started free
                  </Button>
                </>
              )}
              <p className="pt-2 text-center text-meta text-muted">Non-partisan · Educational estimates, not advice</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
