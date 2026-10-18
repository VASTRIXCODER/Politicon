// Chart colours, drawn from the Civic Light tokens (lib/design/tokens.ts).
// Kept apart from Charts.tsx so pages can use them without pulling in recharts.
//
// Recharts paints SVG attributes, which can't read CSS variables, so charts
// get concrete colours for the theme on the page from useChartPalette().
// Direction is only ever gain teal or loss amber; series and categories use
// the categorical set, which has no red, blue, teal or amber in it.

import { CATEGORY_COLORS, THEMES, hexToChannels, type ThemeName } from '@/lib/design/tokens';
import { useResolvedTheme } from '@/lib/useTheme';

export interface ChartPalette {
  /** Gains: bars, lines and areas for money the household keeps. */
  gain: string;
  /** Costs: bars, lines and areas for money the household pays. */
  loss: string;
  /** A series with no direction (e.g. "after", the radar). */
  primary: string;
  /** The comparison series beside `primary` (e.g. "before"). */
  neutral: string;
  /** The emphasised total line: ink, so it stands apart from every series. */
  total: string;
  /** Gridlines. */
  grid: string;
  /** The zero line and the hover line on line and area charts. */
  zero: string;
  /** The hover band behind bars. */
  cursor: string;
  /** Tick labels and axis lines (muted text, AA on every pane). */
  axis: string;
  /** One colour per series (e.g. per policy), cycled. */
  series: readonly string[];
  /** One colour per policy category. */
  category: Record<string, string>;
}

/** A token at an alpha, as "rgb(21 18 31 / 0.08)": SVG attributes need a concrete colour. */
const withAlpha = (hex: string, alpha: number) => `rgb(${hexToChannels(hex)} / ${alpha})`;

// Distinct categorical colours for series. Education (teal) and energy (sienna)
// are left out so no series reads as a gain or a cost.
const SERIES_ORDER = ['taxes', 'healthcare', 'employment', 'housing', 'retirement', 'other'] as const;

/** The chart colours for one theme. Pure, so tests and non-React code can call it. */
export function chartPalette(theme: ThemeName): ChartPalette {
  const t = THEMES[theme];
  const category = CATEGORY_COLORS[theme];
  return {
    gain: t.gainFill,
    loss: t.lossFill,
    primary: t.violet,
    neutral: t.muted,
    total: t.ink,
    grid: withAlpha(t.fg, 0.08),
    zero: withAlpha(t.fg, 0.24),
    cursor: withAlpha(t.fg, theme === 'dark' ? 0.05 : 0.04),
    axis: t.muted,
    series: SERIES_ORDER.map((k) => category[k]),
    category,
  };
}

const PALETTES: Record<ThemeName, ChartPalette> = {
  light: chartPalette('light'),
  dark: chartPalette('dark'),
};

/** Chart colours for the theme on the page (light on the server and first render). Client components only. */
export function useChartPalette(): ChartPalette {
  return PALETTES[useResolvedTheme()];
}
