import { useEffect, type RefObject } from 'react';

/*
 * Keeps keyboard focus clear of what floats over Settings (WCAG 2.2 2.4.11,
 * Focus Not Obscured): the floating navbar, the phone's sticky section bar,
 * the profile's save bar while it follows the screen, and the toast.
 *
 * Not scroll-padding: a browser scrolls to bring a focused control out of
 * the padded edge, and a sticky bar lives in that edge, so every focus move
 * inside the save bar (or the phone's section bar) would jolt the page. So
 * the page waits for the browser's own scroll, then nudges the page only
 * when a control that just took keyboard focus sits under one of them.
 */

/** Room kept between a focused control (and its 4px focus ring) and the bar it's moved clear of. */
const GAP_PX = 12;

/**
 * What can float over the page here: navigation (the navbar is fixed, the
 * phone's section bar sticky), the save bar (data-settings-overlay) and the
 * toast (the children of data-settings-toast). Only while fixed or sticky.
 */
const OVERLAYS = 'nav, [data-settings-overlay], [data-settings-toast] > *';

function floating(el: HTMLElement): boolean {
  const { position } = getComputedStyle(el);
  return position === 'fixed' || position === 'sticky';
}

/** How far to scroll so `el` clears the overlays it's under (0 when nothing covers it). */
function clearanceFor(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return 0;
  let below = -Infinity; // the lowest edge of a bar covering it from above
  let above = Infinity; // the highest edge of a bar covering it from below
  for (const o of Array.from(document.querySelectorAll<HTMLElement>(OVERLAYS))) {
    if (o.contains(el) || !floating(o)) continue;
    const b = o.getBoundingClientRect();
    const covers = b.width > 0 && b.height > 0 && r.left < b.right && r.right > b.left && r.top < b.bottom + GAP_PX && r.bottom > b.top - GAP_PX;
    if (!covers) continue;
    if (b.top + b.bottom < window.innerHeight) below = Math.max(below, b.bottom);
    else above = Math.min(above, b.top);
  }
  if (below > -Infinity) return r.top - (below + GAP_PX);
  if (above < Infinity) return r.bottom - (above - GAP_PX);
  return 0;
}

/**
 * While the page is open: a control that takes keyboard focus under a bar
 * (or the toast) is scrolled just clear of it. Focus inside a bar, focus a
 * mouse click gives a button, and the headings a jump focuses by script are
 * left alone.
 */
export function useFocusClearance() {
  useEffect(() => {
    let frame = 0;
    const nudge = (el: HTMLElement) => {
      const delta = clearanceFor(el);
      if (delta) window.scrollBy({ top: delta, behavior: 'instant' });
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || !el.matches(':focus-visible')) return;
      // A script-only focus target (a section heading a jump focuses) is placed by its jump.
      if (el.matches('[tabindex="-1"]:not([role])')) return;
      // Now, and again once the browser has scrolled it into view (focus() scrolls after this event).
      nudge(el);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (document.activeElement === el) nudge(el);
      });
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      cancelAnimationFrame(frame);
    };
  }, []);
}

/**
 * The room the stuck save bar takes at the bottom of the viewport, as a CSS
 * length on <html> (unset otherwise). The page lifts its toast by it, so a
 * toast never lands on the bar.
 */
export const BOTTOM_CLEARANCE_VAR = '--settings-bottom-clearance';

/** Space between the bar and a toast lifted above it. */
const TOAST_GAP_PX = 8;

/**
 * While `active`, publishes the room `bar` (a bar stuck to the bottom edge)
 * takes: its height, its offset from the edge and a small gap, kept up to
 * date as the bar changes size.
 */
export function useBottomClearance(bar: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = bar.current;
    if (!active || !el) return;
    const root = document.documentElement;
    const measure = () => {
      const offset = parseFloat(getComputedStyle(el).bottom) || 0;
      root.style.setProperty(BOTTOM_CLEARANCE_VAR, `${Math.ceil(el.offsetHeight + offset + TOAST_GAP_PX)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(BOTTOM_CLEARANCE_VAR);
    };
  }, [bar, active]);
}
