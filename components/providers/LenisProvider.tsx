'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

// Smooth scrolling is a marketing-page effect. App pages (chat, feeds, tables)
// keep native scrolling so nested scroll areas and keyboard scrolling just work.
const MARKETING = new Set(['/', '/explorer', '/privacy', '/terms', '/disclaimer', '/help']);

export default function LenisProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enabled = MARKETING.has(pathname);

  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // Let any inner scroll container (menus, carousels, code blocks) scroll natively.
      allowNestedScroll: true,
      autoRaf: true,
    });
    return () => lenis.destroy();
  }, [enabled]);

  return <>{children}</>;
}
