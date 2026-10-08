import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/** After an email link signs someone in: a validated `next`, else onboarding or the dashboard. */
export async function redirectAfterSignIn(supabase: SupabaseClient, userId: string, origin: string, next: string | null) {
  if (next) return NextResponse.redirect(new URL(next, origin));
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('has_completed_onboarding')
    .eq('id', userId)
    .maybeSingle();
  return NextResponse.redirect(new URL(profile?.has_completed_onboarding ? '/dashboard' : '/onboarding', origin));
}

/** Back to sign-in with a friendly "link invalid or expired" message. */
export function invalidLink(origin: string) {
  const url = new URL('/auth/signin', origin);
  url.searchParams.set('error', 'link_invalid');
  return NextResponse.redirect(url);
}
