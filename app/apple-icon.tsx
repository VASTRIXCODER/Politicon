import { ImageResponse } from 'next/og';
import { MARK_PATHS_SMALL, MARK_VIEWBOX } from '@/lib/brand/mark';
import { BRAND } from '@/lib/site';

// Home-screen icon: the small Aperture Dome (the drawing for icon sizes, see
// lib/brand/mark.ts) in porcelain on a full-bleed violet tile (iOS rounds the
// corners), with light in its aperture.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BRAND.violet,
          backgroundImage: [
            'radial-gradient(circle at 50% 22%, rgba(255,255,255,0.22), rgba(255,255,255,0) 58%)',
            `linear-gradient(160deg, ${BRAND.violetGlow}, ${BRAND.violet} 50%, ${BRAND.violetText})`,
          ].join(', '),
        }}
      >
        <svg width="128" height="128" viewBox={MARK_VIEWBOX}>
          <defs>
            <radialGradient id="lens" cx="0.42" cy="0.38" r="0.7">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset="1" stopColor={BRAND.violetLight} />
            </radialGradient>
          </defs>
          <path d={MARK_PATHS_SMALL.aperture} fill="url(#lens)" />
          <path d={MARK_PATHS_SMALL.dome + MARK_PATHS_SMALL.base} fill={BRAND.porcelain} fillRule="evenodd" />
        </svg>
      </div>
    ),
    size,
  );
}
