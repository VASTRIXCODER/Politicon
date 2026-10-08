import type { Config } from 'tailwindcss';

const config: Config = {
  // lib/ holds class strings too (status colours, chart tokens), so it must be scanned.
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: '#0E0A1F',
        primary: {
          DEFAULT: '#7B61FF',
          // Fill for text-bearing buttons: white on it is about 5.3:1 (AA).
          fill: '#6A4FF0',
          // Violet text on dark or violet-tinted backgrounds: about 8:1 on the base.
          300: '#A996FF',
        },
        secondary: '#00D4FF',
        gold: '#F5C842',
        positive: '#34D399',
        negative: '#F87171',
        'text-primary': '#F0EEF8',
        'text-muted': '#8B87A8',
      },
      // The page background. Kept out of `colors` on purpose: a `base` colour
      // would also generate a `text-base` colour utility that overrides the
      // text colour of anything sized with `text-base` (e.g. .input-glass).
      backgroundColor: {
        base: '#07050F',
      },
      gradientColorStops: {
        base: '#07050F',
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
        16: '0.16',
        18: '0.18',
      },
      // A bare `border`/`border-t` without a colour class gets the theme hairline,
      // not preflight's light grey.
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        // CSS variables are set in app/globals.css and app/layout.tsx.
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        'mono-data': ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Smallest size for metadata (dates, chips, sub-labels). Nothing goes below it.
        meta: ['0.75rem', { lineHeight: '1rem' }],
      },
      animation: {
        'orb-1': 'orb1 22s ease-in-out infinite',
        'orb-2': 'orb2 28s ease-in-out infinite',
        'orb-3': 'orb3 19s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'marquee': 'marquee 40s linear infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        // @keyframes shimmer lives in app/globals.css.
        'shimmer': 'shimmer 2.5s linear infinite',
        'spin-slow': 'spin 20s linear infinite',
      },
      keyframes: {
        orb1: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(80px,-60px) scale(1.1)' },
          '66%': { transform: 'translate(-40px,80px) scale(0.9)' },
        },
        orb2: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(-100px,50px) scale(0.95)' },
          '66%': { transform: 'translate(60px,-80px) scale(1.05)' },
        },
        orb3: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(50px,40px) scale(1.08)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 20px rgba(123,97,255,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(123,97,255,0.6), 0 0 80px rgba(123,97,255,0.2)' },
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
