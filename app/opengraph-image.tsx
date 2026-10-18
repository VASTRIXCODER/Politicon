import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { MARK_PATHS, MARK_VIEWBOX, WORDMARK } from '@/lib/brand/mark';
import { BRAND, SITE_NAME } from '@/lib/site';

// Default link-preview image for every page (Twitter/X reuses it). Rendered
// at build time from fonts read off disk, so nothing is fetched: the wordmark
// and headline in Fraunces, as on the site (Latin subsets in assets/fonts,
// SIL OFL), the rest in Geist from the geist package. Keep the text ASCII: a
// glyph missing from these fonts would trigger a network lookup.
export const alt = `${SITE_NAME}: educational, non-partisan estimates of how real bills could affect your money`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The Aperture Dome in violet light; `lit` adds the glow and a soft ground shadow. */
function Mark({ size: px, lit = false }: { size: number; lit?: boolean }) {
  return (
    <svg width={px} height={px} viewBox={MARK_VIEWBOX}>
      <defs>
        <linearGradient id="shell" x1="0.15" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor={BRAND.violetGlow} />
          <stop offset="0.55" stopColor={BRAND.violet} />
          <stop offset="1" stopColor={BRAND.violetText} />
        </linearGradient>
        <radialGradient id="lens" cx="0.42" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#CFC2FF" />
        </radialGradient>
        <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ground" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={BRAND.violetText} stopOpacity="0.3" />
          <stop offset="1" stopColor={BRAND.violetText} stopOpacity="0" />
        </radialGradient>
      </defs>
      {lit && <ellipse cx="32" cy="57.6" rx="30" ry="3" fill="url(#ground)" />}
      {lit && <circle cx="32" cy="27" r="17" fill="url(#halo)" />}
      <path d={MARK_PATHS.aperture} fill="url(#lens)" />
      <path d={MARK_PATHS.dome + MARK_PATHS.base} fill="url(#shell)" />
    </svg>
  );
}

const font = (...parts: string[]) => readFile(join(process.cwd(), ...parts));

export default async function OpengraphImage() {
  const [frauncesMedium, frauncesMediumItalic, frauncesSemiBold, geist] = await Promise.all([
    font('assets', 'fonts', 'Fraunces-Medium-latin.woff'),
    font('assets', 'fonts', 'Fraunces-MediumItalic-latin.woff'),
    font('assets', 'fonts', 'Fraunces-SemiBold-latin.woff'),
    font('node_modules', 'geist', 'dist', 'fonts', 'geist-sans', 'Geist-Regular.ttf'),
  ]);

  // State bills are only fetched when Open States is configured (read at build
  // time, like the landing page), so the image claims them only then.
  const stateBills = Boolean(process.env.OPENSTATES_API_KEY);
  const chips = ['AI Policy Guide', stateBills ? 'Federal and state bills' : 'Official bill records', 'Assumptions shown'];
  const sources = stateBills ? 'official Congress.gov and Open States records' : 'official Congress.gov records';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 72px',
          position: 'relative',
          backgroundColor: BRAND.paper,
          // Civic Light: violet light leaking onto warm paper.
          backgroundImage: [
            'radial-gradient(circle at 81% 44%, rgba(143,117,255,0.42), rgba(143,117,255,0) 34%)',
            'radial-gradient(circle at 6% -10%, rgba(185,168,255,0.42), rgba(185,168,255,0) 42%)',
            'radial-gradient(circle at 100% 110%, rgba(109,74,255,0.2), rgba(109,74,255,0) 46%)',
          ].join(', '),
          color: BRAND.ink,
          fontFamily: 'Geist',
        }}
      >
        {/* The hero mark, lit, on the right. */}
        <div style={{ position: 'absolute', right: 72, top: 128, display: 'flex' }}>
          <Mark size={360} lit />
        </div>

        {/* Lockup, as in <Logo size="lg">: Fraunces semibold, tracked in by 0.02em. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Mark size={60} />
          <div style={{ display: 'flex', fontFamily: 'Fraunces', fontWeight: 600, fontSize: 46, letterSpacing: '-0.02em' }}>
            {WORDMARK}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 700 }}>
          {/* The hero headline, with its accent words in italic violet. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Fraunces',
              fontWeight: 500,
              fontSize: 78,
              lineHeight: 1.04,
              letterSpacing: '-0.015em',
            }}
          >
            <div style={{ display: 'flex' }}>Your money.</div>
            <div style={{ display: 'flex' }}>Real bills.</div>
            <div style={{ display: 'flex', fontStyle: 'italic', color: BRAND.violetText }}>Crystal clear.</div>
          </div>
          <div style={{ display: 'flex', fontSize: 28, lineHeight: 1.38, color: BRAND.muted, maxWidth: 640 }}>
            {`Educational, non-partisan estimates built from ${sources}.`}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {chips.map((label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  padding: '9px 20px',
                  borderRadius: 999,
                  fontSize: 21,
                  border: '1px solid rgba(21,18,31,0.12)',
                  backgroundColor: 'rgba(255,255,255,0.62)',
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', fontSize: 21, color: BRAND.muted }}>Not financial advice</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Fraunces', data: frauncesMedium, weight: 500, style: 'normal' },
        { name: 'Fraunces', data: frauncesMediumItalic, weight: 500, style: 'italic' },
        { name: 'Fraunces', data: frauncesSemiBold, weight: 600, style: 'normal' },
        { name: 'Geist', data: geist, weight: 400, style: 'normal' },
      ],
    },
  );
}
