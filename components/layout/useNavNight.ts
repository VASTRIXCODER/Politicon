'use client';

import { useEffect, useState, type RefObject } from 'react';

/*
 * Whether the floating navigation bar is over a night section, so it can
 * turn to night glass with it (Navbar sets data-night on itself, and its
 * tokens follow). Otherwise a pale pill floats over the dark scene, its
 * muted links greyed by the night showing through.
 *
 * A night section is any [data-night] element that isn't decoration, or
 * any element marked [data-nav-night] (decorative bands included); a
 * number there is the share of its height, from the top, that counts as
 * night (a band fading from night to paper: data-nav-night="0.5"). It
 * counts once it lies under the bar's middle line and spans most of it.
 *
 * Checked at most once per animation frame (a handful of rects) while the
 * page scrolls or resizes, and when night attributes change or sections
 * mount (the landing film's dusk, client pages that render late).
 */

const NIGHT = '[data-night], [data-nav-night]';
/** How much of the bar's width a section must span to count. */
const SPAN = 0.6;

export function overNight(bar: HTMLElement): boolean {
  const box = bar.getBoundingClientRect();
  if (!box.width) return false;
  const y = box.top + box.height / 2;
  const x = box.left + box.width / 2;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(NIGHT))) {
    // The bar's own subtree, or a night page around it (its tokens are already night).
    if (bar.contains(el) || el.contains(bar)) continue;
    const marked = el.hasAttribute('data-nav-night');
    // Night drawn inside decoration (a poster's dusk, a fading scrim) doesn't count unless marked.
    if (!marked && el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    const share = marked ? Number(el.getAttribute('data-nav-night')) || 1 : 1;
    if (y < r.top || y > r.top + r.height * Math.min(1, Math.max(0, share))) continue;
    if (x < r.left || x > r.right || r.width < box.width * SPAN) continue;
    return true;
  }
  return false;
}

/** Tracks overNight() for the bar in `ref` (false on the server and until mounted). */
export function useNavNight(ref: RefObject<HTMLElement | null>): boolean {
  const [night, setNight] = useState(false);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const bar = ref.current;
      setNight(bar ? overNight(bar) : false);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    // Night that comes and goes without a scroll (the film's dusk follows its
    // picture, which can settle after the page stops), and sections that mount late.
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    mutations?.observe(document.body, { subtree: true, childList: true, attributeFilter: ['data-night', 'data-nav-night'] });
    return () => {
      cancelAnimationFrame(frame);
      mutations?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [ref]);

  return night;
}
