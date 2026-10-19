import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import tailwindConfig from '@/tailwind.config';
import { DARK_VARIANT, THEMES, THEME_ZONES, type ThemeTokens } from '@/lib/design/tokens';
import Badge, { type BadgeVariant } from '@/components/ui/Badge';
import RadioGroup from '@/components/forms/RadioGroup';
import AppShell from '@/components/layout/AppShell';
import { TILE_FORCED_SELECTED, TileBody, TileMark, tileClass } from '@/components/onboarding/ChoiceTile';
import { TOAST_BOTTOM_INSET_VAR, useToast } from '@/components/ui/Toast';
import { TAB_FORCED_COLORS, Tab, TabList, Tabs } from '@/components/ui/Tabs';
import ReadingModeToggle from '@/components/ui/ReadingModeToggle';
import Experience from '@/app/settings/_components/Experience';
import {
  hasUnsavedChanges,
  leaveTarget,
  setUnsavedChanges,
  subscribeUnsavedChanges,
} from '@/app/settings/_components/unsavedChanges';
import { contrast, over } from './colorMath';

/*
 * The accessibility rules that live in the design tokens and the shared
 * controls: tinted labels stay readable, `dark:` styles follow the theme
 * zones exactly as the tokens do, choices stay visible in forced colours,
 * radios are named briefly and described fully, the toast keeps clear of a
 * page's own bars, night pages run to the screen's edges, the settings
 * page's leave-page warning, and no component paints a colour the themes
 * don't know.
 */

const ROOT = path.join(__dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const BACKGROUNDS = ['canvas', 'surface', 'raised'] as const;

/** Visible text of an HTML fragment, whitespace collapsed. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/** The text inside the element with this id. */
function textOfId(html: string, id: string): string {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`<(\\w+)[^>]*\\bid="${esc}"[^>]*>([\\s\\S]*?)</\\1>`));
  return m ? text(m[2]) : '';
}
const attrOf = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

// ─── tinted labels ───────────────────────────────────────────────────────────

// Tailwind colour names (tailwind.config.ts) → the token behind them.
const TW_TOKEN: Record<string, keyof ThemeTokens> = {
  fg: 'fg',
  muted: 'muted',
  ink: 'ink',
  primary: 'violet',
  'primary-300': 'violetText',
  accent: 'accent',
  gold: 'gold',
  gain: 'gain',
  'gain-fill': 'gainFill',
  danger: 'danger',
  caution: 'caution',
};

describe('tinted labels stay readable (WCAG AA 4.5:1)', () => {
  const variants: BadgeVariant[] = ['default', 'primary', 'secondary', 'gold', 'example', 'success', 'danger', 'warning'];

  for (const variant of variants) {
    const cls = attrOf(renderToString(h(Badge, { variant, children: 'Label' })), 'class') ?? '';
    const textToken = TW_TOKEN[cls.match(/(?:^| )text-([a-z0-9-]+)(?= |$)/)?.[1] ?? ''];
    const tint = cls.match(/(?:^| )bg-([a-z0-9-]+)\/(\d+)(?= |$)/);

    it(`Badge "${variant}": its text on its own tint, on every pane, in both themes`, () => {
      expect(textToken, cls).toBeDefined();
      for (const theme of ['light', 'dark'] as const) {
        const t = THEMES[theme];
        for (const pane of BACKGROUNDS) {
          const bg = tint ? over(t[TW_TOKEN[tint[1]]], Number(tint[2]) / 100, t[pane]) : t[pane];
          expect(contrast(t[textToken], bg), `${theme} ${variant} on ${pane}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }

  it('caution text on the warning notes’ tints (bg-caution/6 and /10), on every pane', () => {
    for (const theme of ['light', 'dark'] as const) {
      const t = THEMES[theme];
      for (const pane of BACKGROUNDS) {
        for (const alpha of [0.06, 0.1]) {
          expect(contrast(t.caution, over(t.caution, alpha, t[pane])), `${theme} ${pane} ${alpha}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

// ─── `dark:` follows the theme zones ─────────────────────────────────────────

type Zone = 'plain' | 'night' | 'day';
type Node = Record<string, string>;

/** Does a compound like `[data-theme="dark"]`, `[data-day]` or `*` match this element's attributes? */
function compoundMatches(compound: string, node: Node): boolean {
  if (compound === '*') return true;
  const m = compound.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (!m) throw new Error(`unsupported compound selector: ${compound}`);
  return m[2] === undefined ? m[1] in node : node[m[1]] === m[2];
}

/** A descendant-only complex selector against an element and its ancestors (outermost first). */
function complexMatches(selector: string, chain: Node[]): boolean {
  const parts = selector.trim().split(/\s+/);
  let at = chain.length - 1;
  if (!compoundMatches(parts[parts.length - 1], chain[at])) return false;
  for (let p = parts.length - 2; p >= 0; p--) {
    at--;
    while (at >= 0 && !compoundMatches(parts[p], chain[at])) at--;
    if (at < 0) return false;
  }
  return true;
}

const listMatches = (list: string, chain: Node[]) => list.split(',').some((s) => complexMatches(s, chain));

/** THEME_ZONES as the dark variant composes them. */
const darkBySelectors = (chain: Node[]) =>
  (listMatches(THEME_ZONES.night, chain) && !listMatches(THEME_ZONES.day, chain)) ||
  (listMatches(THEME_ZONES.nightInDay, chain) && !listMatches(THEME_ZONES.dayInNightInDay, chain));

/** What the tokens do: the nearest zone wins (styles/tokens.css). */
function darkByTokens(theme: 'light' | 'dark', zones: Zone[]): boolean {
  let dark = theme === 'dark';
  for (const z of zones) if (z !== 'plain') dark = z === 'night';
  return dark;
}

/** <html data-theme>, then each zone's wrapper, then the element itself. */
const chainFor = (theme: 'light' | 'dark', zones: Zone[]): Node[] => [
  { 'data-theme': theme },
  ...zones.map((z): Node => (z === 'night' ? { 'data-night': '' } : z === 'day' ? { 'data-day': '' } : {})),
  {},
];

/** How deep the zones nest: night and day wrappers, repeats of the same kind counted once. */
function depth(zones: Zone[]): number {
  const kinds = zones.filter((z) => z !== 'plain');
  return kinds.filter((z, i) => z !== kinds[i - 1]).length;
}

describe('`dark:` follows the theme zones, as the tokens do', () => {
  it('is the composition of THEME_ZONES, with no specificity of its own', () => {
    expect(DARK_VARIANT).toBe(
      `&:where(:where(${THEME_ZONES.night}):not(${THEME_ZONES.day}), :where(${THEME_ZONES.nightInDay}):not(${THEME_ZONES.dayInNightInDay}))`
    );
    expect(tailwindConfig.darkMode).toEqual(['variant', DARK_VARIANT]);
  });

  it('agrees with the tokens for every nesting of night sections and day islands, three deep', () => {
    const all: Zone[][] = [];
    const grow = (zones: Zone[]) => {
      all.push(zones);
      if (zones.length < 5) for (const z of ['plain', 'night', 'day'] as const) grow([...zones, z]);
    };
    grow([]);
    let checked = 0;
    for (const theme of ['light', 'dark'] as const) {
      for (const zones of all) {
        if (depth(zones) > 3) continue;
        checked++;
        expect(darkBySelectors(chainFor(theme, zones)), `${theme}: ${zones.join(' > ') || '(page)'}`).toBe(darkByTokens(theme, zones));
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('keeps the cases that matter', () => {
    expect(darkBySelectors(chainFor('light', []))).toBe(false);
    expect(darkBySelectors(chainFor('dark', []))).toBe(true);
    expect(darkBySelectors(chainFor('light', ['night']))).toBe(true);
    // A paper slip on a night pane, and a night plate on that slip.
    expect(darkBySelectors(chainFor('dark', ['day']))).toBe(false);
    expect(darkBySelectors(chainFor('light', ['night', 'day']))).toBe(false);
    expect(darkBySelectors(chainFor('dark', ['day', 'night']))).toBe(true);
    expect(darkBySelectors(chainFor('light', ['night', 'plain', 'day', 'plain', 'night']))).toBe(true);
  });

  it('compiles to one zero-specificity rule per utility', async () => {
    const result = await postcss([
      tailwindcss({ ...tailwindConfig, content: [{ raw: '<p class="dark:bg-canvas dark:hover:text-ink"></p>' }] }),
    ]).process('@tailwind utilities;', { from: undefined });
    const selectors: string[] = [];
    result.root.walkRules((rule) => {
      selectors.push(rule.selector);
    });
    expect(selectors).toHaveLength(2);
    // Everything after the utility's own class sits inside :where(), so it adds no specificity.
    expect(selectors[0].startsWith('.dark\\:bg-canvas:where(')).toBe(true);
    expect(selectors[1].startsWith('.dark\\:hover\\:text-ink:hover:where(')).toBe(true);
    for (const s of selectors) expect(s.endsWith('))')).toBe(true);
  });
});

// ─── forced colours ──────────────────────────────────────────────────────────

describe('a chosen tile stays visible in forced colours', () => {
  it('takes a Highlight rim; an unchosen one does not', () => {
    expect(tileClass(true)).toContain('forced-colors:border-[color:Highlight]');
    expect(tileClass(true)).toContain('forced-colors:border-2');
    expect(tileClass(false)).not.toContain('Highlight');
    expect(TILE_FORCED_SELECTED).toBe('forced-colors:border-2 forced-colors:border-[color:Highlight]');
  });

  it('draws its dot or check in the text colour inside a Highlight ring, in system colours the theme keeps', () => {
    const one = renderToString(h(TileMark, { on: true }));
    const several = renderToString(h(TileMark, { on: true, multiple: true }));
    const off = renderToString(h(TileMark, { on: false }));
    expect(one).toContain('forced-colors:border-[color:Highlight]');
    expect(one).toContain('forced-colors:bg-[color:CanvasText]');
    expect(several).toContain('forced-colors:border-[color:Highlight]');
    // The check's stroke is the mark's (forced) text colour. A colour authored on the svg itself
    // survives forced colours (an svg preserves it), which drew a white check on the white box.
    const [check] = several.match(/<svg[^>]*>/) ?? [''];
    expect(check).toContain('stroke="currentColor"');
    expect(check).not.toMatch(/text-|Canvas/);
    expect(several).toMatch(/^<span[^>]*\stext-white[\s"]/);
    expect(off).not.toContain('CanvasText]"><span');
    // No opting out of forced colours: the system keeps author system colours, and drops the glow.
    for (const html of [one, several, off]) expect(html).not.toContain('forced-color-adjust');
  });

  it('keeps the onboarding tile’s look (shape as well as colour)', () => {
    const html = renderToString(h(TileBody, { label: 'Rent', on: true }));
    expect(html).toContain('bg-white');
    expect(html).toContain('Rent');
  });
});

describe('the selected tab and the chosen reading level stay visible in forced colours', () => {
  /** The forced-colours rules `classes` compile to: each rule's selector and its declarations. */
  async function forcedRules(classes: string) {
    const result = await postcss([
      tailwindcss({ ...tailwindConfig, content: [{ raw: `<button class="${classes}"></button>` }] }),
    ]).process('@tailwind utilities;', { from: undefined });
    const rules: { selector: string; decls: string }[] = [];
    result.root.walkAtRules('media', (media) => {
      if (!/forced-colors:\s*active/.test(media.params)) return;
      media.walkRules((rule) => {
        const decls: string[] = [];
        rule.walkDecls((d) => {
          decls.push(`${d.prop}: ${d.value}`);
        });
        rules.push({ selector: rule.selector, decls: decls.join('; ') });
      });
    });
    return rules;
  }

  it('gives the selected tab a 2px Highlight rim and an underline, and takes the others’ edge away', async () => {
    const html = renderToString(
      h(Tabs, {
        value: 'receipt',
        onValueChange: () => {},
        children: h(TabList, {
          label: 'Impact views',
          children: [
            h(Tab, { key: 'receipt', value: 'receipt', children: 'Your receipt' }),
            h(Tab, { key: 'cumulative', value: 'cumulative', children: 'Cumulative analysis' }),
          ],
        }),
      })
    );
    const tabs = html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) expect(tab).toContain(TAB_FORCED_COLORS);

    const rules = await forcedRules(TAB_FORCED_COLORS);
    const selected = rules.filter((r) => r.selector.includes('[aria-selected="true"]')).map((r) => r.decls).join('; ');
    expect(selected).toContain('border-width: 2px');
    expect(selected).toMatch(/border-color: Highlight/);
    expect(selected).toContain('text-decoration-line: underline');
    const rest = rules.filter((r) => !r.selector.includes('aria-selected')).map((r) => r.decls).join('; ');
    expect(rest).toMatch(/border-color: Canvas/);
    expect(rest).not.toMatch(/Highlight|underline|border-width/);
  });

  it('gives the chosen reading level the same marks, and the other none', () => {
    const html = renderToString(h(ReadingModeToggle));
    const [chosen] = html.match(/<button[^>]*aria-pressed="true"[^>]*>/) ?? [''];
    const other = html.match(/<button[^>]*aria-pressed="false"[^>]*>/)?.[0] ?? '';
    for (const mark of ['forced-colors:border-2', 'forced-colors:border-[color:Highlight]', 'forced-colors:underline']) {
      expect(chosen).toContain(mark);
      expect(other).not.toContain(mark);
    }
    expect(other).toContain('forced-colors:border-[color:Canvas]');
  });
});

// ─── radio names and descriptions ────────────────────────────────────────────

describe('radios are named briefly and described fully', () => {
  it('names an option with a description by its label alone, and describes it by the rest', () => {
    const html = renderToString(
      h(RadioGroup, {
        options: [
          { value: 'a', label: 'Simple', description: 'Plain words, everyday examples.' },
          { value: 'b', label: 'Expert', description: 'Full terminology.' },
        ],
        value: 'a',
        onChange: () => undefined,
        label: 'Mode',
      })
    );
    const radios = html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    expect(radios.map((r) => textOfId(html, attrOf(r, 'aria-labelledby')!))).toEqual(['Simple', 'Expert']);
    expect(radios.map((r) => textOfId(html, attrOf(r, 'aria-describedby')!))).toEqual(['Plain words, everyday examples.', 'Full terminology.']);
  });

  it('leaves an option without a description named by its content', () => {
    const html = renderToString(h(RadioGroup, { options: [{ value: 'a', label: 'Rent' }], value: '', onChange: () => undefined, label: 'Housing' }));
    expect(html).not.toMatch(/role="radio"[^>]*aria-(labelledby|describedby)/);
    expect(text(html)).toBe('Rent');
  });

  describe('Settings → Experience', () => {
    const html = renderToString(h(Experience));

    it('reads each reading mode by its title, then its sentence', () => {
      const group = (html.match(/<div[^>]*role="radiogroup"[^>]*>/g) ?? []).find((g) => textOfId(html, attrOf(g, 'aria-labelledby') ?? '') === 'Reading mode');
      expect(group).toBeDefined();
      const radios = (html.match(/<button[^>]*role="radio"[^>]*>/g) ?? []).filter((r) => attrOf(r, 'aria-describedby'));
      const names = radios.map((r) => textOfId(html, attrOf(r, 'aria-labelledby')!));
      expect(names).toEqual(['Simple Mode', 'Expert Mode']);
      for (const r of radios) expect(textOfId(html, attrOf(r, 'aria-describedby')!).length).toBeGreaterThan(30);
    });

    it('describes the theme and visual effects choices by their visible sentences', () => {
      const groups = html.match(/<div[^>]*role="radiogroup"[^>]*>/g) ?? [];
      const theme = groups.find((g) => attrOf(g, 'aria-label') === 'Theme');
      const effects = groups.find((g) => attrOf(g, 'aria-labelledby') === 'settings-effects');
      expect(textOfId(html, attrOf(theme!, 'aria-describedby')!)).toMatch(/^Light, dark, or the same as your device/);
      expect(textOfId(html, attrOf(effects!, 'aria-describedby')!)).toMatch(/^3D scenes and moving light/);
    });
  });
});

// ─── the toast keeps clear of a page's bars ──────────────────────────────────

describe('the toast keeps clear of a page’s own bottom bar', () => {
  function Host() {
    const { toast, showToast } = useToast();
    // Render-time call, for the server snapshot only.
    void showToast;
    return toast;
  }

  it('takes its bottom offset from its stylesheet, with the page’s inset and the safe area', () => {
    expect(TOAST_BOTTOM_INSET_VAR).toBe('--toast-bottom-inset');
    const css = read('components/ui/toast.module.css');
    const bottoms = [...css.matchAll(/bottom:\s*([^;]+);/g)].map((m) => m[1]);
    expect(bottoms.length).toBeGreaterThanOrEqual(2);
    for (const b of bottoms) {
      expect(b).toContain('var(--toast-bottom-inset, 0px)');
      expect(b).toContain('env(safe-area-inset-bottom, 0px)');
    }
    // No bottom utility on the pane that would fight the stylesheet.
    expect(read('components/ui/Toast.tsx')).not.toMatch(/['\s](?:sm:)?bottom-\d/);
    expect(renderToString(h(Host))).toContain('role="status"');
  });
});

// ─── night pages run to the edges ────────────────────────────────────────────

describe('a night page', () => {
  it('asks the stage for night past its edges (bleed)', () => {
    const html = renderToString(h(AppShell, { hideNav: true, night: true, children: 'x' }));
    expect(html).toMatch(/^<div[^>]*data-night=""[^>]*data-scene-night="bleed"/);
    expect(renderToString(h(AppShell, { hideNav: true, children: 'x' }))).not.toContain('data-scene-night');
  });
});

// ─── the settings page's leave-page warning ──────────────────────────────────

describe('leaving Settings with unsaved changes', () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  const here = 'https://getpoliticon.app/settings#profile';

  it('holds a plain click on a link to another page of the app', () => {
    expect(leaveTarget(click, { href: '/dashboard' }, here)).toBe('/dashboard');
    expect(leaveTarget(click, { href: 'https://getpoliticon.app/impact?x=1#top' }, here)).toBe('/impact?x=1#top');
    expect(leaveTarget(click, { href: '/settings?tab=2' }, here)).toBe('/settings?tab=2');
    expect(leaveTarget(click, { href: '/onboarding', target: '_self' }, here)).toBe('/onboarding');
  });

  it('lets through what doesn’t leave this tab, or leaves it for another site', () => {
    expect(leaveTarget(click, { href: '#account' }, here)).toBeNull();
    expect(leaveTarget(click, { href: '/settings#experience' }, here)).toBeNull();
    expect(leaveTarget({ ...click, metaKey: true }, { href: '/dashboard' }, here)).toBeNull();
    expect(leaveTarget({ ...click, ctrlKey: true }, { href: '/dashboard' }, here)).toBeNull();
    expect(leaveTarget({ ...click, shiftKey: true }, { href: '/dashboard' }, here)).toBeNull();
    expect(leaveTarget({ ...click, button: 1 }, { href: '/dashboard' }, here)).toBeNull();
    expect(leaveTarget({ ...click, defaultPrevented: true }, { href: '/dashboard' }, here)).toBeNull();
    expect(leaveTarget(click, { href: '/dashboard', target: '_blank' }, here)).toBeNull();
    expect(leaveTarget(click, { href: '/api/account/export', download: true }, here)).toBeNull();
    // Another site: the browser's own beforeunload prompt covers that.
    expect(leaveTarget(click, { href: 'https://congress.gov/' }, here)).toBeNull();
    expect(leaveTarget(click, { href: 'mailto:support@getpoliticon.app' }, here)).toBeNull();
  });

  it('counts a form as unsaved until it says otherwise, once each', () => {
    const seen: boolean[] = [];
    const stop = subscribeUnsavedChanges(() => seen.push(hasUnsavedChanges()));
    expect(hasUnsavedChanges()).toBe(false);
    setUnsavedChanges('profile', true);
    setUnsavedChanges('profile', true);
    setUnsavedChanges('name', true);
    setUnsavedChanges('profile', false);
    expect(hasUnsavedChanges()).toBe(true);
    setUnsavedChanges('name', false);
    stop();
    setUnsavedChanges('name', true);
    setUnsavedChanges('name', false);
    expect(seen).toEqual([true, true, true, false]);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('is hosted once, by the profile editor, and the account’s name and email forms report to it', () => {
    const profile = read('app/settings/_components/ProfileSection.tsx');
    expect(profile).toMatch(/useUnsavedChanges\(dirty\)[\s\S]*<LeaveGuard \/>/);
    // Loaded just after the page, out of its first load (nothing is unsaved before a change).
    expect(profile).toContain("const LeaveGuard = dynamic(() => import('./LeaveGuard'), { ssr: false");
    expect(profile).not.toMatch(/^import LeaveGuard/m);
    const account = read('app/settings/_components/AccountSection.tsx');
    expect(account.match(/useUnsavedChanges\(/g)).toHaveLength(2);
    // Passwords don't count: a password manager can fill them without the person typing.
    expect(read('app/settings/_components/AccountPassword.tsx')).not.toContain('useUnsavedChanges');
  });
});

// ─── no colour the themes don't know ─────────────────────────────────────────

function sources(dir: string, exts: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...sources(rel, exts));
    else if (exts.test(name)) out.push(rel.split(path.sep).join('/'));
  }
  return out;
}

const UI_SOURCES = [...sources('app', /\.(tsx?)$/), ...sources('components', /\.(tsx?)$/)];

/*
 * Pictures that draw with fixed colours on purpose: generated images (no CSS
 * variables there), the page shown when the root layout itself fails, the
 * WebGL scenes and their still posters, the brand mark and the /lab bench.
 */
const ART = [
  /^app\/(opengraph-image|apple-icon|icon)\.tsx$/,
  /^app\/global-error\.tsx$/,
  /^app\/lab\//,
  /^components\/three\//,
  /^components\/impact\/posters\//,
  /^components\/impact\/receipt\/SkylinePoster\.tsx$/,
  /^components\/dashboard\/LedgerPoster\.tsx$/,
  /^components\/auth\/SealPoster\.tsx$/,
  /^components\/ui\/Logo\.tsx$/,
];
const isArt = (file: string) => ART.some((re) => re.test(file));

describe('every colour comes from the themes', () => {
  it('uses no stock Tailwind palette colour (they ignore the theme)', () => {
    const stock = /\b(?:bg|text|border|from|via|to|fill|stroke|ring|outline|decoration|divide|shadow|placeholder|caret|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
    const found = UI_SOURCES.filter((f) => stock.test(read(f)));
    expect(found).toEqual([]);
  });

  it('puts no fixed hue in a class or a style outside the pictures (light and shade only)', () => {
    // Shade and light are black, white and ink at an alpha; a hue must be a token.
    const SHADE = /^rgba?\(\s*(?:0[ ,_]+0[ ,_]+0|255[ ,_]+255[ ,_]+255|21[ ,_]+18[ ,_]+31|14[ ,_]+10[ ,_]+28|6[ ,_]+4[ ,_]+14)\b/;
    const found: string[] = [];
    for (const file of UI_SOURCES) {
      if (isArt(file)) continue;
      const source = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      // Literal colours only (a computed rgb(${token}) reads a token).
      for (const m of source.matchAll(/#[0-9a-fA-F]{3,8}\b(?![\w-])|rgba?\(\s*\d[\d\s,_./%]*\)/g)) {
        const value = m[0];
        if (value.startsWith('rgb') && SHADE.test(value)) continue;
        if (/^#(?:000|fff|000000|ffffff)$/i.test(value)) continue;
        found.push(`${file}: ${value}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('keeps white and black utilities to fixed fills and their dark twins', () => {
    // Each is white on the violet fill (which is the same in both themes), a
    // white thumb or glint, or has a `dark:` twin beside it.
    const ALLOWED: Record<string, number> = {
      'components/ui/Button.tsx': 1,
      'components/onboarding/ChoiceTile.tsx': 2,
      'components/layout/Navbar.tsx': 1,
      'components/landing/mockups/RecordSeal.tsx': 1,
      'components/landing/mockups/LedgerMockup.tsx': 1,
      'components/landing/mockups/GuideMockup.tsx': 1,
      'components/landing/hero/CapitolArt.tsx': 1,
      'components/landing/film/FilmPosters.tsx': 1,
      'components/dashboard/LedgerPoster.tsx': 1,
      'components/auth/LoaderMark.tsx': 1,
      'components/auth/CivicSeal.tsx': 1,
      'app/settings/_components/Experience.tsx': 1,
      'app/settings/_components/AccountPassword.tsx': 1,
      'app/impact/[policyId]/_components/ActionTab.tsx': 1,
      'app/advisor/_components/Composer.tsx': 1,
    };
    const found: Record<string, number> = {};
    for (const file of UI_SOURCES) {
      const n = (read(file).match(/\b(?:bg|text|border|fill|stroke|from|via|to|ring|divide|outline|decoration)-(?:white|black)\b/g) ?? []).length;
      if (n) found[file] = n;
    }
    for (const [file, n] of Object.entries(found)) expect(n, file).toBeLessThanOrEqual(ALLOWED[file] ?? 0);
  });

  it('gives every drop shadow cast from the ink a night twin (ink turns light at night)', () => {
    const missing: string[] = [];
    for (const file of UI_SOURCES) {
      const lines = read(file).split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/(?<![\w:-])shadow-\[([^\]\s]+)\]/g)) {
          // Inset glints and hairlines are fine; a drop (positive blur, not inset) cast from fg or ink is not.
          const drops = m[1].split(/,(?![^(]*\))/).filter((part) => !part.startsWith('inset') && /rgb\(var\(--c-(?:fg|ink)\)/.test(part) && !/^0_1px_0_/.test(part));
          if (!drops.length) continue;
          const near = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
          if (!/dark:shadow-/.test(near)) missing.push(`${file}:${i + 1}`);
        }
      });
    }
    expect(missing).toEqual([]);
  });

  it('keeps the feed card’s top glint a whisper at night, hovered or not', () => {
    const css = read('components/feed/docket.module.css');
    expect(css).toMatch(/:global\(\[data-theme='dark'\]\) \.sheet,\s*:global\(\[data-night\]\) \.sheet \{[^}]*--sheet-glint: rgb\(255 255 255 \/ 0\.06\)/);
    const hover = css.match(/\.sheet:hover \{([^}]*)\}/)?.[1] ?? '';
    expect(hover).toContain('var(--sheet-glint)');
    expect(hover).not.toMatch(/rgb\(255 255 255/);
  });
});
