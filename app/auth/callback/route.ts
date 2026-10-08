import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safeNext';
import { invalidLink, redirectAfterSignIn } from '@/lib/server/authRedirect';

/**
 * Landing point for Supabase email links that carry a PKCE `code` (sign-up
 * confirmation, email change, password reset) and OAuth. Exchanges the code
 * for a session, then sends the user to a validated `next` path, or to
 * onboarding/dashboard. Links opened on another device use /auth/confirm.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (searchParams.get('error_description') || searchParams.get('error') || !code) return invalidLink(origin);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return invalidLink(origin);
  return redirectAfterSignIn(supabase, data.user.id, origin, next);
}
