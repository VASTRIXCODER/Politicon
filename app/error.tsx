'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';

/** Shown when a page crashes while rendering. The rest of the app keeps working. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" tabIndex={-1} className="min-h-screen flex items-center justify-center px-4 bg-base">
      <div className="max-w-md text-center" role="alert">
        <AlertTriangle className="w-10 h-10 text-gold mx-auto mb-6" aria-hidden />
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-3">Something went wrong</h1>
        <p className="text-text-muted mb-2">This page hit an unexpected error. Your data is safe.</p>
        {error.digest && (
          <p className="text-xs text-text-muted font-mono-data mb-6">Reference: {error.digest}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
          <Button onClick={reset}>Try again</Button>
          <Button href="/dashboard" variant="ghost">Go to your dashboard</Button>
        </div>
      </div>
    </main>
  );
}
