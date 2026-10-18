/**
 * Civic Light design tokens: the single source for every colour in the app.
 *
 * styles/tokens.css mirrors these values as CSS custom properties (RGB
 * channels, so Tailwind's `/opacity` modifiers work); tests/tokens.test.ts
 * fails if the two drift. Charts, the WebGL scenes and generated images
 * (Open Graph, icons) read the hex values from here because they can't use
 * CSS variables.
 *
 * Meaning colours are deliberately not red or blue (in the US those read as
 * party colours): gains are ledger teal, costs are ember amber, and both are
 * always paired with a sign and words.
 */

export type ThemeName = 'light' | 'dark';

export interface ThemeTokens {
  /** Page background. */
  canvas: string;
  /** Solid panes and cards. */
  surface: string;
  /** Raised or inset panes on top of a surface. */
  raised: string;
  /** Primary text. */
  ink: string;
  /** Secondary text (AA on canvas, surface and raised). */
  muted: string;
  /** Base for hairlines and tints, used with an alpha (`border-fg/10`). */
  fg: string;
  /** Signature Politicon Violet: decorative light, large type, focus. */
  violet: string;
  /** Violet for body-size text (AA). */
  violetText: string;
  /** Fill behind white text on primary buttons (AA with white). */
  violetFill: string;
  /** Soft glow and highlight violet. */
  glow: string;
  /** Secondary accent (orchid), for non-meaning highlights. */
  accent: string;
  /** Gains: ledger teal, for text. */
  gain: string;
  /** Gains: fill for bars, lines, slabs and dots (3:1 on canvas, surface and raised). */
  gainFill: string;
  /** Costs: ember amber, for text. */
  loss: string;
  /** Costs: fill for bars, lines, slabs and dots (3:1 on canvas, surface and raised). */
  lossFill: string;
  /** Errors and destructive actions. Never used for a cost. */
  danger: string;
  /** Warnings and low-confidence notes. */
  caution: string;
  /** Archive gold: official-record accents only (seals, record stamps). */
  gold: string;
  /** Focus ring. */
  focus: string;
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  light: {
    canvas: '#F6F3EE',
    surface: '#FBFAF7',
    raised: '#FFFFFF',
    ink: '#15121F',
    muted: '#5C566B',
    fg: '#15121F',
    violet: '#6D4AFF',
    violetText: '#5434E0',
    violetFill: '#6D4AFF',
    glow: '#8F75FF',
    accent: '#8A3DC7',
    gain: '#087159',
    gainFill: '#0E9F7E',
    loss: '#A3540F',
    // Ember amber deepened for paper: the brand ember (#E0832B) is under 3:1 there.
    lossFill: '#C46A16',
    danger: '#B42344',
    caution: '#7E5F07',
    gold: '#7A5C0A',
    focus: '#5434E0',
  },
  dark: {
    canvas: '#0E0A1C',
    surface: '#171130',
    raised: '#1E1740',
    ink: '#F3F0FA',
    muted: '#A9A3C2',
    fg: '#FFFFFF',
    violet: '#8F75FF',
    violetText: '#B9A8FF',
    violetFill: '#6D4AFF',
    glow: '#B9A8FF',
    accent: '#D8B4FE',
    gain: '#3FD3AE',
    gainFill: '#1FB892',
    loss: '#F2A35E',
    lossFill: '#E0832B',
    danger: '#FF8FA3',
    caution: '#E8C35A',
    gold: '#E3B341',
    focus: '#B9A8FF',
  },
};

/** Fixed brand colours that don't change with the theme. */
export const BRAND_COLORS = {
  paper: '#F6F3EE',
  porcelain: '#FBFAF7',
  ink: '#15121F',
  graphite: '#4A4658',
  mist: '#E7E3EF',
  violet: '#6D4AFF',
  violetLight: '#B9A8FF',
  violetGlow: '#8F75FF',
  night: '#0E0A1C',
  nightRaised: '#171130',
  gold: '#E3B341',
  teal: '#0E9F7E',
  ember: '#E0832B',
} as const;

/**
 * Categorical colours for policy categories in charts and 3D. None is red or
 * blue, and none reuses the gain teal or loss amber, so a category is never
 * mistaken for a direction.
 */
export const CATEGORY_COLORS: Record<ThemeName, Record<string, string>> = {
  light: {
    taxes: '#6D4AFF',
    housing: '#B8860B',
    healthcare: '#B0479A',
    employment: '#4F6B2F',
    retirement: '#8A3DC7',
    education: '#2F7A7A',
    energy: '#9A5B3C',
    other: '#6B6680',
  },
  dark: {
    taxes: '#9C86FF',
    housing: '#E3B341',
    healthcare: '#E58ACB',
    employment: '#A9C77A',
    retirement: '#D8B4FE',
    education: '#7FD1D1',
    energy: '#E3A27F',
    other: '#A9A3C2',
  },
};

/** The CSS custom property each token is written to (`--c-<kebab>`). */
export const cssVarName = (token: keyof ThemeTokens) =>
  `--c-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** "#6D4AFF" → "109 74 255", the channel format styles/tokens.css uses. */
export function hexToChannels(hex: string): string {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
}
