import type { Metadata } from 'next';
import MotionProvider from '@/components/providers/MotionProvider';

// Private, signed-in pages are kept out of search results.
export const metadata: Metadata = {
  title: 'My Impact',
  robots: { index: false, follow: false },
};

// The signed-in pages animate with motion/react (m.* elements); marketing pages don't load it.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <MotionProvider>{children}</MotionProvider>;
}
