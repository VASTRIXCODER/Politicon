import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson, apiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const Body = z.object({ password: z.string().max(200).optional() });

const RECENT_SIGN_IN_MS = 10 * 60 * 1000;

/** True when the account can sign in with a password (vs. only OAuth). */
function hasPassword(user: User): boolean {
  const providers = (user.app_metadata?.providers as string[] | undefined) || [user.app_metadata?.provider];
  return providers.includes('email');
}

/** Check the user's current password without touching their session cookies. */
async function passwordMatches(email: string, password: string): Promise<boolean> {
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  // End only the throwaway verification session, not the user's other sessions.
  if (!error) await verifier.auth.signOut({ scope: 'local' });
  return !error;
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return apiError(401, 'unauthenticated', 'Please sign in to continue.');

  const limited = await rateLimit(req, 'accountDelete', { userId: user.id });
  if (!limited.ok) return limited.response;

  const body = await readJson(req, Body);
  if (!body.ok) return body.response;

  // Re-authenticate: password accounts confirm their password; OAuth-only
  // accounts (no password) must have signed in within the last 10 minutes.
  if (hasPassword(user)) {
    if (!body.data.password) return apiError(400, 'password_required', 'Enter your password to confirm.');
    if (!(await passwordMatches(user.email, body.data.password))) {
      return apiError(403, 'wrong_password', 'That password is incorrect.');
    }
  } else {
    const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
    if (Date.now() - lastSignIn > RECENT_SIGN_IN_MS) {
      return apiError(403, 'reauth_required', 'For your security, sign out and sign back in, then delete your account.');
    }
  }

  const admin = createAdminClient();
  // Deleting the auth user cascades to every user-owned table (profiles,
  // analyses, feed, chats); ai_usage rows are kept anonymized.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('Account deletion error:', deleteError);
    return apiError(500, 'delete_failed', 'We could not delete your account. Please try again.');
  }

  // Data not linked by foreign key.
  const cleanup = await Promise.allSettled([
    admin.from('newsletter_subscribers').delete().eq('email', user.email.toLowerCase()),
    admin.from('rate_limits').delete().eq('identifier', `user:${user.id}`),
  ]);
  cleanup.forEach((r) => { if (r.status === 'rejected') console.error('Account cleanup error:', r.reason); });

  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
