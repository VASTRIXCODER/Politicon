import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';

/*
 * lib/viewTransition: the docket card → detail hero morph, tested against a
 * fake document whose startViewTransition behaves like the browser's: it
 * names nothing itself, runs the update a moment later (after the old
 * picture), and settles `finished` once the update is done and the
 * animation (ANIMATION_MS here) has played.
 */

const root = path.resolve(__dirname, '..');
const source = (file: string) => readFileSync(path.join(root, file), 'utf8');

/** An element with attributes, a parent, and an inline style we can read back. */
class FakeEl {
  readonly styles = new Map<string, string>();
  readonly style = {
    setProperty: (k: string, v: string) => void this.styles.set(k, v),
    removeProperty: (k: string) => void this.styles.delete(k),
  };
  constructor(
    readonly attrs: Record<string, string> = {},
    readonly parent: FakeEl | null = null
  ) {}
  closest(selector: string): FakeEl | null {
    const m = /^\[([\w-]+)="([^"]+)"\]$/.exec(selector);
    if (!m) throw new Error(`unexpected selector ${selector}`);
    for (let el: FakeEl | null = this; el; el = el.parent) if (el.attrs[m[1]] === m[2]) return el;
    return null;
  }
  get transitionName() {
    return this.styles.get('view-transition-name');
  }
}

interface FakeTransition {
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  finished: Promise<void>;
  /** The source's name when the browser took the old picture. */
  namedAtCapture: string | undefined;
}

let location: { href: string; pathname: string };
let hero: FakeEl | null;
let animations: { effect: { pseudoElement: string | null; updateTiming: ReturnType<typeof vi.fn> } }[];
let transitions: FakeTransition[];
let store: Map<string, string>;
let reducedMotion: boolean;
let capturedSource: FakeEl | null;
/** <html>'s attributes (data-morphing while a morph runs, data-motion when paused). */
let htmlAttrs: Map<string, string>;

const ANIMATION_MS = 300;

function fakeStart(update: () => Promise<void>): FakeTransition {
  const t = {} as FakeTransition;
  t.namedAtCapture = capturedSource?.transitionName;
  // The browser calls the update after taking the old picture, never synchronously.
  t.updateCallbackDone = Promise.resolve().then(update);
  t.ready = t.updateCallbackDone;
  t.finished = t.updateCallbackDone.then(() => new Promise<void>((r) => setTimeout(r, ANIMATION_MS)));
  transitions.push(t);
  return t;
}

function installDom({ api = true }: { api?: boolean } = {}) {
  location = { href: 'https://politicon.test/dashboard', pathname: '/dashboard' };
  hero = null;
  animations = [];
  transitions = [];
  store = new Map();
  reducedMotion = false;
  htmlAttrs = new Map();
  vi.stubGlobal('window', {
    location,
    matchMedia: () => ({ matches: reducedMotion }),
  });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('document', {
    ...(api ? { startViewTransition: vi.fn(fakeStart) } : {}),
    querySelector: (selector: string) => (hero && selector === '[data-vt-target="bill-sheet"]' ? hero : null),
    documentElement: {
      getAnimations: () => animations,
      getAttribute: (k: string) => htmlAttrs.get(k) ?? null,
      hasAttribute: (k: string) => htmlAttrs.has(k),
      setAttribute: (k: string, v: string) => void htmlAttrs.set(k, v),
      removeAttribute: (k: string) => void htmlAttrs.delete(k),
    },
  });
}

/** A docket card's sheet with its "View full impact" link inside. */
function card() {
  const sheet = new FakeEl({ 'data-vt-source': 'bill-sheet' });
  const link = new FakeEl({}, new FakeEl({}, sheet));
  capturedSource = sheet;
  return { sheet, link };
}

const load = () => import('@/lib/viewTransition');

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  installDom();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  capturedSource = null;
});

describe('morphSource / morphTarget', () => {
  it('are plain data attributes, so they render on the server', async () => {
    const vt = await load();
    expect(vt.morphSource('bill-sheet')).toEqual({ 'data-vt-source': 'bill-sheet' });
    expect(vt.morphTarget('bill-sheet')).toEqual({ 'data-vt-target': 'bill-sheet' });
  });
});

describe('navigateWithMorph: when it stands aside (the link navigates as usual)', () => {
  it('without the View Transitions API', async () => {
    installDom({ api: false });
    const vt = await load();
    const navigate = vi.fn();
    expect(vt.canMorph()).toBe(false);
    expect(vt.navigateWithMorph(card().link as unknown as Element, '/impact/x', navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('under reduced motion, and with "Pause motion" on', async () => {
    reducedMotion = true;
    let vt = await load();
    const { sheet, link } = card();
    expect(vt.canMorph()).toBe(false);
    expect(vt.navigateWithMorph(link as unknown as Element, '/impact/x', vi.fn())).toBe(false);

    reducedMotion = false;
    store.set('pc-motion', 'paused');
    vi.resetModules();
    vt = await load();
    expect(vt.navigateWithMorph(link as unknown as Element, '/impact/x', vi.fn())).toBe(false);
    expect(sheet.transitionName).toBeUndefined();
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });

  it('when the link is not on a bill sheet (a chat bubble, the impact list)', async () => {
    const vt = await load();
    const loose = new FakeEl({}, new FakeEl());
    expect(vt.navigateWithMorph(loose as unknown as Element, '/impact/x', vi.fn())).toBe(false);
    expect(vt.navigateWithMorph(null, '/impact/x', vi.fn())).toBe(false);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });

  it('when the browser refuses to start, leaving nothing named', async () => {
    vi.mocked(document.startViewTransition).mockImplementation(() => {
      throw new Error('InvalidStateError');
    });
    const vt = await load();
    const { sheet, link } = card();
    expect(vt.navigateWithMorph(link as unknown as Element, '/impact/x', vi.fn())).toBe(false);
    expect(sheet.transitionName).toBeUndefined();
    expect(vt.isMorphing()).toBe(false);
  });
});

describe('navigateWithMorph: the morph', () => {
  it('names only the clicked sheet for the old picture, then the hero for the new one, and clears both', async () => {
    const vt = await load();
    const { sheet, link } = card();
    const other = new FakeEl({ 'data-vt-source': 'bill-sheet' });
    const navigate = vi.fn(() => {
      location.pathname = '/impact/us-119-hr-1001';
    });

    expect(vt.navigateWithMorph(link as unknown as Element, '/impact/us-119-hr-1001', navigate)).toBe(true);
    expect(vt.isMorphing()).toBe(true);
    expect(transitions[0].namedAtCapture).toBe('bill-sheet');
    expect(other.transitionName).toBeUndefined();
    // The update runs after the old picture, not inside the click.
    expect(navigate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).toHaveBeenCalledTimes(1);
    // The old picture is taken: the card gives its name up for the hero.
    expect(sheet.transitionName).toBeUndefined();
    // The route rendered, the hero hasn't yet (its analysis is loading): the morph waits for it.
    expect(vt.isMorphArriving('bill-sheet')).toBe(true);

    hero = new FakeEl({ 'data-vt-target': 'bill-sheet' });
    await vi.advanceTimersByTimeAsync(50);
    expect(hero.transitionName).toBe('bill-sheet');
    expect(vt.isMorphArriving('bill-sheet')).toBe(false);

    // Named through the animation, cleared at its end.
    await vi.advanceTimersByTimeAsync(ANIMATION_MS - 60);
    expect(hero.transitionName).toBe('bill-sheet');
    expect(vt.isMorphing()).toBe(true);
    await vi.advanceTimersByTimeAsync(60);
    expect(hero.transitionName).toBeUndefined();
    expect(sheet.transitionName).toBeUndefined();
    expect(vt.isMorphing()).toBe(false);
  });

  it('holds the old picture for a bounded time only', async () => {
    const vt = await load();
    // The route renders, but the hero never does (a slow analysis): it lands without one.
    const navigate = () => {
      location.pathname = '/impact/x';
    };
    vt.navigateWithMorph(card().link as unknown as Element, '/impact/x', navigate);
    let done = false;
    void transitions[0].updateCallbackDone.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(vt.TARGET_WAIT_MS - 20);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(40);
    expect(done).toBe(true);
    await vi.advanceTimersByTimeAsync(ANIMATION_MS);
    expect(vt.isMorphing()).toBe(false);

    // The route itself is slow: the update ends at the cap and the navigation finishes unanimated.
    const slow = vi.fn();
    vt.navigateWithMorph(card().link as unknown as Element, '/impact/y', slow);
    let slowDone = false;
    void transitions[1].updateCallbackDone.then(() => (slowDone = true));
    await vi.advanceTimersByTimeAsync(vt.NAV_WAIT_MS + 20);
    expect(slow).toHaveBeenCalledTimes(1);
    expect(slowDone).toBe(true);
    expect(vt.NAV_WAIT_MS + vt.TARGET_WAIT_MS).toBeLessThan(4000); // inside the browser's own update timeout
  });

  it('runs one morph at a time (a second click navigates as usual)', async () => {
    const vt = await load();
    const navigate = () => {
      location.pathname = '/impact/x';
    };
    expect(vt.navigateWithMorph(card().link as unknown as Element, '/impact/x', navigate)).toBe(true);
    expect(vt.navigateWithMorph(card().link as unknown as Element, '/impact/y', vi.fn())).toBe(false);
  });

  it('paces the morph on the civic ease, leaving every other animation alone', async () => {
    const vt = await load();
    const morph = { effect: { pseudoElement: '::view-transition-group(bill-sheet)', updateTiming: vi.fn() } };
    const crossfade = { effect: { pseudoElement: '::view-transition-old(root)', updateTiming: vi.fn() } };
    const page = { effect: { pseudoElement: null, updateTiming: vi.fn() } };
    animations = [morph, crossfade, page];
    hero = new FakeEl({ 'data-vt-target': 'bill-sheet' });
    vt.navigateWithMorph(card().link as unknown as Element, '/impact/x', () => {
      location.pathname = '/impact/x';
    });
    await vi.advanceTimersByTimeAsync(20);
    await transitions[0].ready;
    expect(morph.effect.updateTiming).toHaveBeenCalledWith({ duration: vt.MORPH_MS, easing: 'cubic-bezier(.2,.7,.2,1)' });
    expect(crossfade.effect.updateTiming).toHaveBeenCalledTimes(1);
    expect(page.effect.updateTiming).not.toHaveBeenCalled();
    expect(vt.MORPH_MS).toBeLessThanOrEqual(300);
  });

  it('survives a transition the browser skips (rejected promises are handled)', async () => {
    vi.mocked(document.startViewTransition).mockImplementation((update) => {
      const done = Promise.resolve().then(update as () => Promise<void>);
      const skipped = done.then(() => Promise.reject(new Error('AbortError: skipped')));
      return { updateCallbackDone: done, ready: skipped, finished: skipped } as unknown as ViewTransition;
    });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const vt = await load();
    const navigate = vi.fn(() => {
      location.pathname = '/impact/x';
    });
    vt.navigateWithMorph(card().link as unknown as Element, '/impact/x', navigate);
    await vi.advanceTimersByTimeAsync(vt.TARGET_WAIT_MS + 50);
    await new Promise((r) => setImmediate(r));
    process.off('unhandledRejection', unhandled);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
    expect(vt.isMorphing()).toBe(false);
  });
});

describe('the morph’s ends', () => {
  it('marks every docket card’s sheet as a source and the detail hero’s title block as the target', () => {
    expect(source('components/PolicyFeedCard.tsx')).toMatch(/<div ref=\{sheetRef\} \{\.\.\.morphSource\('bill-sheet'\)\}/);
    const header = source('app/impact/[policyId]/_components/TransmissionHeader.tsx');
    expect(header).toMatch(/\{\.\.\.morphTarget\('bill-sheet'\)\}/);
    // Arriving by the morph, the title block skips its own rise.
    expect(header).toMatch(/isMorphArriving\('bill-sheet'\)/);
  });

  it('opens the detail view from "View full impact" through the morph, a plain link where it can’t run', () => {
    const button = source('components/ViewFullImpactButton.tsx');
    expect(button).toContain('navigateWithMorph(from, href, () => push(href))');
    // The analysed card's link only prevents its default when the morph took the click over.
    expect(button).toMatch(/if \(openImpact\(e\.currentTarget, target, push\)\) e\.preventDefault\(\);/);
  });
});

describe('page-enter transitions', () => {
  const SIGNED_IN = ['dashboard', 'policies', 'impact', 'advisor'];
  // Settings and onboarding open on a full-page loader: an entrance would play on the loader and cut off the page.
  const LOADER_FIRST = ['settings', 'onboarding'];
  const NEVER = ['', 'explorer', 'help', 'privacy', 'terms', 'disclaimer', 'auth', 'lab', ...LOADER_FIRST];

  it('wrap every signed-in page that renders itself first, and never /, the marketing or the auth pages', () => {
    for (const route of SIGNED_IN) {
      const file = path.join(root, 'app', route, 'template.tsx');
      expect(existsSync(file), route).toBe(true);
      expect(readFileSync(file, 'utf8'), route).toContain('<PageEnter>{children}</PageEnter>');
    }
    for (const route of NEVER) expect(existsSync(path.join(root, 'app', route, 'template.tsx')), route || '/').toBe(false);
    // The pages without one do open on the loader (if that changes, they can have their entrance back).
    expect(source('app/settings/page.tsx')).toMatch(/if \(loading\) return <FullPageLoader/);
    expect(source('app/onboarding/page.tsx')).toMatch(/if \(!userId\) return <FullPageLoader/);
  });

  it('play only after a client-side navigation, with motion allowed and no morph running', async () => {
    const { pageEnters } = await import('@/components/layout/PageEnter');
    expect(pageEnters(false)).toBe(false);
    expect(pageEnters(true)).toBe(true);
    reducedMotion = true;
    expect(pageEnters(true)).toBe(false);
    reducedMotion = false;
    // "Pause motion", as the head script and lib/motion mark it on <html>.
    htmlAttrs.set('data-motion', 'paused');
    expect(pageEnters(true)).toBe(false);
  });

  it('keep the morph and lib/motion out of the entrance (every signed-in page loads it first)', async () => {
    const entrance = source('components/layout/PageEnter.tsx');
    expect(entrance).not.toMatch(/from '@\/lib\/(viewTransition|motion|motionScript)'/);
    // Its own spelling of the motion preference's names matches lib/motionScript's.
    const { MOTION_ATTR_NAME, REDUCED_QUERY } = await import('@/components/layout/PageEnter');
    const { MOTION_ATTR, REDUCED_MOTION_QUERY } = await import('@/lib/motionScript');
    expect([MOTION_ATTR_NAME, REDUCED_QUERY]).toEqual([MOTION_ATTR, REDUCED_MOTION_QUERY]);
  });

  it('stand aside while a morph carries the page in', async () => {
    const vt = await load();
    const { pageEnters } = await import('@/components/layout/PageEnter');
    vt.navigateWithMorph(card().link as unknown as Element, '/impact/x', () => {
      location.pathname = '/impact/x';
    });
    expect(htmlAttrs.has('data-morphing')).toBe(true);
    expect(pageEnters(true)).toBe(false);
    await vi.advanceTimersByTimeAsync(vt.TARGET_WAIT_MS + ANIMATION_MS + 50);
    expect(htmlAttrs.has('data-morphing')).toBe(false);
    expect(pageEnters(true)).toBe(true);
  });

  it('render the same still markup on the server and while hydrating (no entrance, no sweep)', async () => {
    vi.unstubAllGlobals();
    const { default: PageEnter } = await import('@/components/layout/PageEnter');
    const html = renderToString(h(PageEnter, null, h('main', { id: 'main' }, 'Hello')));
    expect(html).toMatch(/^<div class="[^"]*root[^"]*"><main id="main">Hello<\/main><\/div>$/);
    expect(html).not.toMatch(/enter|sweep|data-decorative/);
  });

  it('keep their CSS short, on the civic ease, opaque at the end, and off under reduced motion and Pause motion', () => {
    const css = source('components/layout/pageEnter.module.css');
    const ms = [...css.matchAll(/animation:\s*[\w-]+\s+(\d+)ms\s+var\(--ease-civic\)/g)].map((m) => Number(m[1]));
    expect(ms.length).toBe(2);
    for (const d of ms) expect(d).toBeLessThanOrEqual(300);
    // The rise only starts transparent (fill: backwards); it ends on the page's own opacity.
    expect(css).toMatch(/page-enter 280ms var\(--ease-civic\) backwards/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/html\[data-motion='paused'\]\) \.enter :global\(#main\)\s*\{\s*animation: none;/);
    // Only <main> moves: the wrapper adds no box.
    expect(css).toMatch(/\.root\s*\{\s*display: contents;/);
  });
});
