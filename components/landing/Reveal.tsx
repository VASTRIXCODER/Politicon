'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type From = 'up' | 'left' | 'right' | 'none';

interface RevealProps {
  children: ReactNode;
  /** Where the content slides in from (default 'up'). 'none' only fades. */
  from?: From;
  /** Delay in ms, for staggering siblings. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

const hiddenOffset: Record<From, string> = {
  up: 'data-[reveal=hidden]:translate-y-6',
  left: 'data-[reveal=hidden]:-translate-x-8',
  right: 'data-[reveal=hidden]:translate-x-8',
  none: '',
};

/**
 * Scroll-in entrance for marketing sections, without Framer Motion.
 *
 * The server HTML is fully visible, so the copy shows even if JavaScript is
 * slow, blocked or fails to hydrate. After hydration, content that is still
 * off-screen is hidden and fades/slides in when it scrolls into view; content
 * already on screen is left alone, and reduced-motion users get no animation.
 * Focus moving inside also reveals it, so a focused control is never invisible.
 *
 * Descendants can join in through the `reveal` group, e.g.
 * `group-data-[reveal=hidden]/reveal:scale-x-0`.
 */
export default function Reveal({ children, from = 'up', delay = 0, className, style, id }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;

    el.dataset.reveal = 'hidden';
    const reveal = () => {
      el.dataset.reveal = 'shown';
      observer.disconnect();
      el.removeEventListener('focusin', reveal);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) reveal();
      },
      { rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(el);
    // Keyboard focus can land inside before the observer fires (e.g. a short
    // block sitting in the bottom 60px), so focus reveals it too.
    el.addEventListener('focusin', reveal);
    return () => {
      observer.disconnect();
      el.removeEventListener('focusin', reveal);
    };
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      className={cn(
        'group/reveal data-[reveal=hidden]:opacity-0',
        hiddenOffset[from],
        // Only the reveal animates; hiding (off-screen) is instant.
        'data-[reveal=shown]:transition-[opacity,transform] data-[reveal=shown]:duration-700 data-[reveal=shown]:ease-out',
        className
      )}
      style={delay ? { ...style, transitionDelay: `${delay}ms` } : style}
    >
      {children}
    </div>
  );
}
