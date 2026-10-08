'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { RECOVERY_COOKIE } from '@/lib/server/authRedirect';

/**
 * Whether this browser may set a new password without the current one: only
 * a session that a reset link just created (marked by /auth/callback or
 * /auth/confirm for that same user). Any other session uses Settings, which
 * re-checks the current password.
 */
export async function recoveryStatus(): Promise<'ready' | 'no_session' | 'not_recovery'> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return 'no_session';
  return (await cookies()).get(RECOVERY_COOKIE)?.value === user.id ? 'ready' : 'not_recovery';
}

/** A reset link allows one password change. */
export async function endRecovery() {
  (await cookies()).delete(RECOVERY_COOKIE);
}
