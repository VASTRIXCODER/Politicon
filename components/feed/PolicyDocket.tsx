'use client';

import { Children, isValidElement, useLayoutEffect, useRef, type ReactNode } from 'react';
import { prefersLessMotion } from '@/lib/motion';
import { playCue } from '@/lib/sound';
import { cn } from '@/lib/utils';

export interface PolicyDocketProps {
  /** PolicyFeedCards, each keyed by its policy id (and carrying data-docket-key). */
  children: ReactNode;
  /** stack: one column (the dashboard feed). grid: one to three columns (/policies). */
  layout?: 'stack' | 'grid';
  className?: string;
}

const LAYOUT = {
  stack: 'flex flex-col gap-4 sm:gap-5',
  grid: 'grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 xl:grid-cols-3',
};

const EASE = 'cubic-bezier(.2,.7,.2,1)';
/** Cards arriving together fan in one after another, up to this many steps. */
const MAX_STAGGER = 6;
/** At most one rustle in this long (typing a search re-fans the docket on every key). */
const RUSTLE_GAP_MS = 900;
let lastRustle = -Infinity;

type Positions = Map<string, { x: number; y: number }>;

/** Each card's place in the docket, by its key: layout offsets, so scrolling and running animations don't count. */
function measure(root: HTMLElement): Positions {
  const out: Positions = new Map();
  for (const el of Array.from(root.children)) {
    if (el instanceof HTMLElement && el.dataset.docketKey) out.set(el.dataset.docketKey, { x: el.offsetLeft, y: el.offsetTop });
  }
  return out;
}

/**
 * The policy docket: the list that holds the feed's cards at a little depth
 * (each is a bill sheet on a stack of paper: PolicyFeedCard).
 *
 * When the set of cards changes (a filter, a dismissal, a refresh), the
 * cards that stay glide to their new places and the ones that arrive fan in
 * off the stack, one after another: FLIP with the Web Animations API,
 * transforms only, so nothing reflows mid-flight and no text is ever
 * transparent. The first cards fan in once when the docket appears. With
 * reduced motion or "Pause motion" the list simply changes. An optional
 * paper rustle accompanies a re-fan (lib/sound: off unless the visitor
 * turned sound on).
 *
 * The cards stay direct children (no wrappers), so each card can find its
 * neighbours when it's dismissed and move keyboard focus to one of them.
 */
export default function PolicyDocket({ children, layout = 'stack', className }: PolicyDocketProps) {
  const ref = useRef<HTMLDivElement>(null);
  /** Where every card was at the last change, kept current by the ResizeObserver below. */
  const placed = useRef<Positions | null>(null);
  const keys = Children.toArray(children)
    .map((child) => (isValidElement(child) ? String(child.key) : ''))
    .join('|');

  // Card heights change on their own (an analysis lands, a font loads, the
  // window narrows): keep the last known places current, so the next change
  // animates from where the cards really were.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      placed.current = measure(root);
    });
    ro.observe(root);
    for (const el of Array.from(root.children)) ro.observe(el);
    return () => ro.disconnect();
  }, [keys]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const before = placed.current;
    const after = measure(root);
    placed.current = after;
    if (prefersLessMotion() || typeof root.animate !== 'function') return;

    let entering = 0;
    let moved = 0;
    for (const el of Array.from(root.children)) {
      if (!(el instanceof HTMLElement)) continue;
      const key = el.dataset.docketKey;
      const now = key ? after.get(key) : undefined;
      if (!key || !now) continue;
      const was = before?.get(key);
      if (!was) {
        // Off the top of the stack: a little lower and further away, leaning back.
        el.animate(
          [
            { transform: 'perspective(1200px) translate3d(0, 1.25rem, -3.5rem) rotateX(8deg)' },
            { transform: 'perspective(1200px) translate3d(0, 0, 0) rotateX(0deg)' },
          ],
          { duration: 620, delay: Math.min(entering++, MAX_STAGGER) * 55, easing: EASE, fill: 'backwards' }
        );
        continue;
      }
      const dx = was.x - now.x;
      const dy = was.y - now.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      moved++;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration: 520,
        easing: EASE,
      });
    }
    const at = performance.now();
    if (before && (entering || moved) && at - lastRustle > RUSTLE_GAP_MS) {
      lastRustle = at;
      playCue('rustle');
    }
  }, [keys]);

  return (
    <div ref={ref} data-docket={layout} className={cn('relative', LAYOUT[layout], className)}>
      {children}
    </div>
  );
}
