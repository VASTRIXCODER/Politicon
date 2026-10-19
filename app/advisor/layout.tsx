import type { Metadata } from 'next';

// Private, signed-in pages are kept out of search results.
export const metadata: Metadata = {
  title: 'AI Policy Guide',
  robots: { index: false, follow: false },
};

// The Chamber's panes, sheets and orb animate with CSS (components/guide), so
// the page doesn't load motion/react: its one m.* element, the ConfirmDialog
// for deleting a conversation, brings its own setup with its lazy chunk
// (components/ui/ConfirmDialogWithMotion).
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
