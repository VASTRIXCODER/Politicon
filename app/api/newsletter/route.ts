import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson, apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';

const Body = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
});

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, 'newsletter');
  if (!limited.ok) return limited.response;

  const body = await readJson(req, Body);
  if (!body.ok) return apiError(400, 'invalid_email', 'Please enter a valid email address.');

  const { error } = await createAdminClient()
    .from('newsletter_subscribers')
    .upsert({ email: body.data.email }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) {
    console.error('Newsletter error:', error);
    return apiError(503, 'subscribe_failed', 'Subscription failed. Please try again later.');
  }
  return NextResponse.json({ success: true });
}
