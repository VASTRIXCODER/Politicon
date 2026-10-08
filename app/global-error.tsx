'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it can't rely on the app's stylesheet or fonts.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07050F', color: '#F0EEF8', fontFamily: 'system-ui, sans-serif', padding: 16 }}>
        <main style={{ maxWidth: 420, textAlign: 'center' }}>
          <div role="alert">
            <h1 style={{ fontSize: 24, marginBottom: 12 }}>Politicon is having trouble</h1>
            <p style={{ color: '#8B87A8', lineHeight: 1.5 }}>
              Something went wrong while loading the app. Please try again in a moment.
            </p>
          </div>
          {error.digest && <p style={{ color: '#8B87A8', fontSize: 12, fontFamily: 'monospace' }}>Reference: {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            // #6A4FF0 is the primary-fill token: white text on it clears 4.5:1.
            style={{ marginTop: 20, padding: '12px 24px', borderRadius: 12, border: 0, background: '#6A4FF0', color: '#fff', fontSize: 14, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
