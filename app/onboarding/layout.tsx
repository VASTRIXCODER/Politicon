import type { Metadata } from 'next';

// Private, signed-in pages are kept out of search results.
export const metadata: Metadata = {
  title: 'Set up your profile',
  robots: { index: false, follow: false },
};

// Onboarding animates with CSS only (components/onboarding/onboarding.module.css),
// so unlike the other signed-in pages it doesn't load motion/react at all.
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
