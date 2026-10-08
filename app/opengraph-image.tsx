import { ImageResponse } from 'next/og';
import { BRAND, SITE_NAME, SITE_TAGLINE, ZAP_PATH } from '@/lib/site';

// Default link-preview image for every page (Twitter/X reuses it). Rendered
// at build time with next/og's bundled font, so nothing is fetched. Keep the
// text ASCII: a glyph missing from that font would trigger a network lookup.
export const alt = `${SITE_NAME}: educational, non-partisan estimates of how real bills could affect your money`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
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
          padding: '72px 80px',
          backgroundColor: BRAND.base,
          backgroundImage: [
            'radial-gradient(circle at 12% 8%, rgba(123,97,255,0.34), rgba(123,97,255,0) 46%)',
            'radial-gradient(circle at 92% 96%, rgba(0,212,255,0.16), rgba(0,212,255,0) 42%)',
          ].join(', '),
          color: BRAND.text,
        }}
      >
        {/* Mark + wordmark, as in <Logo size="lg"> */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(123,97,255,0.2)',
              border: '2px solid rgba(123,97,255,0.38)',
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24">
              <path d={ZAP_PATH} fill="none" stroke={BRAND.violetText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: 60, letterSpacing: -1.5 }}>
            <span>Politi</span>
            <span style={{ color: BRAND.violetText }}>con</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', fontSize: 72, lineHeight: 1.08, letterSpacing: -2, maxWidth: 980 }}>
            {SITE_TAGLINE}
          </div>
          <div style={{ display: 'flex', fontSize: 30, lineHeight: 1.35, color: BRAND.muted, maxWidth: 940 }}>
            {`Educational, non-partisan estimates built from ${sources}.`}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 14 }}>
            {chips.map(label => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  padding: '10px 22px',
                  borderRadius: 999,
                  fontSize: 22,
                  border: '1px solid rgba(255,255,255,0.14)',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', fontSize: 22, color: BRAND.muted }}>Not financial advice</div>
        </div>
      </div>
    ),
    size,
  );
}
