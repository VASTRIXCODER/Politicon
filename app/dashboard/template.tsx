import type { ReactNode } from 'react';
import PageEnter from '@/components/layout/PageEnter';

// A signed-in page arriving by a client-side navigation enters with a short
// rise and a faint sweep of violet light (components/layout/PageEnter); a
// first load, reduced motion and "Pause motion" keep it still. '/', the
// marketing and the auth pages have no template, so they never do; nor do
// Settings and onboarding, which open on a full-page loader (the entrance
// would play on the loader, then cut off the page that replaces it).
export default function Template({ children }: { children: ReactNode }) {
  return <PageEnter>{children}</PageEnter>;
}
