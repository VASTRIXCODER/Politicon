import { playCue } from '@/lib/sound';

/*
 * The docket's sounds (lib/sound: every one silent unless the visitor turned
 * sound on), each beside something visible:
 *
 *   rustleDocket()           a paper rustle as the docket re-fans: a filter
 *                            changed, a card was dismissed
 *   analysisLanded(…)        whether a card's own analysis just finished,
 *                            for a warm chime as "Analyzed" appears
 */

/** At most one rustle in this long (typing a search re-fans the docket on every key). */
export const RUSTLE_GAP_MS = 900;
let lastRustle = -Infinity;

/**
 * Whether the visitor has just clicked, tapped or typed (the browser's
 * transient user activation, a few seconds). A docket that changes on its
 * own (a feed poll landing) is not their doing, so it stays quiet. Browsers
 * without the User Activation API get the benefit of the doubt.
 */
function justActed(): boolean {
  if (typeof navigator === 'undefined') return false;
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation ? activation.isActive : true;
}

/**
 * A paper rustle for a change to the docket. `deliberate` is for a call
 * straight from the visitor's own action (a dismissal); otherwise it plays
 * only right after they acted. Repeats within RUSTLE_GAP_MS play once.
 */
export function rustleDocket({ deliberate = false }: { deliberate?: boolean } = {}): void {
  if (!deliberate && !justActed()) return;
  const now = Date.now();
  if (now - lastRustle < RUSTLE_GAP_MS) return;
  lastRustle = now;
  playCue('rustle');
}

/**
 * Whether a card's analysis has just finished: it was analyzing, it no
 * longer is, and it's now analyzed (a failure, or a card first rendered
 * already analyzed, isn't).
 */
export function analysisLanded(wasAnalyzing: boolean, analyzing: boolean, analyzed: boolean): boolean {
  return wasAnalyzing && !analyzing && analyzed;
}
