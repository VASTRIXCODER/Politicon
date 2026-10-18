import type { Metadata } from 'next';

// Private, signed-in pages are kept out of search results.
export const metadata: Metadata = {
  title: 'Your policies',
  robots: { index: false, follow: false },
};

// The docket animates with CSS and the Web Animations API (components/feed),
// and its toasts with CSS (components/ui/Toast), so this page doesn't load motion/react.
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
