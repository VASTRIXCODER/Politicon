import type { Metadata } from 'next';

// Sign-in and account pages are kept out of search results.
export const metadata: Metadata = {
  title: 'Account — Politicon',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
