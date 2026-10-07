import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safeNext';

/**
 * Landing point for Supabase email links (sign-up confirmation, email change,
 * password reset) and OAuth. Exchanges the code for a session, then sends the
 * user to a validated `next` path, or to onboarding/dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));
  const providerError = searchParams.get('error_description') || searchParams.get('error');

  if (providerError) {
    const url = new URL('/auth/signin', origin);
    url.searchParams.set('error', 'link_invalid');
    return NextResponse.redirect(url);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (next) return NextResponse.redirect(new URL(next, origin));
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('has_completed_onboarding')
        .eq('id', data.user.id)
        .maybeSingle();
      return NextResponse.redirect(new URL(profile?.has_completed_onboarding ? '/dashboard' : '/onboarding', origin));
    }
  }

  const url = new URL('/auth/signin', origin);
  url.searchParams.set('error', 'link_invalid');
  return NextResponse.redirect(url);
}
