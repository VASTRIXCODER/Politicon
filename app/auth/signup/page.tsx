import type { Metadata } from 'next';
import AuthPanel from '@/components/auth/AuthPanel';
import AuthSplit, { AuthPane } from '@/components/auth/AuthSplit';
import SignUpForm from './SignUpForm';

export const metadata: Metadata = {
  title: 'Create your account',
};

/**
 * Sign up: the form on a porcelain pane, with the glass seal and a short
 * statement in the night panel beside it on wide screens. The layout is
 * server-rendered; the form (with its session check and "check your inbox"
 * step) is the client island.
 */
export default function SignUpPage() {
  return (
    <AuthSplit panel={<AuthPanel kind="signup" />}>
      <AuthPane>
        <SignUpForm />
      </AuthPane>
    </AuthSplit>
  );
}
