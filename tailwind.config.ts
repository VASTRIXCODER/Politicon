import type { Config } from 'tailwindcss';
import { DARK_VARIANT } from './lib/design/tokens';

// Every colour is a CSS variable from styles/tokens.css (RGB channels), so one
// class works in the light theme, the dark theme and data-night sections.
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  // lib/ holds class strings too (status colours, chart tokens), so it must be scanned.
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  // `dark:` applies where the nearest theme zone is night, as the tokens do:
  // the dark theme and night sections, but not a day island inside them
  // (DARK_VARIANT, lib/design/tokens.ts).
  darkMode: ['variant', DARK_VARIANT],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        raised: token('raised'),
        ink: token('ink'),
        muted: token('muted'),
        // Hairlines and tints: ink in the light theme, white in the dark one.
        fg: token('fg'),
        primary: {
          DEFAULT: token('violet'),
          // Fill for text-bearing buttons: white on it stays at AA in both themes.
          fill: token('violet-fill'),
          // Violet for body-size text (AA on canvas and surfaces).
          300: token('violet-text'),
        },
        violet: {
          DEFAULT: token('violet'),
          text: token('violet-text'),
          fill: token('violet-fill'),
          glow: token('glow'),
        },
        secondary: token('accent'),
        accent: token('accent'),
        // Text and icons (AA); `gold-fill` for the record's seals and marks.
        gold: { DEFAULT: token('gold'), fill: token('gold-fill') },
        gain: { DEFAULT: token('gain'), fill: token('gain-fill') },
        loss: { DEFAULT: token('loss'), fill: token('loss-fill') },
        // Kept as aliases of gain/loss so older call sites keep their meaning.
        positive: token('gain'),
        negative: token('loss'),
        danger: token('danger'),
        caution: token('caution'),
        focus: token('focus'),
        'text-primary': token('ink'),
        'text-muted': token('muted'),
        cat: {
          taxes: token('cat-taxes'),
          housing: token('cat-housing'),
          healthcare: token('cat-healthcare'),
          employment: token('cat-employment'),
          retirement: token('cat-retirement'),
          education: token('cat-education'),
          energy: token('cat-energy'),
          other: token('cat-other'),
        },
        // Fixed brand colours (don't follow the theme).
        paper: '#F6F3EE',
        porcelain: '#FBFAF7',
        night: { DEFAULT: '#0E0A1C', raised: '#171130' },
      },
      // The page background. Kept out of `colors` on purpose: a `base` colour
      // would also generate a `text-base` colour utility that overrides the
      // text colour of anything sized with `text-base` (e.g. .input-glass).
      backgroundColor: {
        base: token('canvas'),
      },
      gradientColorStops: {
        base: token('canvas'),
      },
      // The design system's hairline and tint steps. Tailwind 3 only generates
      // `/N` opacity modifiers that are on this scale.
      opacity: {
        2: '0.02',
        3: '0.03',
        4: '0.04',
        6: '0.06',
        8: '0.08',
        12: '0.12',
        14: '0.14',
        16: '0.16',
        18: '0.18',
        85: '0.85',
      },
      // A bare `border`/`border-t` without a colour class gets the theme hairline,
      // not preflight's light grey.
      borderColor: {
        DEFAULT: 'rgb(var(--c-fg) / 0.1)',
      },
      fontFamily: {
        // next/font variables are set on <html> in app/layout.tsx; the
        // --font-* aliases live in app/globals.css.
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        'mono-data': ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Smallest size for metadata (dates, chips, sub-labels). Nothing goes below it.
        meta: ['0.75rem', { lineHeight: '1rem' }],
        // Editorial display sizes (fluid between phone and desktop).
        'display-sm': ['clamp(2rem, 1.6rem + 1.6vw, 2.75rem)', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        'display-md': ['clamp(2.5rem, 1.9rem + 2.6vw, 4rem)', { lineHeight: '1.04', letterSpacing: '-0.025em' }],
        'display-lg': ['clamp(3rem, 2rem + 4.4vw, 6rem)', { lineHeight: '0.98', letterSpacing: '-0.03em' }],
      },
      // One easing family for the whole product.
      transitionTimingFunction: {
        civic: 'cubic-bezier(.2,.7,.2,1)',
      },
      // Layering scale: page < stage canvas < content < nav < overlays < toasts.
      zIndex: {
        stage: '0',
        content: '10',
        nav: '50',
        overlay: '60',
        modal: '70',
        toast: '80',
        skip: '100',
      },
      borderRadius: {
        pane: '1.25rem',
        tile: '0.875rem',
      },
      boxShadow: {
        // Soft paper elevation by day, a deep drop by night (app/globals.css
        // switches --shadow-* with the theme, so no shadow ever glows white).
        pane: 'var(--shadow-pane)',
        lift: 'var(--shadow-lift)',
        glow: '0 0 0 1px rgb(var(--c-violet) / 0.25), 0 12px 40px -8px rgb(var(--c-violet) / 0.45)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'marquee': 'marquee 40s linear infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        // @keyframes shimmer lives in app/globals.css.
        'shimmer': 'shimmer 2.5s linear infinite',
        'spin-slow': 'spin 20s linear infinite',
        'drift-1': 'drift1 26s ease-in-out infinite',
        'drift-2': 'drift2 32s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 20px rgb(var(--c-violet) / 0.3)' },
          '50%': { boxShadow: '0 0 40px rgb(var(--c-violet) / 0.55), 0 0 80px rgb(var(--c-violet) / 0.2)' },
        },
        drift1: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(6%,-4%,0) scale(1.08)' },
        },
        drift2: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(-5%,5%,0) scale(0.95)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      backdropBlur: {
        glass: '24px',
      },
    },
  },
  plugins: [],
};

export default config;
