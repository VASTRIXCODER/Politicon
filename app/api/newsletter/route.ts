import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson, apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';

const Body = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
});

// Only stores the address. Nothing is emailed yet (no confirmation, no digest),
// so the signup copy in components/landing/NewsletterSection.tsx says exactly that.
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, 'newsletter');
  if (!limited.ok) return limited.response;

  const body = await readJson(req, Body);
  if (!body.ok) {
    // Bad JSON or a failed schema check both mean the address was unusable;
    // other failures (wrong content type, oversized body) keep their own codes.
    if (body.response.status !== 400) return body.response;
    return apiError(400, 'invalid_email', 'Please enter a valid email address.');
  }

  try {
    const { error } = await createAdminClient()
      .from('newsletter_subscribers')
      .upsert({ email: body.data.email }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) throw error;
  } catch (e) {
    console.error('Newsletter error:', e);
    return apiError(503, 'subscribe_failed', 'Subscription failed. Please try again later.');
  }
  return NextResponse.json({ success: true });
}
