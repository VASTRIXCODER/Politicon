import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_COLORS,
  THEMES,
  cssVarName,
  hexToChannels,
  type ThemeName,
  type ThemeTokens,
} from '@/lib/design/tokens';

/*
 * styles/tokens.css mirrors lib/design/tokens.ts by hand (CSS can't import
 * TypeScript). These tests fail when the two drift, and check that every
 * text token stays at WCAG AA on every background it is used on.
 */

const css = readFileSync(path.join(__dirname, '..', 'styles', 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every top-level rule: its selector list (normalised) and its custom properties. */
function parseBlocks(source: string) {
  const blocks: { selectors: string[]; vars: Record<string, string> }[] = [];
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]
      .split(',')
      .map((s) => s.trim().replace(/"/g, "'").replace(/\s+/g, ' '))
      .filter(Boolean);
    const vars: Record<string, string> = {};
    for (const decl of match[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      vars[decl[1]] = decl[2].trim().replace(/\s+/g, ' ');
    }
    blocks.push({ selectors, vars });
  }
  return blocks;
}

const blocks = parseBlocks(css);

function blockFor(selector: string) {
  const found = blocks.filter((b) => b.selectors.includes(selector));
  expect(found, `exactly one rule in styles/tokens.css targets ${selector}`).toHaveLength(1);
  return found[0];
}

/** Every custom property a theme block must define, with its expected value. */
function expectedVars(theme: ThemeName): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [token, hex] of Object.entries(THEMES[theme]) as [keyof ThemeTokens, string][]) {
    out[cssVarName(token)] = hexToChannels(hex);
  }
  for (const [category, hex] of Object.entries(CATEGORY_COLORS[theme])) {
    out[`--c-cat-${category}`] = hexToChannels(hex);
  }
  return out;
}

const SCOPES: { selector: string; theme: ThemeName }[] = [
  { selector: ':root', theme: 'light' },
  { selector: "[data-theme='light']", theme: 'light' },
  { selector: "[data-theme='dark']", theme: 'dark' },
  { selector: '[data-night]', theme: 'dark' },
  { selector: '[data-day]', theme: 'light' },
];

describe('lib/design/tokens helpers', () => {
  it('names CSS variables in kebab case', () => {
    expect(cssVarName('canvas')).toBe('--c-canvas');
    expect(cssVarName('violetText')).toBe('--c-violet-text');
    expect(cssVarName('gainFill')).toBe('--c-gain-fill');
  });

  it('converts hex to space-separated channels', () => {
    expect(hexToChannels('#6D4AFF')).toBe('109 74 255');
    expect(hexToChannels('#000000')).toBe('0 0 0');
    expect(hexToChannels('ffffff')).toBe('255 255 255');
  });

  it('uses six-digit hex colours everywhere', () => {
    const all = [
      ...Object.values(THEMES.light),
      ...Object.values(THEMES.dark),
      ...Object.values(CATEGORY_COLORS.light),
      ...Object.values(CATEGORY_COLORS.dark),
    ];
    for (const hex of all) expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('gives both themes the same tokens and categories', () => {
    expect(Object.keys(THEMES.dark).sort()).toEqual(Object.keys(THEMES.light).sort());
    expect(Object.keys(CATEGORY_COLORS.dark).sort()).toEqual(Object.keys(CATEGORY_COLORS.light).sort());
  });
});

describe('styles/tokens.css mirrors lib/design/tokens.ts', () => {
  for (const { selector, theme } of SCOPES) {
    it(`${selector} defines every ${theme} token with its value`, () => {
      const { vars } = blockFor(selector);
      const expected = expectedVars(theme);
      for (const [name, value] of Object.entries(expected)) {
        expect(vars[name], `${selector} ${name}`).toBe(value);
      }
    });

    it(`${selector} defines nothing that lib/design/tokens.ts doesn't know`, () => {
      const { vars } = blockFor(selector);
      const expected = expectedVars(theme);
      const extra = Object.keys(vars).filter((name) => name.startsWith('--c-') && !(name in expected));
      expect(extra).toEqual([]);
    });
  }

  it('flips data-night subtrees with the same rule as the dark theme', () => {
    expect(blockFor('[data-night]')).toBe(blockFor("[data-theme='dark']"));
  });

  it('sets the matching color-scheme in each scope', () => {
    const scheme = (selector: string) =>
      css.match(new RegExp(`${selector.replace(/[[\]'()]/g, '\\$&')}[^{]*\\{[^}]*color-scheme:\\s*(\\w+)`))?.[1];
    expect(scheme(':root')).toBe('light');
    expect(scheme('[data-night]')).toBe('dark');
    expect(scheme('[data-day]')).toBe('light');
  });
});

/* WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = hexToChannels(hex)
    .split(' ')
    .map((c) => {
      const s = Number(c) / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('contrast helper', () => {
  it('matches known WCAG ratios', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrast('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
});

// accent too: the UI kit sets orchid text (Badge "secondary", Simple Mode callouts).
const TEXT_TOKENS = ['ink', 'muted', 'violetText', 'accent', 'gain', 'loss', 'danger', 'caution', 'gold'] as const;
const BACKGROUNDS = ['canvas', 'surface', 'raised'] as const;

describe('WCAG AA text contrast (4.5:1)', () => {
  for (const theme of ['light', 'dark'] as const) {
    const t = THEMES[theme];
    for (const text of TEXT_TOKENS) {
      for (const bg of BACKGROUNDS) {
        it(`${theme}: ${text} on ${bg}`, () => {
          expect(contrast(t[text], t[bg])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    it(`${theme}: white text on the violet button fill`, () => {
      expect(contrast('#FFFFFF', t.violetFill)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme}: the focus ring is visible on every background (3:1)`, () => {
      for (const bg of BACKGROUNDS) expect(contrast(t.focus, t[bg]), bg).toBeGreaterThanOrEqual(3);
    });
  }
});

// Graphics that carry meaning (WCAG 1.4.11, 3:1): gain and cost bars, lines
// and dots, and the violet that marks a selected tab or segment.
const GRAPHIC_TOKENS = ['gainFill', 'lossFill', 'violet'] as const;

describe('WCAG AA non-text contrast (3:1)', () => {
  for (const theme of ['light', 'dark'] as const) {
    const t = THEMES[theme];
    for (const graphic of GRAPHIC_TOKENS) {
      it(`${theme}: ${graphic} on every background`, () => {
        for (const bg of BACKGROUNDS) expect(contrast(t[graphic], t[bg]), bg).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
