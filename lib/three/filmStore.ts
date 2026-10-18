/**
 * Progress of the landing film ("From the Capitol to your kitchen table"),
 * shared by the DOM side that measures the scroll (components/landing/film)
 * and the 3D scene that plays it (components/three/scenes/LandingFilm).
 *
 * progress runs 0 → 1 across the whole film; shot is the index (0–4) of the
 * shot whose caption is showing. Like sceneStore, read it per frame inside
 * the canvas (filmStore.get()) and subscribe to one slice in React.
 */
import { useSyncExternalStore } from 'react';

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

type Listener = (state: FilmState) => void;

let state: FilmState = INITIAL_FILM_STATE;
const listeners = new Set<Listener>();

/** The shot a progress value falls in (equal shares of the film). */
export function shotAt(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return Math.min(FILM_SHOTS - 1, Math.floor(p * FILM_SHOTS));
}

export const filmStore = {
  get(): FilmState {
    return state;
  },
  set(patch: Partial<Omit<FilmState, 'shot'>>) {
    const progress = Math.min(1, Math.max(0, patch.progress ?? state.progress));
    const next: FilmState = { progress, shot: shotAt(progress), active: patch.active ?? state.active };
    if (next.progress === state.progress && next.active === state.active) return;
    state = next;
    listeners.forEach((l) => l(state));
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Back to the start (tests, and when the film section unmounts). */
  reset() {
    state = INITIAL_FILM_STATE;
    listeners.forEach((l) => l(state));
  },
};

/** One slice of the film state; re-renders only when it changes. Server: the initial state. */
export function useFilmStore<T>(selector: (state: FilmState) => T): T {
  return useSyncExternalStore(
    filmStore.subscribe,
    () => selector(state),
    () => selector(INITIAL_FILM_STATE)
  );
}
