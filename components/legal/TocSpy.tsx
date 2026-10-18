'use client';

import { useEffect } from 'react';
import { getLenis } from '@/components/providers/LenisProvider';

/*
 * Keeps the reading pages' table of contents in step with the reader: the
 * link of the section being read gets data-active (the server-rendered
 * links carry data-toc-link). With smooth scrolling on, a click glides to its
 * section instead of jumping, then hands focus to the section so Tab carries
 * on from there; without it (reduced motion), the browser's own jump does
 * the same. On phones the folded contents close after a pick. Renders
 * nothing.
 */

/** A section is "being read" once its top passes this far down the viewport. */
const READ_LINE = 0.3;
/** Room for the fixed navbar above a section scrolled to. */
const NAV_OFFSET = 104;

export default function TocSpy() {
  useEffect(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-toc-link]'));
    const ids = [...new Set(links.map((a) => decodeURIComponent(a.hash.slice(1))))];
    const sections = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!sections.length) return;

    let current = '';
    const mark = (id: string) => {
      if (id === current) return;
      current = id;
      for (const a of links) {
        if (decodeURIComponent(a.hash.slice(1)) === id) a.setAttribute('data-active', '');
        else a.removeAttribute('data-active');
      }
    };

    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = window.innerHeight * READ_LINE;
      let active = sections[0].id;
      for (const s of sections) {
        if (s.getBoundingClientRect().top - line <= 0) active = s.id;
        else break;
      }
      // At the very bottom the last section is the one being read, however short.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) active = sections[sections.length - 1].id;
      mark(active);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-toc-link]');
      if (!link) return;
      link.closest('details')?.removeAttribute('open');
      const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      const lenis = getLenis();
      if (!target || !lenis || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      history.pushState(null, '', link.hash);
      mark(target.id);
      lenis.scrollTo(target, {
        offset: -NAV_OFFSET,
        onComplete: () => {
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        },
      });
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('click', onClick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return null;
}
