/**
 * The "Pause motion" preference's storage and its head script, with no
 * React: the root layout (a server component) inlines MOTION_SCRIPT, and
 * lib/motion.ts builds the client side on the same names.
 */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const MOTION_STORAGE_KEY = 'pc-motion';
/** <html data-motion="paused"> while the visitor has paused motion. */
export const MOTION_ATTR = 'data-motion';

/** The stored value → paused or not. Anything but an explicit "paused" plays. */
export function parseMotionPreference(value: unknown): boolean {
  return value === 'paused';
}

/**
 * Runs in <head> before the body is parsed, next to THEME_SCRIPT: marks
 * <html> while motion is paused, so nothing animates even for a frame. Any
 * storage error leaves motion as the OS has it.
 */
export const MOTION_SCRIPT = `(function(){try{if(localStorage.getItem('${MOTION_STORAGE_KEY}')==='paused')document.documentElement.setAttribute('${MOTION_ATTR}','paused');}catch(e){}})();`;
