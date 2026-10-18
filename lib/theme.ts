/**
 * Light/dark theme preference. Light is the default; the choice is stored in
 * localStorage and applied to <html data-theme> before first paint by
 * THEME_SCRIPT (inlined in app/layout.tsx), so there is no flash.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'pc-theme';
export const DEFAULT_THEME: ThemePreference = 'light';

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === 'light' || v === 'dark' || v === 'system';
}

export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

/**
 * Runs in <head> before the body is parsed. Kept tiny and dependency-free;
 * any storage error (private mode, blocked cookies) falls back to light.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,t='light';try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');if(p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches))t='dark';}catch(e){}d.setAttribute('data-theme',t);d.style.colorScheme=t;})();`;
