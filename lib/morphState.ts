/**
 * Whether a shared-element morph (lib/viewTransition) is running, kept as an
 * attribute on <html> from the morph's start until its animation ends. Code
 * that only needs to know (PageEnter, in every signed-in page's first load)
 * reads it here without loading the morph itself. No React, no imports.
 */

/** <html data-morphing> while a morph runs. */
export const MORPHING_ATTR = 'data-morphing';

/** Whether a morph is running now. False on the server. */
export function isMorphing(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute(MORPHING_ATTR);
}

/** Marks the morph as running, or over. */
export function setMorphing(on: boolean): void {
  if (on) document.documentElement.setAttribute(MORPHING_ATTR, '');
  else document.documentElement.removeAttribute(MORPHING_ATTR);
}
