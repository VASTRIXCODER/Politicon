'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

/** Shown when a page crashes while rendering. The rest of the app keeps working. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-base">
      <div className="max-w-md text-center" role="alert">
        <AlertTriangle className="w-10 h-10 text-gold mx-auto mb-6" aria-hidden />
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary mb-3">Something went wrong</h1>
        <p className="text-text-muted mb-2">This page hit an unexpected error. Your data is safe.</p>
        {error.digest && (
          <p className="text-xs text-text-muted font-mono-data mb-6">Reference: {error.digest}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
          <button onClick={reset} className="rounded-xl bg-primary text-white font-medium px-6 py-3 text-sm">Try again</button>
          <Link href="/dashboard" className="rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-text-primary px-6 py-3 text-sm">
            Go to your dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
