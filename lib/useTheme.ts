'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function apply(pref: ThemePreference) {
  const theme = resolveTheme(pref, window.matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changed the theme, or the OS did while the preference is "system".
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    apply(readPreference());
    notify();
  };
  const mql = window.matchMedia(DARK_QUERY);
  const onSystem = () => {
    if (readPreference() === 'system') apply('system');
    notify();
  };
  window.addEventListener('storage', onStorage);
  mql.addEventListener('change', onSystem);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
    mql.removeEventListener('change', onSystem);
  };
}

/** The saved preference ('light' | 'dark' | 'system') and a setter that applies it at once. */
export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, readPreference, () => DEFAULT_THEME);
  const set = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    apply(next);
    notify();
  }, []);
  return [pref, set];
}

const readResolved = (): ResolvedTheme =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

/**
 * The theme actually on the page. For code that can't use CSS variables
 * (charts, WebGL materials). The server render and first client render
 * assume light; it updates right after hydration.
 */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, readResolved, () => 'light');
}
