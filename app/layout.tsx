import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import LenisProvider from '@/components/providers/LenisProvider';
import MotionProvider from '@/components/providers/MotionProvider';
import { ReadingModeProvider } from '@/components/providers/ReadingModeProvider';
import CustomCursor from '@/components/ui/CustomCursor';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';

// Self-hosted at build time; exposed as --font-jetbrains (see --font-mono in globals.css).
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

// Clash Display and Satoshi aren't on Google Fonts, so they still come from
// Fontshare (display=swap). Move them to next/font/local once the woff2 files
// are committed under app/fonts.
const FONTSHARE_CSS =
  'https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@400,500,700&display=swap';

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
  themeColor: '#07050F',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jetbrainsMono.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTSHARE_CSS} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to main content</a>
        <MotionProvider>
          <LenisProvider>
            <ReadingModeProvider>
              <CustomCursor />
              {children}
            </ReadingModeProvider>
          </LenisProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
