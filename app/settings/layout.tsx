import type { Metadata } from 'next';

// Private, signed-in pages are kept out of search results.
export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

// Settings moves with CSS only (its toasts, switches and section nav), so it
// doesn't load motion/react: the one piece that uses it, the dialog that
// confirms deleting the account, brings its own MotionProvider and loads on
// demand (app/settings/_components/AccountDeleteDialog.tsx).
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
