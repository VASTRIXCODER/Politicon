import type { Metadata, Viewport } from 'next';
import { Fraunces } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import '@/styles/tokens.css';
import './globals.css';
import LenisProvider from '@/components/providers/LenisProvider';
import { ReadingModeProvider } from '@/components/providers/ReadingModeProvider';
import Analytics from '@/components/Analytics';
import StageLoader from '@/components/three/StageLoader';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
import { MOTION_SCRIPT } from '@/lib/motionScript';
import { BRAND_COLORS } from '@/lib/design/tokens';

// All type is self-hosted at build time by next/font (no third-party font CSS).
// Fraunces is the editorial display face; its SOFT and WONK axes give the
// italic accent words their character.
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  style: ['normal', 'italic'],
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--font-fraunces',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Your money. Real bills. Crystal clear.`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ['policy impact', 'legislation', 'Congress.gov', 'Open States', 'civic education', 'household budget', 'AI Policy Guide'],
  authors: [{ name: SITE_NAME }],
  // Titles and descriptions come from each page's own metadata; the share
  // image comes from app/opengraph-image.tsx (Twitter reuses it).
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: BRAND_COLORS.paper },
    { media: '(prefers-color-scheme: dark)', color: BRAND_COLORS.night },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${fraunces.variable} ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme, and a paused-motion choice, before first paint (lib/theme.ts, lib/motion.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to main content</a>
        {/* Motion (motion/react) is set up by the layouts of the signed-in
            pages that animate with it (components/providers/MotionProvider:
            impact, guide, settings), so other pages never load it. */}
        <LenisProvider>
          <ReadingModeProvider>
            {children}
          </ReadingModeProvider>
        </LenisProvider>
        {/* The shared WebGL stage behind every page (loads at idle, tier 1+ only). */}
        <StageLoader />
        {/* Vercel Web Analytics + Speed Insights (Vercel deployments only). */}
        <Analytics />
      </body>
    </html>
  );
}
