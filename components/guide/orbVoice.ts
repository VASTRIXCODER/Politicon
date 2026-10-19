/**
 * How the Policy Guide's orb follows the conversation, as pure functions
 * (tests/guide.test.ts). Three-free and tiny: the advisor page imports it in
 * its first load.
 *
 *   thinking  while a reply is on its way (the typing indicator is up)
 *   speaking  briefly once a reply has arrived, pulsing once per word
 *   idle      otherwise
 *
 * /api/advisor answers in one piece (it doesn't stream), so the reply's text
 * is in the DOM, whole, the moment it arrives. The orb then "speaks" it: it
 * pulses once per word on a short cadence, capped so a long reply never
 * keeps it busy for long. The pulses are decoration only (the orb is
 * aria-hidden) and never delay or reveal any text. If the API ever streams,
 * the page increments the pulse per streamed token instead and the orb
 * needs no change.
 */

export type OrbState = 'idle' | 'thinking' | 'speaking';

/** Pulses per reply, at most (about two seconds of speaking). */
export const MAX_BEATS = 28;
/** Time between pulses, in ms. */
export const BEAT_MS = 70;
/** A reply of a word or two still reads as speaking for this long. */
export const MIN_SPEAKING_MS = 600;

/** A letter or digit: Latin, the rest of Unicode's letters, never punctuation or symbols (U+2000-U+2BFF). */
const WORDY = /[A-Za-z0-9\u00C0-\u1FFF\u2C00-\uFFEF]/;

/** The words in a reply (what the orb pulses for): runs of text between spaces, punctuation-only runs left out. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => WORDY.test(w)).length;
}

/** How a reply is spoken: how many pulses, how far apart, and for how long the orb speaks. */
export function speechBeats(text: string): { beats: number; intervalMs: number; durationMs: number } {
  const beats = Math.min(MAX_BEATS, countWords(text));
  return { beats, intervalMs: BEAT_MS, durationMs: Math.max(MIN_SPEAKING_MS, beats * BEAT_MS + 240) };
}

/** The orb's state: thinking always wins (a reply on its way), then speaking, else idle. */
export function orbState(thinking: boolean, speaking: boolean): OrbState {
  if (thinking) return 'thinking';
  return speaking ? 'speaking' : 'idle';
}
