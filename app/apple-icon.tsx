import { ImageResponse } from 'next/og';
import { BRAND, ZAP_PATH } from '@/lib/site';

// Home-screen icon: the Logo mark as a full-bleed tile (iOS rounds the corners).
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
          backgroundImage: `linear-gradient(135deg, ${BRAND.violet}, ${BRAND.violetFill})`,
        }}
      >
        <svg width="112" height="112" viewBox="0 0 24 24">
          <path d={ZAP_PATH} fill={BRAND.text} stroke={BRAND.text} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
