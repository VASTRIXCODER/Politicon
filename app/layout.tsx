import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import LenisProvider from '@/components/providers/LenisProvider';
import MotionProvider from '@/components/providers/MotionProvider';
import { ReadingModeProvider } from '@/components/providers/ReadingModeProvider';
import CustomCursor from '@/components/ui/CustomCursor';

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
  title: 'Politicon — Your Money. Every Policy. Crystal Clear.',
  description: 'AI-powered civic tech platform that translates government policies into personalized financial impact. Not political opinion — just the dollar answer.',
  keywords: ['policy impact', 'financial analysis', 'AI civic tech', 'government policy', 'personal finance'],
  authors: [{ name: 'Politicon' }],
  openGraph: {
    title: 'Politicon — Your Money. Every Policy. Crystal Clear.',
    description: 'Discover exactly how government policies affect your wallet. Personalized dollar impact, powered by AI.',
    type: 'website',
    siteName: 'Politicon',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Politicon — Policy Impact Calculator',
    description: 'Personalized financial impact of every government policy, powered by AI.',
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
