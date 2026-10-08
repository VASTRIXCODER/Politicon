import type { Metadata } from 'next';
import { Compass } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import AmbientBackground from '@/components/landing/AmbientBackground';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <main id="main" tabIndex={-1} className="max-w-xl mx-auto px-4 pt-40 pb-24 text-center">
          <Compass className="w-10 h-10 text-primary mx-auto mb-6" aria-hidden />
          <p className="font-mono-data text-xs uppercase tracking-widest text-text-muted mb-3">404</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-text-primary mb-3">We couldn&apos;t find that page</h1>
          <p className="text-text-muted mb-8">The link may be out of date, or the page may have moved.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button href="/">Go to the home page</Button>
            <Button href="/help" variant="ghost">Get help</Button>
          </div>
        </main>
      </div>
    </div>
  );
}
