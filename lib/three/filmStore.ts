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
import { INITIAL_FILM_STATE, shotAt, type FilmState } from '@/lib/three/film';

export { FILM_SHOTS, INITIAL_FILM_STATE, shotAt, type FilmState } from '@/lib/three/film';

type Listener = (state: FilmState) => void;

let state: FilmState = INITIAL_FILM_STATE;
const listeners = new Set<Listener>();

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

// ---------------------------------------------------------------------------
// The other way round: where the playing 3D film actually is. Its director
// damps the scroll, so the picture trails a fast scroll by a moment; the page
// around the film (its captions' night at dusk) follows this when a scene is
// playing, so the two never disagree. null while no film scene is playing.

let sceneProgress: number | null = null;
const sceneListeners = new Set<() => void>();

export const filmScene = {
  get(): number | null {
    return sceneProgress;
  },
  /** Called by the film's director every frame it moves (and with null when it stops). */
  set(progress: number | null) {
    if (progress === sceneProgress) return;
    sceneProgress = progress;
    sceneListeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    sceneListeners.add(listener);
    return () => {
      sceneListeners.delete(listener);
    };
  },
};

/** One slice of the playing scene's progress (null: no scene); re-renders only when it changes. */
export function useFilmScene<T>(selector: (progress: number | null) => T): T {
  return useSyncExternalStore(
    filmScene.subscribe,
    () => selector(sceneProgress),
    () => selector(null)
  );
}
