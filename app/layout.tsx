import type { Metadata, Viewport } from 'next';
import './globals.css';
import LenisProvider from '@/components/providers/LenisProvider';
import { ReadingModeProvider } from '@/components/providers/ReadingModeProvider';
import CustomCursor from '@/components/ui/CustomCursor';

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@300,400,500,700&f[]=cabinet-grotesk@400,500,700,800&display=swap"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <LenisProvider>
          <ReadingModeProvider>
            <CustomCursor />
            {children}
          </ReadingModeProvider>
        </LenisProvider>
      </body>
    </html>
  );
}
