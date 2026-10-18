import { BRAND_COLORS, THEMES, hexToChannels } from '@/lib/design/tokens';
import { cn } from '@/lib/utils';

interface AmbientBackgroundProps {
  /**
   * Let the light leaks drift (marketing pages). App pages keep them still:
   * they sit behind panes that would otherwise re-composite every frame.
   * Drift also needs a mouse-class pointer and no reduced-motion preference.
   */
  animated?: boolean;
}

/*
 * The ambient light field, as a server-rendered CSS poster: the page's
 * atmosphere before (or without) WebGL. The stage's shader field draws over
 * it when the device can run one.
 *
 *   Day    warm paper with a few very soft leaks of violet, orchid and candle
 *          light, and a faint vignette toward the paper's edges.
 *   Night  the Chamber: deep violet with aurora curtains falling from the top
 *          and a low glow on the horizon.
 *
 * Everything is radial gradients faded through several stops, so the light
 * reads as soft without a CSS blur filter (costly over large layers on
 * phones). Day and night are separate layer sets that cross-fade when the
 * theme changes; only the visible set ever drifts.
 */

const rgb = (hex: string) => hexToChannels(hex);
const VIOLET = rgb(BRAND_COLORS.violet);
const GLOW = rgb(BRAND_COLORS.violetGlow);
const LILAC = rgb(BRAND_COLORS.violetLight);
// Orchid, the accent: deep by day, pale in the night aurora.
const ORCHID = rgb(THEMES.light.accent);
const ORCHID_NIGHT = rgb(THEMES.dark.accent);
// Archive gold, used here only as warm candle light on the paper, never as meaning.
const CANDLE = rgb(BRAND_COLORS.gold);

/** A soft round leak of light: full at the centre, gone at the edge. */
const leak = (channels: string, a: number) => {
  const at = (k: number) => `rgb(${channels} / ${+(a * k).toFixed(4)})`;
  return `radial-gradient(circle closest-side, ${at(1)} 0%, ${at(0.62)} 30%, ${at(0.26)} 60%, ${at(0.07)} 82%, transparent 100%)`;
};

const DAY_WASH = [
  // Light falling in from above the page.
  `radial-gradient(ellipse 70% 55% at 50% -12%, rgb(${GLOW} / 0.13) 0%, rgb(${GLOW} / 0.05) 45%, transparent 75%)`,
  // Faint vignette: the paper darkens a touch toward its edges.
  'radial-gradient(ellipse 120% 95% at 50% 40%, transparent 62%, rgb(var(--c-fg) / 0.035) 88%, rgb(var(--c-fg) / 0.06) 100%)',
].join(', ');

const NIGHT_WASH = [
  // Aurora curtains: tall, narrow ellipses of violet and lilac from the top edge.
  `radial-gradient(ellipse 38% 70% at 22% -8%, rgb(${VIOLET} / 0.34) 0%, rgb(${VIOLET} / 0.12) 45%, transparent 75%)`,
  `radial-gradient(ellipse 30% 58% at 58% -14%, rgb(${LILAC} / 0.14) 0%, rgb(${LILAC} / 0.05) 50%, transparent 78%)`,
  `radial-gradient(ellipse 34% 64% at 88% -6%, rgb(${ORCHID_NIGHT} / 0.12) 0%, rgb(${ORCHID_NIGHT} / 0.04) 50%, transparent 78%)`,
  // A low glow on the horizon.
  `radial-gradient(ellipse 90% 38% at 50% 112%, rgb(${VIOLET} / 0.2) 0%, rgb(${VIOLET} / 0.06) 50%, transparent 80%)`,
  // Depth: the corners fall away into the night.
  'radial-gradient(ellipse 110% 90% at 50% 45%, transparent 55%, rgb(0 0 0 / 0.35) 100%)',
].join(', ');

export default function AmbientBackground({ animated = false }: AmbientBackgroundProps) {
  /**
   * A leak's classes. Drift is opted into per theme (`night` leaks drift only
   * in the dark theme, day leaks only in the light one), and only for a fine
   * pointer with motion allowed, so a still device never animates at all.
   */
  const drifting = (animation: 'drift-1' | 'drift-2', night: boolean) =>
    cn(
      // No border radius: the gradient already fades out before the corners.
      'absolute',
      animated &&
        (night
          ? {
              'dark:motion-safe:[@media(pointer:fine)]:animate-drift-1': animation === 'drift-1',
              'dark:motion-safe:[@media(pointer:fine)]:animate-drift-2': animation === 'drift-2',
            }
          : {
              'motion-safe:[@media(pointer:fine)]:animate-drift-1 dark:!animate-none': animation === 'drift-1',
              'motion-safe:[@media(pointer:fine)]:animate-drift-2 dark:!animate-none': animation === 'drift-2',
            })
    );

  // Size leaks to the screen, capped so their layers stay cheap on big displays.
  const size = (vmax: number, cap: number) => `min(${vmax}vmax, ${cap}px)`;

  return (
    // Steps aside once the WebGL light field is in (<html data-stage="ready">), so the light isn't drawn twice.
    <div
      aria-hidden="true"
      data-decorative
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-700 ease-civic [html[data-stage=ready]_&]:opacity-0"
    >
      {/* Day: paper light. */}
      <div className="absolute inset-0 transition-opacity duration-700 ease-civic dark:opacity-0">
        <div className="absolute inset-0" style={{ background: DAY_WASH }} />
        <div
          className={drifting('drift-1', false)}
          style={{ width: size(62, 880), height: size(62, 880), top: '-18%', left: '-12%', background: leak(VIOLET, 0.13) }}
        />
        <div
          className={drifting('drift-2', false)}
          style={{ width: size(54, 780), height: size(54, 780), top: '22%', right: '-16%', background: leak(ORCHID, 0.08) }}
        />
        {/* Static: a warm wash low on the page, like late light on a desk. */}
        <div
          className="absolute"
          style={{ width: size(48, 700), height: size(48, 700), bottom: '-22%', left: '18%', background: leak(CANDLE, 0.1) }}
        />
      </div>

      {/* Night: the Chamber's aurora. */}
      <div className="absolute inset-0 opacity-0 transition-opacity duration-700 ease-civic dark:opacity-100">
        <div className="absolute inset-0" style={{ background: NIGHT_WASH }} />
        <div
          className={drifting('drift-2', true)}
          style={{ width: size(70, 960), height: size(70, 960), top: '-34%', left: '8%', background: leak(VIOLET, 0.2) }}
        />
        <div
          className={drifting('drift-1', true)}
          style={{ width: size(52, 760), height: size(52, 760), top: '30%', right: '-18%', background: leak(ORCHID_NIGHT, 0.07) }}
        />
      </div>
    </div>
  );
}
