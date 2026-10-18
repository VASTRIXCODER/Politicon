import type { Metadata } from 'next';
import AuthPanel from '@/components/auth/AuthPanel';
import AuthSplit, { AuthPane } from '@/components/auth/AuthSplit';
import SignInForm from './SignInForm';

export const metadata: Metadata = {
  title: 'Sign in',
};

/**
 * Sign in: the form on a porcelain pane, with the glass seal and a short
 * statement in the night panel beside it on wide screens. The layout is
 * server-rendered; the form (and its session check) is the client island.
 */
export default function SignInPage() {
  return (
    <AuthSplit panel={<AuthPanel kind="signin" />}>
      <AuthPane>
        <SignInForm />
      </AuthPane>
    </AuthSplit>
  );
}
