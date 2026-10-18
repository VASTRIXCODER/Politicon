'use client';

import { useEffect } from 'react';
import { MARK_PATHS, MARK_VIEWBOX } from '@/lib/brand/mark';

/**
 * The light paper theme's colours (lib/design/tokens.ts), written out: this
 * boundary ships in every page's first load, and importing the token module
 * would add all of it. tests/brand.test.ts checks they still match.
 */
const PAPER = {
  canvas: '#F6F3EE',
  ink: '#15121F',
  muted: '#5C566B',
  violet: '#6D4AFF',
  violetFill: '#6D4AFF',
  violetLight: '#B9A8FF',
} as const;

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it can't rely on the app's stylesheet, fonts or theme
 * tokens: colours are inline (the light paper theme).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          backgroundColor: PAPER.canvas,
          backgroundImage: `radial-gradient(circle at 50% 0%, ${PAPER.violetLight}55, transparent 60%)`,
          color: PAPER.ink,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: 420, textAlign: 'center' }}>
          <svg viewBox={MARK_VIEWBOX} width="56" height="56" aria-hidden="true" focusable="false" style={{ display: 'block', margin: '0 auto 20px' }}>
            <path d={MARK_PATHS.aperture} fill={PAPER.violetLight} />
            <path d={MARK_PATHS.dome + MARK_PATHS.base} fill={PAPER.violet} />
          </svg>
          <div role="alert">
            <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 600, fontSize: 28, letterSpacing: '-0.01em', margin: '0 0 12px' }}>
              Politicon is having trouble
            </h1>
            <p style={{ color: PAPER.muted, lineHeight: 1.5, margin: 0 }}>
              Something went wrong while loading the app. Please try again in a moment.
            </p>
          </div>
          {error.digest && <p style={{ color: PAPER.muted, fontSize: 12, fontFamily: 'ui-monospace, monospace', marginTop: 12 }}>Reference: {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            // violetFill: white text on it clears 4.5:1.
            style={{ marginTop: 24, padding: '12px 24px', borderRadius: 999, border: 0, background: PAPER.violetFill, color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
