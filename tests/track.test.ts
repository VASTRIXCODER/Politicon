import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLICY_CATEGORIES, TRACK_EVENTS, TRACK_PROPS, policyCategory, sanitizeTrackProps, track, type TrackEvent } from '@/lib/track';
import { ANALYTICS_BOOTSTRAP, analyticsEnabled } from '@/components/Analytics';

vi.mock('server-only', () => ({}));

type Win = { va?: (...args: unknown[]) => void; vaq?: unknown[][]; si?: (...args: unknown[]) => void; siq?: unknown[][]; location?: { href: string } };
const g = globalThis as unknown as { window?: Win };

afterEach(() => {
  delete g.window;
});

describe('sanitizeTrackProps', () => {
  it('keeps allowlisted keys with allowed values', () => {
    expect(sanitizeTrackProps({ source: 'dashboard', category: 'housing', status: 'fresh', reading_mode: 'simple' }))
      .toEqual({ source: 'dashboard', category: 'housing', status: 'fresh', reading_mode: 'simple' });
    expect(sanitizeTrackProps({ target: 'chat_reply', rating: 'down' })).toEqual({ target: 'chat_reply', rating: 'down' });
  });

  it('drops keys that could carry personal or financial data', () => {
    const out = sanitizeTrackProps({
      source: 'policies',
      income: '75k_100k',
      incomeRange: '75k_100k',
      dollarImpact: '-1200',
      netAnnualImpact: '-1200',
      email: 'someone@example.com',
      policyTitle: 'One Big Beautiful Bill Act',
      title: 'H.R. 1',
      message: 'How do tariffs affect me?',
      reason: 'this is biased',
      state: 'Ohio',
      zip: '43215',
    });
    expect(out).toEqual({ source: 'policies' });
  });

  it('drops values outside each key’s list, including free text, numbers and amounts', () => {
    expect(sanitizeTrackProps({ category: 'my rent is $1,400' })).toBeUndefined();
    expect(sanitizeTrackProps({ status: '$500' })).toBeUndefined();
    expect(sanitizeTrackProps({ source: 'someone@example.com' })).toBeUndefined();
    expect(sanitizeTrackProps({ status: 'OK' })).toBeUndefined(); // exact values only
    expect(sanitizeTrackProps({ category: 1200, status: true, source: null, reading_mode: ['simple'] })).toBeUndefined();
    expect(sanitizeTrackProps({ category: { toString: () => 'taxes' } })).toBeUndefined();
  });

  it('ignores inherited and prototype keys', () => {
    expect(sanitizeTrackProps(JSON.parse('{"__proto__": {"source": "dashboard"}, "constructor": "x", "toString": "y"}'))).toBeUndefined();
    expect(sanitizeTrackProps(Object.create({ source: 'dashboard' }))).toBeUndefined();
  });

  it('returns undefined for anything that is not a plain props object', () => {
    for (const v of [undefined, null, 'source=dashboard', 42, ['source', 'dashboard'], {}]) {
      expect(sanitizeTrackProps(v)).toBeUndefined();
    }
  });

  it('has no allowed value that looks like an amount, an email or free text', () => {
    for (const values of Object.values(TRACK_PROPS)) {
      for (const v of values) expect(v).toMatch(/^[a-z][a-z_]*$/);
    }
  });
});

describe('track', () => {
  it('sends the event name and sanitized data to window.va', () => {
    const va = vi.fn();
    g.window = { va };
    track('analysis_ready', { source: 'impact', category: 'taxes', status: 'cached' });
    expect(va).toHaveBeenCalledWith('event', { name: 'analysis_ready', data: { source: 'impact', category: 'taxes', status: 'cached' } });
  });

  it('sends just the name when there is nothing safe to send', () => {
    const va = vi.fn();
    g.window = { va };
    track('onboarding_completed');
    // Smuggled past the types at runtime: still stripped.
    track('signup_completed', { email: 'someone@example.com' } as never);
    expect(va).toHaveBeenNthCalledWith(1, 'event', { name: 'onboarding_completed' });
    expect(va).toHaveBeenNthCalledWith(2, 'event', { name: 'signup_completed' });
  });

  it('ignores event names that are not in the list', () => {
    const va = vi.fn();
    g.window = { va };
    track('income_entered' as TrackEvent, { source: 'dashboard' });
    expect(va).not.toHaveBeenCalled();
  });

  it('is a no-op without the analytics script, on the server, and never throws', () => {
    g.window = {};
    expect(() => track('feed_refreshed', { source: 'dashboard' })).not.toThrow();
    delete g.window;
    expect(() => track('feed_refreshed')).not.toThrow();
    g.window = { va: () => { throw new Error('blocked'); } };
    expect(() => track('feed_refreshed')).not.toThrow();
  });

  it('rejects sensitive properties at compile time', () => {
    // These lines only need to fail type-checking (npm run typecheck); at runtime they are dropped.
    // @ts-expect-error income is not an allowed property
    track('onboarding_completed', { income: '75k_100k' });
    // @ts-expect-error amounts are not an allowed value
    track('analysis_ready', { status: '-1200' });
    // @ts-expect-error free text is not an allowed category
    track('policy_dismissed', { category: 'One Big Beautiful Bill Act' });
    // @ts-expect-error event names are a fixed list
    track('email_entered');
    expect(TRACK_EVENTS).toHaveLength(8);
  });
});

describe('policyCategory', () => {
  it('accepts known categories case-insensitively and rejects everything else', () => {
    expect(policyCategory('housing')).toBe('housing');
    expect(policyCategory(' Healthcare ')).toBe('healthcare');
    expect(policyCategory('social security')).toBeUndefined();
    expect(policyCategory('')).toBeUndefined();
    expect(policyCategory(undefined)).toBeUndefined();
    expect(policyCategory(3)).toBeUndefined();
  });

  it('matches the categories the feed model is allowed to return', async () => {
    const { FeedOutput, FeedSelectionOutput } = await import('@/lib/server/aiSchemas');
    for (const schema of [FeedOutput, FeedSelectionOutput]) {
      const category = schema.shape.policies.element.shape.category as unknown as { def: { innerType: { options: string[] } } };
      expect([...category.def.innerType.options].sort()).toEqual([...POLICY_CATEGORIES].sort());
    }
  });
});

describe('components/Analytics', () => {
  it('is on only for Vercel deployments that have not opted out', () => {
    expect(analyticsEnabled({})).toBe(false);
    expect(analyticsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(analyticsEnabled({ VERCEL: '1' })).toBe(true);
    expect(analyticsEnabled({ NEXT_PUBLIC_VERCEL_ENV: 'preview' })).toBe(true);
    expect(analyticsEnabled({ VERCEL: '1', NEXT_PUBLIC_ANALYTICS_DISABLED: '1' })).toBe(false);
    expect(analyticsEnabled({ VERCEL: '1', NEXT_PUBLIC_ANALYTICS_DISABLED: 'true' })).toBe(false);
    expect(analyticsEnabled({ VERCEL: '1', NEXT_PUBLIC_ANALYTICS_DISABLED: '0' })).toBe(true);
  });

  function boot(): { win: Win; redactVa: (e: { type: string; url: string }) => unknown; redactSi: (e: { type: string; url: string }) => unknown } {
    const win: Win = { location: { href: 'https://politicon.app/' } };
    new Function('window', ANALYTICS_BOOTSTRAP)(win);
    const [vaCmd, redactVa] = Array.from(win.vaq![0] as ArrayLike<unknown>) as [string, (e: { type: string; url: string }) => unknown];
    const [siCmd, redactSi] = Array.from(win.siq![0] as ArrayLike<unknown>) as [string, (e: { type: string; url: string }) => unknown];
    expect([vaCmd, siCmd]).toEqual(['beforeSend', 'beforeSend']);
    return { win, redactVa, redactSi };
  }

  it('installs the documented queue shims and a beforeSend hook on both', () => {
    const { win } = boot();
    expect(typeof win.va).toBe('function');
    expect(typeof win.si).toBe('function');
    win.va!('event', { name: 'feed_refreshed' });
    expect(Array.from(win.vaq![1] as ArrayLike<unknown>)).toEqual(['event', { name: 'feed_refreshed' }]);
  });

  it('strips query strings and fragments, and reports policy pages by route', () => {
    const { redactVa, redactSi } = boot();
    expect(redactVa({ type: 'pageview', url: 'https://politicon.app/auth/confirm?token_hash=abc&type=signup' }))
      .toEqual({ type: 'pageview', url: 'https://politicon.app/auth/confirm' });
    expect(redactVa({ type: 'pageview', url: 'https://politicon.app/advisor?q=how%20much%20do%20I%20owe#x' }))
      .toEqual({ type: 'pageview', url: 'https://politicon.app/advisor' });
    expect(redactVa({ type: 'event', url: 'https://politicon.app/impact/us-hr-1?tab=timeline' }))
      .toEqual({ type: 'event', url: 'https://politicon.app/impact/[policyId]' });
    expect(redactVa({ type: 'pageview', url: 'https://politicon.app/impact' }))
      .toEqual({ type: 'pageview', url: 'https://politicon.app/impact' });
    expect(redactSi({ type: 'vital', url: 'https://politicon.app/impact/oh-2025-sb-1/' }))
      .toEqual({ type: 'vital', url: 'https://politicon.app/impact/[policyId]/' });
  });

  it('drops an event whose URL cannot be read rather than sending it unredacted', () => {
    const { redactVa } = boot();
    expect(redactVa({ type: 'pageview', url: 'http://[bad' })).toBeNull();
  });
});
