import { describe, expect, it } from 'vitest';
import { chartPalette } from '@/components/charts/palette';
import { CATEGORY_COLORS, THEMES, hexToChannels, type ThemeName } from '@/lib/design/tokens';

/*
 * Chart colours come from the design tokens, one set per theme. Direction is
 * only ever the gain/loss pair, and no series colour is red, blue or one of
 * the direction colours, so a series never reads as a gain, a cost or a party.
 */

const THEME_NAMES: ThemeName[] = ['light', 'dark'];

/** Hue (0–360) and saturation (0–1) of a hex colour. */
function hueSat(hex: string): { hue: number; sat: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0 };
  const l = (max + min) / 2;
  const sat = d / (1 - Math.abs(2 * l - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  return { hue: hue < 0 ? hue + 360 : hue, sat };
}

/** WCAG 2.x contrast ratio of two hex colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = hexToChannels(hex)
      .split(' ')
      .map((c) => {
        const s = Number(c) / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('chartPalette', () => {
  for (const theme of THEME_NAMES) {
    describe(theme, () => {
      const p = chartPalette(theme);
      const t = THEMES[theme];

      it('draws direction with the gain and loss fills', () => {
        expect(p.gain).toBe(t.gainFill);
        expect(p.loss).toBe(t.lossFill);
      });

      it('draws gains, costs and the primary series at 3:1 or more on every pane (WCAG 1.4.11)', () => {
        for (const bg of ['canvas', 'surface', 'raised'] as const) {
          for (const mark of [p.gain, p.loss, p.primary]) {
            expect(contrast(mark, t[bg]), `${mark} on ${bg}`).toBeGreaterThanOrEqual(3);
          }
        }
      });

      it('uses the muted text tone for axes and the theme hairline for the grid', () => {
        expect(p.axis).toBe(t.muted);
        expect(p.grid).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.\d+\)$/);
        expect(p.zero).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.\d+\)$/);
      });

      it('takes category colours from the tokens', () => {
        expect(p.category).toEqual(CATEGORY_COLORS[theme]);
      });

      it('keeps series apart from direction colours, red and blue', () => {
        const direction = [t.gain, t.gainFill, t.loss, t.lossFill, t.danger].map((c) => c.toLowerCase());
        expect(new Set(p.series).size).toBe(p.series.length);
        for (const c of p.series) {
          expect(direction).not.toContain(c.toLowerCase());
          const { hue, sat } = hueSat(c);
          if (sat < 0.25) continue; // greys carry no hue
          expect(hue >= 345 || hue <= 15, `${c} reads as red`).toBe(false);
          expect(hue >= 190 && hue <= 235, `${c} reads as blue`).toBe(false);
        }
      });
    });
  }

  it('differs between the themes', () => {
    expect(chartPalette('dark').gain).not.toBe(chartPalette('light').gain);
    expect(chartPalette('dark').total).not.toBe(chartPalette('light').total);
  });
});
