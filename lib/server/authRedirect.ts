import 'server-only';
import { NextResponse } from 'next/server';
import type { EmailOtpType, SupabaseClient } from '@supabase/supabase-js';

/** Where an email link that can't be used sends the user ("link invalid or expired"). */
export const INVALID_LINK_PATH = '/auth/signin?error=link_invalid';

/** Email-link types /auth/confirm accepts. */
export const EMAIL_LINK_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];
export const isEmailLinkType = (v: unknown): v is EmailOtpType =>
  typeof v === 'string' && (EMAIL_LINK_TYPES as readonly string[]).includes(v);

/**
 * Marks a session that came from a password-reset link, bound to the user id.
 * /auth/reset only lets a new password be set without the current one while
 * this is present; any other session changes it in Settings, which asks for
 * the current password first.
 */
export const RECOVERY_COOKIE = 'pc_recovery';
export const RECOVERY_COOKIE_OPTIONS = {
  httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 15 * 60,
} as const;

/** After an email link signs someone in: a validated `next`, else onboarding or the dashboard. */
export async function afterSignInPath(supabase: SupabaseClient, userId: string, next: string | null): Promise<string> {
  if (next) return next;
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('has_completed_onboarding')
    .eq('id', userId)
    .maybeSingle();
  return profile?.has_completed_onboarding ? '/dashboard' : '/onboarding';
}

export async function redirectAfterSignIn(supabase: SupabaseClient, userId: string, origin: string, next: string | null) {
  return NextResponse.redirect(new URL(await afterSignInPath(supabase, userId, next), origin));
}

/** Back to sign-in with a friendly "link invalid or expired" message. */
export function invalidLink(origin: string) {
  return NextResponse.redirect(new URL(INVALID_LINK_PATH, origin));
}
