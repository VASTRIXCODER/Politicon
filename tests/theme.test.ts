import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
} from '@/lib/theme';

describe('isThemePreference', () => {
  it('accepts the three preferences', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const v of ['', 'Dark', 'auto', 'night', null, undefined, 0, 1, {}, ['dark']]) {
      expect(isThemePreference(v), String(v)).toBe(false);
    }
  });
});

describe('resolveTheme', () => {
  it('keeps an explicit choice, whatever the OS says', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the OS for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('defaults to light', () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(resolveTheme(DEFAULT_THEME, true)).toBe('light');
  });
});

/*
 * THEME_SCRIPT runs inline in <head> before the body exists, so it is tested
 * the way the browser runs it: as a plain script, against a fake document,
 * localStorage and matchMedia.
 */
interface RunOptions {
  /** What localStorage holds under the theme key (null = nothing saved). */
  stored?: string | null;
  /** The OS colour scheme. */
  systemDark?: boolean;
  /** localStorage throws on access (private mode, blocked site data). */
  storageThrows?: boolean;
  /** matchMedia is missing or throws. */
  matchMediaThrows?: boolean;
}

function runThemeScript({ stored = null, systemDark = false, storageThrows = false, matchMediaThrows = false }: RunOptions = {}) {
  const attributes: Record<string, string> = {};
  const style: { colorScheme?: string } = {};
  const reads: string[] = [];
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
      style,
    },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('SecurityError: access denied');
      reads.push(key);
      return stored;
    },
  };
  const window = {
    matchMedia: (query: string) => {
      if (matchMediaThrows) throw new TypeError('matchMedia is not a function');
      return { matches: query === '(prefers-color-scheme: dark)' && systemDark };
    },
  };
  new Function('document', 'localStorage', 'window', THEME_SCRIPT)(document, localStorage, window);
  return { theme: attributes['data-theme'], colorScheme: style.colorScheme, reads };
}

describe('THEME_SCRIPT', () => {
  it('reads the saved preference from the shared storage key', () => {
    expect(THEME_STORAGE_KEY).toBe('pc-theme');
    expect(runThemeScript({ stored: 'dark' }).reads).toEqual([THEME_STORAGE_KEY]);
  });

  it('applies a saved light or dark choice', () => {
    expect(runThemeScript({ stored: 'light', systemDark: true })).toMatchObject({ theme: 'light', colorScheme: 'light' });
    expect(runThemeScript({ stored: 'dark', systemDark: false })).toMatchObject({ theme: 'dark', colorScheme: 'dark' });
  });

  it('follows the OS when the preference is "system"', () => {
    expect(runThemeScript({ stored: 'system', systemDark: true })).toMatchObject({ theme: 'dark', colorScheme: 'dark' });
    expect(runThemeScript({ stored: 'system', systemDark: false })).toMatchObject({ theme: 'light', colorScheme: 'light' });
  });

  it('falls back to light with nothing saved, even on a dark OS', () => {
    expect(runThemeScript({ stored: null, systemDark: true })).toMatchObject({ theme: 'light', colorScheme: 'light' });
  });

  it('ignores a garbage value', () => {
    for (const stored of ['', 'purple', 'DARK', '"dark"', 'system ']) {
      expect(runThemeScript({ stored, systemDark: true }).theme, JSON.stringify(stored)).toBe('light');
    }
  });

  it('falls back to light when storage throws', () => {
    expect(runThemeScript({ storageThrows: true, systemDark: true })).toMatchObject({ theme: 'light', colorScheme: 'light' });
  });

  it('falls back to light when matchMedia throws', () => {
    expect(runThemeScript({ stored: 'system', matchMediaThrows: true })).toMatchObject({ theme: 'light', colorScheme: 'light' });
  });

  it('agrees with resolveTheme for every valid preference', () => {
    for (const pref of ['light', 'dark', 'system'] as const) {
      for (const systemDark of [true, false]) {
        expect(runThemeScript({ stored: pref, systemDark }).theme, `${pref}/${systemDark}`).toBe(resolveTheme(pref, systemDark));
      }
    }
  });

  it('is a self-contained expression with no eval or external references', () => {
    expect(THEME_SCRIPT.startsWith('(function(){')).toBe(true);
    expect(THEME_SCRIPT.trim().endsWith('})();')).toBe(true);
    expect(THEME_SCRIPT).not.toMatch(/\beval\b|new Function|import\(|<\/script/i);
  });
});
