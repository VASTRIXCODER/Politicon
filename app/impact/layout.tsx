import type { Metadata } from 'next';

// Private, signed-in pages are kept out of search results.
export const metadata: Metadata = {
  title: 'My Impact',
  robots: { index: false, follow: false },
};

// The list's receipt and skyline and the detail page's entrances animate with
// CSS ([policyId]/_components/detail.module.css, components/impact), so these
// pages don't load motion/react: the one m.* element, the detail page's
// ConfirmDialog, brings its own setup inside the lazily loaded detail view
// (components/ui/ConfirmDialogWithMotion).
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
