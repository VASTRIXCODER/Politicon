/**
 * The landing film's shape, without React: how many shots it has and which
 * shot a progress value falls in. Server components (the film's captions)
 * and the film's script (components/three/scenes/filmShots.ts) import it
 * from here; lib/three/filmStore.ts re-exports it with the store and its
 * hook, which only client components may import.
 */

export const FILM_SHOTS = 5;

export interface FilmState {
  /** 0 (the Capitol) … 1 (dusk). */
  progress: number;
  /** 0 … FILM_SHOTS - 1. */
  shot: number;
  /** The film section is on screen (scenes may idle when it isn't). */
  active: boolean;
}

export const INITIAL_FILM_STATE: FilmState = Object.freeze({ progress: 0, shot: 0, active: false });

/** The shot a progress value falls in (equal shares of the film). */
export function shotAt(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return Math.min(FILM_SHOTS - 1, Math.floor(p * FILM_SHOTS));
}
