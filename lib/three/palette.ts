/**
 * Colours for the WebGL scenes, per theme, derived from the design tokens
 * (lib/design/tokens.ts) so the 3D world and the DOM never drift apart.
 * Values are sRGB hex strings, which THREE.Color (and R3F colour props)
 * accept directly and convert to linear for lighting.
 *
 * Meaning colours follow the DOM rules: gains are ledger teal, costs ember
 * amber, gold only marks the official record (seals), and nothing uses red
 * or blue.
 */
import { BRAND_COLORS, THEMES, type ThemeName } from '@/lib/design/tokens';

export interface ScenePalette {
  night: boolean;
  /** The page background behind every view (what glass refracts). */
  canvas: string;
  /** Solid panes, and paper props in the scene. */
  surface: string;
  ink: string;
  violet: string;
  violetLight: string;
  glow: string;
  accent: string;
  gold: string;
  gain: string;
  loss: string;

  /** Paper sheets (bill pages, receipts). */
  paper: string;
  /** Porcelain architecture (the Capitol). */
  porcelain: string;
  /** Body colour of violet glass. */
  glassTint: string;
  /** Colour light takes on inside thick glass. */
  glassDepth: string;
  /** The violet rim light that outlines every hero object. */
  rim: string;
  /** Key light. */
  key: string;
  /** Soft fill light. */
  fill: string;
  /** The studio's walls: what reflections show between the light panels. */
  env: string;
  /** Contact-shadow tint. */
  shadow: string;
  /** Embossed text lines on paper and glass. */
  emboss: string;
  /** Default light particles. */
  particle: string;
  /** The lens of light in the Aperture Dome. */
  lens: string;

  /** The ambient light field's colours. */
  field: {
    base: string;
    /** A lift toward the top of the frame. */
    top: string;
    /** Main light leak (violet). */
    leak: string;
    /** Secondary haze (orchid). */
    haze: string;
    /** Warm accent (gold), kept very faint. */
    warm: string;
    /** Edge shading. */
    shade: string;
  };

  /** Light intensities tuned for NoToneMapping (the stage renders flat). */
  light: {
    ambient: number;
    key: number;
    rim: number;
    fill: number;
    /** Strength of the studio environment (reflections and soft fill). */
    env: number;
    /** Opacity of contact shadows. */
    shadow: number;
  };
}

/** Linear-ish mix of two sRGB hex colours (t = 0 → a, 1 → b). Good enough for tints. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 0xff;
  const out = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

const day = THEMES.light;
const dark = THEMES.dark;

export const SCENE_PALETTES: Record<ThemeName, ScenePalette> = {
  light: {
    night: false,
    canvas: day.canvas,
    surface: day.surface,
    ink: day.ink,
    violet: day.violet,
    violetLight: BRAND_COLORS.violetLight,
    glow: day.glow,
    accent: day.accent,
    gold: BRAND_COLORS.gold,
    gain: day.gainFill,
    loss: day.lossFill,

    paper: BRAND_COLORS.paper,
    porcelain: BRAND_COLORS.porcelain,
    // Pale, so the paper behind shows through; the violet lives in the depth and the rim.
    glassTint: mixHex(BRAND_COLORS.violetLight, '#FFFFFF', 0.45),
    glassDepth: mixHex(BRAND_COLORS.violetLight, BRAND_COLORS.violet, 0.35),
    rim: BRAND_COLORS.violetGlow,
    key: mixHex(BRAND_COLORS.paper, '#FFFFFF', 0.6),
    fill: BRAND_COLORS.mist,
    // Mid-tone paper, so the room fills shadows softly without flattening form.
    env: mixHex(BRAND_COLORS.paper, BRAND_COLORS.graphite, 0.55),
    shadow: mixHex(BRAND_COLORS.graphite, BRAND_COLORS.violet, 0.15),
    emboss: BRAND_COLORS.ink,
    particle: day.violet,
    lens: '#FFFFFF',

    field: {
      base: day.canvas,
      top: mixHex(day.canvas, day.surface, 0.6),
      leak: BRAND_COLORS.violetGlow,
      haze: day.accent,
      warm: BRAND_COLORS.gold,
      shade: mixHex(day.canvas, BRAND_COLORS.graphite, 0.06),
    },

    light: { ambient: 0.5, key: 1.6, rim: 2.2, fill: 0.5, env: 0.9, shadow: 0.16 },
  },
  dark: {
    night: true,
    canvas: dark.canvas,
    surface: dark.surface,
    ink: dark.ink,
    violet: dark.violet,
    violetLight: BRAND_COLORS.violetLight,
    glow: dark.glow,
    accent: dark.accent,
    gold: BRAND_COLORS.gold,
    gain: dark.gainFill,
    loss: dark.lossFill,

    paper: mixHex(BRAND_COLORS.paper, BRAND_COLORS.mist, 0.4),
    porcelain: mixHex(BRAND_COLORS.porcelain, BRAND_COLORS.mist, 0.3),
    glassTint: mixHex(BRAND_COLORS.violetLight, '#FFFFFF', 0.2),
    // Brand violet absorbs toward blue in thick glass; lilac warmed with orchid
    // keeps the body violet (hue about 260°).
    glassDepth: mixHex(BRAND_COLORS.violetLight, dark.accent, 0.4),
    rim: BRAND_COLORS.violetLight,
    key: mixHex(BRAND_COLORS.violetLight, '#FFFFFF', 0.55),
    fill: BRAND_COLORS.nightRaised,
    // A violet-lit room, so glass at night reflects light rather than black.
    env: mixHex(BRAND_COLORS.nightRaised, BRAND_COLORS.violet, 0.3),
    shadow: '#000000',
    emboss: BRAND_COLORS.violetLight,
    particle: BRAND_COLORS.violetLight,
    lens: mixHex(BRAND_COLORS.violetLight, '#FFFFFF', 0.75),

    field: {
      base: dark.canvas,
      top: dark.surface,
      leak: BRAND_COLORS.violetGlow,
      haze: dark.accent,
      warm: BRAND_COLORS.gold,
      shade: mixHex(dark.canvas, '#000000', 0.35),
    },

    light: { ambient: 0.22, key: 0.9, rim: 3.6, fill: 0.3, env: 1.15, shadow: 0.42 },
  },
};

export function scenePalette(theme: ThemeName): ScenePalette {
  return SCENE_PALETTES[theme];
}
