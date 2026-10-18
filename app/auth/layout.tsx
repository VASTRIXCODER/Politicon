import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

// Sign-in and account pages are kept out of search results. A string title
// here would drop the root layout's "%s — Politicon" template for the pages
// below it (Next applies a template to its own segment's children only), so
// the template is restated.
export const metadata: Metadata = {
  title: { default: 'Account', template: `%s — ${SITE_NAME}` },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
