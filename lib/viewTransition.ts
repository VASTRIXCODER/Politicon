import { isMorphing, setMorphing } from '@/lib/morphState';
import { prefersLessMotion } from '@/lib/motion';

/**
 * Shared-element page transitions with the View Transitions API
 * (document.startViewTransition), behind feature detection.
 *
 * One morph so far, "bill-sheet": a docket card's bill sheet becomes the
 * impact page's hero as the detail view opens. The card's sheet carries
 * morphSource('bill-sheet'), the hero's title block morphTarget('bill-sheet').
 * Neither has a view-transition-name at rest: a name must be unique on the
 * page when the browser takes its picture, and a docket holds many sheets.
 * navigateWithMorph names the one sheet that was clicked just before the old
 * page is captured, navigates, waits for the new route to render (and a
 * moment more for the hero, while the analysis loads), names the hero, and
 * clears both names when the morph ends.
 *
 *   <div {...morphSource('bill-sheet')}>…<a onClick={(e) => {
 *     if (navigateWithMorph(e.currentTarget, href, () => router.push(href))) e.preventDefault();
 *   }}>…</a></div>
 *
 * Where the API is missing, under reduced motion or "Pause motion", without
 * a source sheet, or while another morph runs, it returns false and does
 * nothing: the caller navigates as usual (a plain link click). It never
 * blocks the navigation itself: the browser always runs the update, even
 * when it skips the animation, and the old picture is held for a bounded
 * time only. No React, no CSS: page code imports it in the first load.
 * While a morph runs, <html> carries data-morphing (lib/morphState), so the
 * page entrance can stand aside without loading this module.
 */

export type MorphName = 'bill-sheet';

export const MORPH_SOURCE_ATTR = 'data-vt-source';
export const MORPH_TARGET_ATTR = 'data-vt-target';

/** Marks the element a morph starts from (spread onto it). */
export const morphSource = (name: MorphName): { 'data-vt-source': MorphName } => ({ [MORPH_SOURCE_ATTR]: name });
/** Marks the element a morph lands on (spread onto it). */
export const morphTarget = (name: MorphName): { 'data-vt-target': MorphName } => ({ [MORPH_TARGET_ATTR]: name });

/** The longest the old page's picture is held while the new route loads. */
export const NAV_WAIT_MS = 1200;
/** Then, how long the new page may take to render the morph's target (the hero, once its analysis loads). */
export const TARGET_WAIT_MS = 350;
/** The morph itself: short, on the civic ease. */
export const MORPH_MS = 300;
const EASE_CIVIC = 'cubic-bezier(.2,.7,.2,1)';
const POLL_MS = 16;

interface ViewTransitionLike {
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  finished: Promise<void>;
}
type StartViewTransition = (update: () => Promise<void>) => ViewTransitionLike;

/** The new page's target is being waited for (the morph will land on it if it renders in time). */
let awaiting: MorphName | null = null;

/** Whether a morph is running now (page-enter transitions stand aside for it). False on the server. */
export { isMorphing };

/**
 * Whether a morph is waiting for this target to render: an element that
 * renders now will be the morph's landing place, so it can skip its own
 * entrance. False on the server.
 */
export function isMorphArriving(name: MorphName): boolean {
  return awaiting === name;
}

function startViewTransition(): StartViewTransition | null {
  if (typeof document === 'undefined') return null;
  const start = (document as Document & { startViewTransition?: unknown }).startViewTransition;
  return typeof start === 'function' ? (start.bind(document) as StartViewTransition) : null;
}

/** Whether a morph would run now: the API exists and motion is allowed. */
export function canMorph(): boolean {
  return !!startViewTransition() && !prefersLessMotion();
}

function setName(el: HTMLElement, name: MorphName) {
  el.style.setProperty('view-transition-name', name);
}

function clearName(el: HTMLElement | null) {
  el?.style.removeProperty('view-transition-name');
}

/** Polls `check` until it gives a value, or `ms` pass (null). */
function until<T>(check: () => T | null | undefined | false, ms: number): Promise<T | null> {
  const deadline = Date.now() + ms;
  return new Promise((resolve) => {
    const tick = () => {
      const found = check();
      if (found) resolve(found);
      else if (Date.now() >= deadline) resolve(null);
      else setTimeout(tick, POLL_MS);
    };
    tick();
  });
}

/** The morph's own pace, on the civic ease (the browser's default is 250 ms, ease). */
function pace() {
  const root = document.documentElement;
  if (typeof root.getAnimations !== 'function') return;
  for (const animation of root.getAnimations({ subtree: true })) {
    const effect = animation.effect as KeyframeEffect | null;
    if (effect?.pseudoElement?.startsWith('::view-transition')) effect.updateTiming({ duration: MORPH_MS, easing: EASE_CIVIC });
  }
}

/**
 * Navigates to `href` with `navigate`, morphing the morph source around
 * `from` (the clicked link) into the new page's target of the same name.
 * Returns true when it has taken the navigation over (the caller prevents the
 * link's default); false when it did nothing and the caller should navigate
 * as usual.
 */
export function navigateWithMorph(from: Element | null, href: string, navigate: () => void, name: MorphName = 'bill-sheet'): boolean {
  const start = startViewTransition();
  if (!start || isMorphing() || prefersLessMotion()) return false;
  const source = from?.closest<HTMLElement>(`[${MORPH_SOURCE_ATTR}="${name}"]`) ?? null;
  if (!source) return false;

  let path: string;
  try {
    path = new URL(href, window.location.href).pathname;
  } catch {
    return false;
  }

  let target: HTMLElement | null = null;
  let transition: ViewTransitionLike;
  setName(source, name);
  setMorphing(true);
  try {
    transition = start(async () => {
      // The old picture is taken: the name moves to the new page's target.
      clearName(source);
      awaiting = name;
      try {
        navigate();
        if (await until(() => window.location.pathname === path, NAV_WAIT_MS)) {
          target = await until(() => document.querySelector<HTMLElement>(`[${MORPH_TARGET_ATTR}="${name}"]`), TARGET_WAIT_MS);
          if (target) setName(target, name);
        }
      } finally {
        awaiting = null;
      }
    });
  } catch {
    clearName(source);
    setMorphing(false);
    return false;
  }

  // A skipped transition rejects these; the navigation has still happened.
  transition.ready.then(pace, () => undefined);
  transition.updateCallbackDone.catch(() => undefined);
  void transition.finished
    .catch(() => undefined)
    .then(() => {
      clearName(source);
      clearName(target);
      setMorphing(false);
    });
  return true;
}
