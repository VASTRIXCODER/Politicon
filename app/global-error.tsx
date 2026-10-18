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

const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it can't rely on the app's stylesheet, fonts or theme
 * tokens: everything is inline (the light paper theme), in the identity's
 * shape all the same: paper with violet light falling from the top, the
 * Aperture Dome with its lens lit, a serif headline with an italic accent,
 * a pill of violet light to try again and a plain way home.
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
          boxSizing: 'border-box',
          backgroundColor: PAPER.canvas,
          backgroundImage: `radial-gradient(ellipse 70% 55% at 50% -10%, ${PAPER.violetLight}66, transparent 70%), radial-gradient(ellipse 60% 40% at 50% 110%, ${PAPER.violetLight}33, transparent 75%)`,
          color: PAPER.ink,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: 440, textAlign: 'center' }}>
          <svg viewBox={MARK_VIEWBOX} width="64" height="64" aria-hidden="true" focusable="false" style={{ display: 'block', margin: '0 auto 28px', filter: `drop-shadow(0 12px 22px ${PAPER.violet}55)` }}>
            <path d={MARK_PATHS.aperture} fill={PAPER.violetLight} />
            <path d={MARK_PATHS.dome + MARK_PATHS.base} fill={PAPER.violet} />
          </svg>
          <div role="alert">
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 34, lineHeight: 1.1, letterSpacing: '-0.015em', margin: '0 0 14px' }}>
              {/* Large text: violet clears 3:1 on the paper. */}
              Politicon is having <em style={{ color: PAPER.violet }}>trouble</em>
            </h1>
            <p style={{ color: PAPER.muted, lineHeight: 1.55, margin: 0 }}>
              Something went wrong while loading the app. Please try again in a moment.
            </p>
          </div>
          {error.digest && <p style={{ color: PAPER.muted, fontSize: 12, fontFamily: MONO, marginTop: 14 }}>Reference: {error.digest}</p>}
          <div style={{ marginTop: 30, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={reset}
              // violetFill: white text on it clears 4.5:1.
              style={{ minHeight: 44, padding: '12px 26px', borderRadius: 999, border: 0, background: PAPER.violetFill, color: '#FFFFFF', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: `0 10px 24px -10px ${PAPER.violet}` }}
            >
              Try again
            </button>
            {/* A full page load on purpose (not next/link): the app around this page is what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{ minHeight: 44, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', padding: '12px 22px', borderRadius: 999, border: `1px solid ${PAPER.ink}26`, color: PAPER.ink, fontSize: 15, fontWeight: 500, textDecoration: 'none' }}
            >
              Go to the home page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
