import { NextResponse } from 'next/server';
import { getMemberCount, MEMBER_COUNT_REVALIDATE } from '@/components/landing/memberCount';

// The landing page renders this figure on the server; the endpoint stays for
// other consumers. The count is cached server-side (getMemberCount) and at the
// CDN, and after a failure getMemberCount backs off for 30s per instance, so it
// needs no per-request rate limit: it costs at most one query per cache period,
// or per backoff window during an outage.
export async function GET() {
  const count = await getMemberCount();
  if (count === null) {
    // null tells the UI to hide the figure rather than show a misleading 0.
    // Cached briefly so an outage isn't hammered by every visit.
    return NextResponse.json({ count: null }, {
      status: 503,
      headers: { 'Cache-Control': 'public, s-maxage=30' },
    });
  }
  return NextResponse.json({ count }, {
    headers: { 'Cache-Control': `public, s-maxage=${MEMBER_COUNT_REVALIDATE}, stale-while-revalidate=3600` },
  });
}
