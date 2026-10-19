'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isMorphing } from '@/lib/morphState';
import styles from './pageEnter.module.css';

/** How long the entrance class stays on: the rise (280 ms) and the sweep (300 ms), with room to spare. */
export const ENTER_HOLD_MS = 500;

/** lib/motionScript's MOTION_ATTR and REDUCED_MOTION_QUERY, spelled out so this first-load chunk doesn't carry that module again. */
export const MOTION_ATTR_NAME = 'data-motion';
export const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

const subscribeNever = () => () => {};

/**
 * Whether a page rendering now plays its entrance: only one a client-side
 * navigation rendered (`navigated`), with motion allowed, and no morph
 * carrying it in. Read from <html> and the media query, as the head script
 * and lib/motion keep them, so every signed-in page's first load doesn't
 * carry lib/motion and lib/viewTransition a second time for it (the
 * template's chunk is separate from the page's).
 */
export function pageEnters(navigated: boolean): boolean {
  if (!navigated) return false;
  const paused = document.documentElement.getAttribute(MOTION_ATTR_NAME) === 'paused';
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_QUERY).matches;
  return !paused && !reduced && !isMorphing();
}

/**
 * The entrance of a signed-in page (each one's template.tsx renders it): a
 * page that arrives by a client-side navigation rises 8px into place as it
 * fades in, with a faint sweep of violet light (pageEnter.module.css). Only
 * for pages whose first render is the page itself: one that opens on a
 * full-page loader (Settings, onboarding) has no template, since the rise
 * would play on the loader's <main> and cut off the page that replaces it.
 *
 * It stays still on a first load (while hydrating, the server's HTML is
 * already on screen), under reduced motion and "Pause motion", and while a
 * shared-element morph carries the page in (lib/viewTransition marks <html>
 * while one runs: lib/morphState). The wrapper is display: contents, so the
 * page's layout is unchanged, and the class comes off once the entrance is
 * over, so a later <main> never replays it.
 */
export default function PageEnter({ children }: { children: ReactNode }) {
  // False on the server and while hydrating; true for a page a client-side navigation renders.
  const navigated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [entering, setEntering] = useState(() => pageEnters(navigated));

  useEffect(() => {
    if (!entering) return;
    const timer = window.setTimeout(() => setEntering(false), ENTER_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [entering]);

  return (
    <div className={entering ? `${styles.root} ${styles.enter}` : styles.root}>
      {entering && <span aria-hidden="true" data-decorative="" className={styles.sweep} />}
      {children}
    </div>
  );
}
