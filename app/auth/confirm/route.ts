import { NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safeNext';
import { invalidLink, redirectAfterSignIn } from '@/lib/server/authRedirect';

const TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/**
 * Email links in the token-hash format (the Supabase email templates link to
 * /auth/confirm?token_hash={{ .TokenHash }}&type=…). Unlike the PKCE code
 * flow these work when the link is opened on a different device or browser.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  if (!tokenHash || !type || !TYPES.includes(type)) return invalidLink(origin);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return invalidLink(origin);

  const next = type === 'recovery' ? '/auth/reset' : safeNextPath(searchParams.get('next'));
  return redirectAfterSignIn(supabase, data.user.id, origin, next);
}
