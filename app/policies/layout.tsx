import type { Metadata } from 'next';

// Private, signed-in pages are kept out of search results.
export const metadata: Metadata = {
  title: 'Your policies — Politicon',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
