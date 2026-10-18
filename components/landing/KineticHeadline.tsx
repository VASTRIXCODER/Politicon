'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { loadSplitText } from '@/lib/gsap';
import { prefersLessMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

type Tag = 'h2' | 'h3' | 'p';

interface KineticHeadlineProps {
  /** The element to render (default h2). Never the page's h1, which must show at once. */
  as?: Tag;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Split and lower the lines this far ahead of the viewport (a share of its height)… */
const PREPARE_AHEAD = '0px 0px 60% 0px';
/** …and raise them once the headline is this far into view. */
const PLAY_AT = '0px 0px -12% 0px';

/**
 * A section headline whose lines rise into place through clip masks as it
 * scrolls into view (GSAP SplitText, mask: 'lines', aria: 'auto').
 *
 * It is never hidden in the server HTML: the headline renders as plain,
 * visible text, and stays that way without JavaScript, under reduced
 * motion, and whenever it is already on screen (or above it) when the page
 * hydrates. Only a headline still below the fold is split, and only just
 * before it arrives; its lines are lowered behind their masks (clipped, not
 * transparent) and rise once, after which the split is undone and the
 * original markup is back. GSAP loads on demand (lib/gsap.ts), so none of it
 * is in the first-load bundle.
 *
 *   <KineticHeadline id="how-heading" className="font-display text-display-md">
 *     From the Capitol <em>to your kitchen table.</em>
 *   </KineticHeadline>
 */
export default function KineticHeadline({ as: Tag = 'h2', id, className, children }: KineticHeadlineProps) {
  const ref = useRef<HTMLHeadingElement & HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (prefersLessMotion()) return;
    // Already on screen or scrolled past: leave it exactly as it is.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    let cancelled = false;
    let revert: (() => void) | null = null;
    let play: IntersectionObserver | null = null;

    const prepare = async () => {
      try {
        const [{ gsap, SplitText }] = await Promise.all([loadSplitText(), document.fonts?.ready]);
        // Arrived late (a fast scroll, a jump to an anchor): no animation.
        if (cancelled || el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
        const split = SplitText.create(el, { type: 'lines', mask: 'lines', aria: 'auto' });
        const tween = gsap.set(split.lines, { yPercent: 108 });
        revert = () => {
          tween.kill();
          gsap.killTweensOf(split.lines);
          split.revert();
        };
        play = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e) => e.isIntersecting)) return;
            play?.disconnect();
            gsap.to(split.lines, {
              yPercent: 0,
              duration: 1.1,
              stagger: 0.09,
              ease: 'expo.out',
              onComplete: () => {
                split.revert();
                revert = null;
              },
            });
          },
          { rootMargin: PLAY_AT }
        );
        play.observe(el);
      } catch {
        // GSAP didn't load: the headline simply stays as it is.
      }
    };

    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        void prepare();
      },
      { rootMargin: PREPARE_AHEAD }
    );
    near.observe(el);

    return () => {
      cancelled = true;
      near.disconnect();
      play?.disconnect();
      revert?.();
    };
  }, []);

  return (
    <Tag ref={ref} id={id} className={cn(className)}>
      {children}
    </Tag>
  );
}
