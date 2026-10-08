'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safeNext';
import {
  afterSignInPath, INVALID_LINK_PATH, isEmailLinkType, RECOVERY_COOKIE, RECOVERY_COOKIE_OPTIONS,
} from '@/lib/server/authRedirect';

/**
 * Verifies an email link's token. It runs only from the button on
 * /auth/confirm (a server-action POST, which Next rejects from other origins),
 * never on the GET itself, so a link someone sends can't silently switch this
 * browser into their account, and mail scanners that prefetch links don't
 * use up the single-use token.
 */
export async function confirmEmailLink(formData: FormData) {
  const tokenHash = formData.get('token_hash');
  const type = formData.get('type');
  const next = formData.get('next');
  if (typeof tokenHash !== 'string' || !tokenHash || !isEmailLinkType(type)) redirect(INVALID_LINK_PATH);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  // Secure email change: the first of the two links succeeds without a user
  // or session; the change finishes once the other address's link is opened.
  if (!error && !data.user && type === 'email_change') redirect('/settings?notice=email_change_pending');
  if (error || !data.user) redirect(INVALID_LINK_PATH);

  if (type === 'recovery') {
    (await cookies()).set(RECOVERY_COOKIE, data.user.id, RECOVERY_COOKIE_OPTIONS);
    redirect('/auth/reset');
  }
  redirect(await afterSignInPath(supabase, data.user.id, safeNextPath(typeof next === 'string' ? next : null)));
}
