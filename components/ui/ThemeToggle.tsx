'use client';

import dynamic from 'next/dynamic';
import { Moon, Sun } from 'lucide-react';
import { useThemePreference } from '@/lib/useTheme';
import { cn } from '@/lib/utils';

// The settings choice lives in its own chunk, so the navbar's icon button
// doesn't carry a radio group to every page. Settings imports ThemeChoice
// directly; this keeps variant="segmented" working for anyone else.
const ThemeChoice = dynamic(() => import('@/components/ui/ThemeChoice'));

export interface ThemeToggleProps {
  className?: string;
  /**
   * icon (default): one button that switches between light and dark, for the navbar.
   * segmented: a Light / Dark / System radio group, for settings (or import
   * components/ui/ThemeChoice directly).
   */
  variant?: 'icon' | 'segmented';
}

/*
 * The icon button can't know the theme on the server, so it renders both
 * states and lets CSS show the one that matches <html data-theme>, which the
 * inline theme script sets before first paint. The server HTML, the first
 * client render and every later render are identical (no hydration
 * mismatch, no flash of the wrong icon), and the accessible name is right
 * from the first paint: the hidden label is display:none, so it isn't read.
 *
 * These look at <html data-theme> only, not at data-night sections, so a
 * toggle inside a night scene still describes the page's real theme.
 */
const SHOW_IN_LIGHT = '[[data-theme=dark]_&]:hidden';
const SHOW_IN_DARK = 'hidden [[data-theme=dark]_&]:inline';

const ICON_MOTION = 'transition-[opacity,transform] duration-500 ease-civic motion-reduce:transition-none';

function ThemeSwitch({ className }: { className?: string }) {
  const [, setPreference] = useThemePreference();

  const toggle = () => {
    // The theme on the page right now (a "system" preference included).
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    setPreference(dark ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'relative inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-transparent text-muted',
        'transition-colors duration-200 ease-civic hover:border-fg/10 hover:bg-fg/5 hover:text-ink',
        className
      )}
    >
      <span className={cn('sr-only', SHOW_IN_LIGHT)}>Switch to dark theme</span>
      <span className={cn('sr-only', SHOW_IN_DARK)}>Switch to light theme</span>
      {/* By day the moon offers the night; by night the sun offers the day. */}
      <Moon
        aria-hidden="true"
        className={cn(
          'absolute h-[1.125rem] w-[1.125rem]',
          ICON_MOTION,
          '[[data-theme=dark]_&]:-rotate-90 [[data-theme=dark]_&]:scale-50 [[data-theme=dark]_&]:opacity-0'
        )}
      />
      <Sun
        aria-hidden="true"
        className={cn(
          'absolute h-[1.125rem] w-[1.125rem] rotate-90 scale-50 opacity-0',
          ICON_MOTION,
          '[[data-theme=dark]_&]:rotate-0 [[data-theme=dark]_&]:scale-100 [[data-theme=dark]_&]:opacity-100'
        )}
      />
    </button>
  );
}

/** Light/dark theme control: an icon button for the navbar, or a Light/Dark/System choice for settings. */
export default function ThemeToggle({ className, variant = 'icon' }: ThemeToggleProps) {
  return variant === 'segmented' ? <ThemeChoice className={className} /> : <ThemeSwitch className={className} />;
}
