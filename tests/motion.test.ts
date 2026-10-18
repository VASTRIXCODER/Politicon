import { describe, expect, it } from 'vitest';
import { MOTION_ATTR, MOTION_SCRIPT, MOTION_STORAGE_KEY, isMotionPaused, parseMotionPreference, prefersLessMotion } from '@/lib/motion';

describe('the "Pause motion" preference', () => {
  it('is paused only by an explicit "paused"', () => {
    expect(parseMotionPreference('paused')).toBe(true);
    for (const v of [null, undefined, '', 'on', 'off', 'Paused', 'true', 1, {}]) {
      expect(parseMotionPreference(v), String(v)).toBe(false);
    }
  });

  it('assumes motion is allowed on the server', () => {
    expect(isMotionPaused()).toBe(false);
    expect(prefersLessMotion()).toBe(false);
  });
});

/*
 * MOTION_SCRIPT runs inline in <head> before the body exists (beside
 * THEME_SCRIPT), so it is tested the way the browser runs it: as a plain
 * script, against a fake document and localStorage.
 */
function runMotionScript(stored: string | null, storageThrows = false) {
  const attributes: Record<string, string> = {};
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('SecurityError: access denied');
      return key === MOTION_STORAGE_KEY ? stored : null;
    },
  };
  new Function('document', 'localStorage', MOTION_SCRIPT)(document, localStorage);
  return attributes[MOTION_ATTR];
}

describe('MOTION_SCRIPT', () => {
  it('marks the page paused before first paint when the visitor paused motion', () => {
    expect(MOTION_STORAGE_KEY).toBe('pc-motion');
    expect(runMotionScript('paused')).toBe('paused');
  });

  it('leaves motion alone otherwise, storage errors included', () => {
    expect(runMotionScript(null)).toBeUndefined();
    expect(runMotionScript('on')).toBeUndefined();
    expect(runMotionScript(null, true)).toBeUndefined();
  });

  it('is a self-contained expression with no eval or external references', () => {
    expect(MOTION_SCRIPT.startsWith('(function(){')).toBe(true);
    expect(MOTION_SCRIPT.trim().endsWith('})();')).toBe(true);
    expect(MOTION_SCRIPT).not.toMatch(/\beval\b|new Function|import\(|<\/script/i);
  });
});
