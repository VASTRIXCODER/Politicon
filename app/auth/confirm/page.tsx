import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import AuthCard from '@/components/auth/AuthCard';
import { createClient } from '@/lib/supabase/server';
import { INVALID_LINK_PATH, isEmailLinkType } from '@/lib/server/authRedirect';
import { confirmEmailLink } from './actions';
import SubmitButton from './SubmitButton';

const COPY: Record<EmailOtpType, { title: string; subtitle: string; button: string }> = {
  signup: { title: 'Confirm your email', subtitle: 'One click and your account is ready.', button: 'Confirm and continue' },
  email: { title: 'Confirm your email', subtitle: 'One click and your account is ready.', button: 'Confirm and continue' },
  invite: { title: 'Accept your invitation', subtitle: 'Continue to set up your Politicon account.', button: 'Continue' },
  magiclink: { title: 'Sign in to Politicon', subtitle: 'Continue to finish signing in.', button: 'Sign in' },
  recovery: { title: 'Reset your password', subtitle: 'Continue to choose a new password.', button: 'Continue' },
  email_change: { title: 'Confirm your new email', subtitle: 'Continue to confirm the change to your email address.', button: 'Confirm' },
};

/**
 * Email links in the token-hash format (the Supabase email templates link to
 * /auth/confirm?token_hash={{ .TokenHash }}&type=…). Unlike the PKCE code
 * flow these work when the link is opened on a different device or browser.
 * Opening the link only shows this page; the token is used when the button
 * is pressed (see ./actions.ts).
 */
export default async function ConfirmEmailLinkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '');
  const tokenHash = param('token_hash');
  const type = param('type');
  if (!tokenHash || !isEmailLinkType(type)) redirect(INVALID_LINK_PATH);

  const { data: { user } } = await (await createClient()).auth.getUser();
  const copy = COPY[type];

  return (
    <AuthCard title={copy.title} subtitle={copy.subtitle}>
      <form action={confirmEmailLink} className="space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={param('next')} />
        {user?.email && (
          <p className="text-sm text-text-muted leading-relaxed">
            You&apos;re signed in as <span className="font-medium text-text-primary">{user.email}</span>. If this link is for a
            different account, continuing switches this browser to that account.
          </p>
        )}
        <SubmitButton>{copy.button}</SubmitButton>
      </form>
    </AuthCard>
  );
}
