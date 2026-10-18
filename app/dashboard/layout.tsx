import type { Metadata } from 'next';

// Private, signed-in pages are kept out of search results.
export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

// The dashboard's entrances, docket and toasts animate with CSS and the Web
// Animations API (dashboard.module.css, components/feed, components/ui/Toast),
// so unlike the impact, guide and settings pages it doesn't load motion/react.
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
