import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EFFECTS,
  detectTier,
  fxOverrideAllowed,
  isEffectsPref,
  isTier,
  resolveFxOverride,
  tierReasons,
  type TierEnv,
} from '@/lib/three/tier';

/** A desktop-class machine with WebGL2 and no limits. */
const DESKTOP: TierEnv = {
  webgl2: true,
  softwareRenderer: false,
  saveData: false,
  coarsePointer: false,
  deviceMemory: 8,
  hardwareConcurrency: 10,
  pref: 'full',
  override: null,
};

describe('detectTier', () => {
  it('gives a desktop-class device tier 2', () => {
    expect(detectTier(DESKTOP)).toBe(2);
  });

  it('treats unreported memory and cores (Safari, Firefox) as not limiting', () => {
    expect(detectTier({ webgl2: true })).toBe(2);
    expect(detectTier({ ...DESKTOP, deviceMemory: undefined, hardwareConcurrency: undefined })).toBe(2);
    // A zero is "unknown", not "none".
    expect(detectTier({ ...DESKTOP, deviceMemory: 0, hardwareConcurrency: 0 })).toBe(2);
  });

  it('is tier 0 without WebGL2, whatever else is true', () => {
    expect(detectTier({ ...DESKTOP, webgl2: false })).toBe(0);
    expect(detectTier({ webgl2: false, override: 2 })).toBe(0);
  });

  it('is tier 0 with Data Saver on', () => {
    expect(detectTier({ ...DESKTOP, saveData: true })).toBe(0);
  });

  it('is tier 0 when only a software rasteriser is available', () => {
    expect(detectTier({ ...DESKTOP, softwareRenderer: true })).toBe(0);
  });

  it('is tier 0 when the visitor turned effects off', () => {
    expect(detectTier({ ...DESKTOP, pref: 'off' })).toBe(0);
  });

  it('is tier 1 on touch screens', () => {
    expect(detectTier({ ...DESKTOP, coarsePointer: true })).toBe(1);
  });

  it('is tier 1 with 4 GB of memory or less', () => {
    expect(detectTier({ ...DESKTOP, deviceMemory: 4 })).toBe(1);
    expect(detectTier({ ...DESKTOP, deviceMemory: 2 })).toBe(1);
    expect(detectTier({ ...DESKTOP, deviceMemory: 0.5 })).toBe(1);
    expect(detectTier({ ...DESKTOP, deviceMemory: 6 })).toBe(2);
  });

  it('is tier 1 with 4 CPU cores or fewer', () => {
    expect(detectTier({ ...DESKTOP, hardwareConcurrency: 4 })).toBe(1);
    expect(detectTier({ ...DESKTOP, hardwareConcurrency: 2 })).toBe(1);
    expect(detectTier({ ...DESKTOP, hardwareConcurrency: 6 })).toBe(2);
  });

  it('caps at tier 1 when the visitor chose reduced effects', () => {
    expect(detectTier({ ...DESKTOP, pref: 'reduced' })).toBe(1);
    expect(detectTier({ ...DESKTOP, pref: 'reduced', coarsePointer: true })).toBe(1);
  });

  it('never raises a tier for reduced effects', () => {
    expect(detectTier({ ...DESKTOP, pref: 'reduced', saveData: true })).toBe(0);
  });

  it('lets a QA override force any tier on a device that has WebGL2', () => {
    expect(detectTier({ ...DESKTOP, override: 0 })).toBe(0);
    expect(detectTier({ ...DESKTOP, override: 1 })).toBe(1);
    expect(detectTier({ ...DESKTOP, coarsePointer: true, override: 2 })).toBe(2);
    // It is for QA: it beats the preference, Data Saver and a software renderer (headless CI).
    expect(detectTier({ ...DESKTOP, pref: 'off', override: 2 })).toBe(2);
    expect(detectTier({ ...DESKTOP, saveData: true, override: 1 })).toBe(1);
    expect(detectTier({ ...DESKTOP, softwareRenderer: true, override: 2 })).toBe(2);
  });
});

describe('tierReasons', () => {
  it('names what limited the tier', () => {
    expect(tierReasons({ webgl2: false })).toEqual(['No WebGL2']);
    expect(tierReasons(DESKTOP)).toEqual(['Desktop-class device']);
    expect(tierReasons({ ...DESKTOP, coarsePointer: true, deviceMemory: 4 })).toEqual(['Touch screen', '4 GB memory']);
    expect(tierReasons({ ...DESKTOP, override: 1 })).toEqual(['Forced by ?fx=1']);
  });
});

describe('the ?fx= override', () => {
  it('is honoured everywhere except the production deployment', () => {
    expect(fxOverrideAllowed('production')).toBe(false);
    expect(fxOverrideAllowed('preview')).toBe(true);
    expect(fxOverrideAllowed('development')).toBe(true);
    // Local and CI builds (`next start`) have no Vercel environment.
    expect(fxOverrideAllowed(undefined)).toBe(true);
    expect(fxOverrideAllowed('')).toBe(true);
  });

  it('reads a tier from the query and asks to remember it for the tab', () => {
    expect(resolveFxOverride('?fx=0', null, true)).toEqual({ override: 0, store: '0' });
    expect(resolveFxOverride('?fx=1', null, true)).toEqual({ override: 1, store: '1' });
    expect(resolveFxOverride('?a=b&fx=2', '1', true)).toEqual({ override: 2, store: '2' });
  });

  it('clears the override for ?fx=auto, an empty value or anything that is not a tier', () => {
    for (const q of ['?fx=auto', '?fx=', '?fx=3', '?fx=-1', '?fx=1.5', '?fx=two', '?fx=%20']) {
      expect(resolveFxOverride(q, '2', true), q).toEqual({ override: null, store: null });
    }
  });

  it('falls back to what an earlier ?fx= stored, and leaves storage alone', () => {
    expect(resolveFxOverride('', '2', true)).toEqual({ override: 2 });
    expect(resolveFxOverride('?other=1', '0', true)).toEqual({ override: 0 });
    expect(resolveFxOverride('', null, true)).toEqual({ override: null });
    expect(resolveFxOverride('', '', true)).toEqual({ override: null });
    expect(resolveFxOverride('', 'junk', true)).toEqual({ override: null });
  });

  it('is ignored entirely where it is not allowed', () => {
    expect(resolveFxOverride('?fx=2', null, false)).toEqual({ override: null });
    expect(resolveFxOverride('', '2', false)).toEqual({ override: null });
  });
});

describe('guards', () => {
  it('recognises tiers and effects preferences', () => {
    expect([0, 1, 2].every(isTier)).toBe(true);
    for (const v of [3, -1, 1.5, '1', null, undefined]) expect(isTier(v), String(v)).toBe(false);
    expect(['full', 'reduced', 'off'].every(isEffectsPref)).toBe(true);
    for (const v of ['Full', 'none', '', null, 0]) expect(isEffectsPref(v), String(v)).toBe(false);
    expect(DEFAULT_EFFECTS).toBe('full');
  });
});
