/**
 * The page state the 3D stage reacts to, in a tiny external store (no state
 * library): scroll progress, the scene section in view, the theme, and the
 * pointer. components/three/StageLoader.tsx feeds it; scenes read it.
 *
 * Inside the canvas, read it per frame without re-rendering:
 *   useFrame(() => { const { scroll, pointer } = sceneStore.get(); … })
 * In React, subscribe to one slice:
 *   const theme = useSceneStore((s) => s.theme);
 * A selector must return a primitive or a value stored as is (s.pointer),
 * never a new object or array, or the component re-renders forever.
 */
import { useSyncExternalStore } from 'react';

export interface ScenePointer {
  /** -1 (left edge of the viewport) … 1 (right edge). */
  x: number;
  /** -1 (bottom) … 1 (top). */
  y: number;
}

export interface SceneState {
  /** Page scroll progress, 0 (top) … 1 (bottom). 0 on pages that don't scroll. */
  scroll: number;
  /** data-scene-section of the section filling most of the viewport ('' if none). */
  section: string;
  /** The page theme actually applied (<html data-theme>). */
  theme: 'light' | 'dark';
  /** The mouse position over the viewport. Stays at 0,0 for touch and pen. */
  pointer: ScenePointer;
}

export const INITIAL_SCENE_STATE: SceneState = Object.freeze({
  scroll: 0,
  section: '',
  theme: 'light',
  pointer: Object.freeze({ x: 0, y: 0 }),
});

type Listener = (state: SceneState, previous: SceneState) => void;

let state: SceneState = INITIAL_SCENE_STATE;
const listeners = new Set<Listener>();

function same(a: SceneState, b: SceneState) {
  return (
    a.scroll === b.scroll &&
    a.section === b.section &&
    a.theme === b.theme &&
    a.pointer.x === b.pointer.x &&
    a.pointer.y === b.pointer.y
  );
}

export const sceneStore = {
  get(): SceneState {
    return state;
  },
  /** Merges a partial update; listeners run only if something changed. */
  set(patch: Partial<SceneState>) {
    const next = { ...state, ...patch };
    if (same(next, state)) return;
    const previous = state;
    state = next;
    listeners.forEach((l) => l(state, previous));
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Back to the initial state (tests). */
  reset() {
    state = INITIAL_SCENE_STATE;
  },
};

/** One slice of the scene state, re-rendering only when it changes. Server and hydration: the initial state. */
export function useSceneStore<T>(selector: (state: SceneState) => T): T {
  return useSyncExternalStore(
    sceneStore.subscribe,
    () => selector(state),
    () => selector(INITIAL_SCENE_STATE)
  );
}
