/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production';

const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin;
  } catch {
    return 'https://*.supabase.co';
  }
})();
// Realtime's WebSocket on the same host: wss:// for https, ws:// for a local http
// project (supabase start, or the e2e fake), which an http source doesn't cover.
const supabaseWs = supabaseOrigin.replace(/^http(s?):/, 'ws$1:');

const csp = [
  "default-src 'self'",
  // Next.js injects small inline bootstrap scripts; eval is only needed by the dev server.
  // Vercel Web Analytics and Speed Insights (components/Analytics.tsx) load from
  // /_vercel/* and send their beacons there, so 'self' covers them here and in connect-src.
  `script-src 'self' 'unsafe-inline' https://vercel.live${isDev ? " 'unsafe-eval'" : ''}`,
  // Every font is self-hosted by next/font, so nothing third-party is allowed here.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} https://vercel.live`,
  'frame-src https://vercel.live',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  poweredByHeader: false,
  eslint: {
    // `next lint` (npm run lint, zero warnings) and the build's lint step cover
    // these paths; Next's default list misses middleware, tests and scripts.
    dirs: [
      'app',
      'components',
      'lib',
      'types',
      'tests',
      'scripts',
      'middleware.ts',
      'next.config.js',
      'playwright.config.ts',
      'vitest.config.ts',
      'vitest.eval.config.ts',
      'tailwind.config.ts',
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
