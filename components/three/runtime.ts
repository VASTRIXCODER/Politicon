/**
 * The small, three-free runtime the DOM side and the stage share: whether
 * the stage is up, a handle to request frames, the animation clock, the
 * tracked view boxes and PostFX requests. Pages import this through
 * SceneView and StageLoader, so it must never import three, R3F or drei.
 */
import { Component, createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

type Listener = () => void;

function createSignal<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Stage status

/**
 * off: no stage (tier 0, or not loaded yet). loading: its code is on the way.
 * ready: the canvas has drawn its first frame. lost: the GPU dropped the
 * WebGL context; posters are back until it's restored.
 */
export type StageStatus = 'off' | 'loading' | 'ready' | 'lost';

export const stageStatus = createSignal<StageStatus>('off');

/** Bumped every time a fresh canvas starts (so views know to draw again). */
export const stageGeneration = createSignal(0);

export function useStageStatus(): StageStatus {
  return useSyncExternalStore(stageStatus.subscribe, stageStatus.get, () => 'off');
}

export function useStageGeneration(): number {
  return useSyncExternalStore(stageGeneration.subscribe, stageGeneration.get, () => 0);
}

interface StageHandle {
  /** Requests one frame (the stage renders on demand). */
  invalidate(): void;
  /** Renders a frame synchronously, e.g. from a scroll ticker that has just moved the page. */
  renderNow(): void;
}

let handle: StageHandle | null = null;

/** The live stage, for code outside the canvas. Both calls are no-ops without a stage. */
export const stage = {
  invalidate() {
    handle?.invalidate();
  },
  renderNow() {
    handle?.renderNow();
  },
};

/** Called by Stage while its canvas is mounted. */
export function registerStage(next: StageHandle): () => void {
  handle = next;
  clock.start();
  return () => {
    if (handle === next) handle = null;
  };
}

// ---------------------------------------------------------------------------
// Demand: what on the page needs the canvas. Every mounted SceneView holds a
// claim; night sections ([data-scene-night]) are found in the DOM by
// StageLoader. With neither (and no ambient drift), the stage isn't loaded
// at all and the CSS poster light stands in.

export const sceneViewCount = createSignal(0);

export const sceneViews = {
  /** Held by a SceneView while it is mounted. */
  claim(): () => void {
    sceneViewCount.set(sceneViewCount.get() + 1);
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      sceneViewCount.set(sceneViewCount.get() - 1);
    };
  },
};

export function useSceneViewCount(): number {
  return useSyncExternalStore(sceneViewCount.subscribe, sceneViewCount.get, () => 0);
}

const NO_SECTIONS: readonly HTMLElement[] = [];

/** The [data-scene-night] elements on the page, in document order (kept by StageLoader). */
export const nightSections = createSignal<readonly HTMLElement[]>(NO_SECTIONS);

export function useNightSectionCount(): number {
  return useSyncExternalStore(nightSections.subscribe, () => nightSections.get().length, () => 0);
}

/**
 * Set on a night section while the stage paints the Chamber behind it. Its
 * own background steps aside only then (app/globals.css), so its night text
 * never sits on the day field.
 */
export const NIGHT_LIVE_ATTR = 'data-scene-night-live';

// ---------------------------------------------------------------------------
// Animation clock
//
// The stage renders on demand. Anything that animates on its own (the
// ambient light drifting, a dome swaying) acquires the clock with the frame
// rate it needs; while any request is held, the clock asks for frames at the
// highest requested rate. It never ticks in a hidden tab.

const requests = new Map<symbol, number>();
const clockListeners = new Set<Listener>();
let raf = 0;
let last = 0;

function targetFps() {
  let fps = 0;
  requests.forEach((v) => {
    if (v > fps) fps = v;
  });
  return fps;
}

function tick(now: number) {
  raf = 0;
  const fps = targetFps();
  if (!fps || !handle) return;
  raf = requestAnimationFrame(tick);
  if (document.hidden) return;
  // 1.5 ms of slack so a 60 Hz display lands every other frame at 30 fps.
  if (now - last >= 1000 / fps - 1.5) {
    last = now;
    handle.invalidate();
  }
}

const clock = {
  start() {
    if (!raf && targetFps() && handle && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
  },
};

export const animationClock = {
  /** Holds the clock at `fps` until the returned release is called. */
  acquire(fps: number): () => void {
    const key = Symbol('frames');
    requests.set(key, Math.max(1, Math.min(120, fps)));
    clock.start();
    clockListeners.forEach((l) => l());
    return () => {
      if (!requests.delete(key)) return;
      clockListeners.forEach((l) => l());
    };
  },
  /** The rate the clock runs at now (0 = idle). */
  fps: targetFps,
  subscribe(l: Listener) {
    clockListeners.add(l);
    return () => {
      clockListeners.delete(l);
    };
  },
};

/** Keeps the stage animating at `fps` while `active` is true. */
export function useAnimationFrames(active: boolean, fps = 60) {
  useEffect(() => (active ? animationClock.acquire(fps) : undefined), [active, fps]);
}

export function useClockFps(): number {
  return useSyncExternalStore(animationClock.subscribe, animationClock.fps, () => 0);
}

// ---------------------------------------------------------------------------
// Tracked boxes: the stage re-renders when one of them moves without a
// scroll (content above it grew, a panel opened).

const tracked = new Set<HTMLElement>();

export const trackedBoxes = {
  add(el: HTMLElement): () => void {
    tracked.add(el);
    handle?.invalidate();
    return () => {
      tracked.delete(el);
      handle?.invalidate();
    };
  },
  forEach(fn: (el: HTMLElement) => void) {
    tracked.forEach(fn);
  },
  get size() {
    return tracked.size;
  },
};

// ---------------------------------------------------------------------------
// PostFX requests (tier 2): a view that wants bloom & co. registers its box;
// the stage runs one effect pass, clipped to the union of those boxes.

interface FxRequest {
  /** null means the whole viewport. */
  box: HTMLElement | null;
  /** Darken the frame's edges too (for views that fill the viewport). */
  vignette: boolean;
}

const fxRequests = new Map<symbol, FxRequest>();
const fxVersion = createSignal(0);
const fxChanged = () => fxVersion.set(fxVersion.get() + 1);

export const postFxRequests = {
  request(box: HTMLElement | null, options: { vignette?: boolean } = {}): () => void {
    const key = Symbol('postfx');
    fxRequests.set(key, { box, vignette: !!options.vignette });
    fxChanged();
    return () => {
      if (fxRequests.delete(key)) fxChanged();
    };
  },
  count: () => fxRequests.size,
  vignette: () => [...fxRequests.values()].some((r) => r.vignette),
  subscribe: fxVersion.subscribe,
  forEach(fn: (box: HTMLElement | null) => void) {
    fxRequests.forEach((r) => fn(r.box));
  },
};

export function usePostFxCount(): number {
  return useSyncExternalStore(postFxRequests.subscribe, postFxRequests.count, () => 0);
}

export function usePostFxVignette(): boolean {
  return useSyncExternalStore(postFxRequests.subscribe, postFxRequests.vignette, () => false);
}

// ---------------------------------------------------------------------------
// What a view's content can know about its box.

export interface ViewState {
  /** The box is on screen (content can pause its own work when it isn't). */
  visible: boolean;
  /** The DOM element the view tracks. */
  element: HTMLElement | null;
  /** 'dark' inside a [data-night] section, 'light' inside [data-day], else the page theme. */
  tone: 'light' | 'dark' | null;
}

export const ViewContext = createContext<ViewState>({ visible: true, element: null, tone: null });

export function useViewState(): ViewState {
  return useContext(ViewContext);
}

// ---------------------------------------------------------------------------
// prefers-reduced-motion, SSR-safe (false on the server and during hydration).

const REDUCED = '(prefers-reduced-motion: reduce)';

function subscribeReduced(l: Listener) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const mql = window.matchMedia(REDUCED);
  mql.addEventListener?.('change', l);
  return () => mql.removeEventListener?.('change', l);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED).matches,
    () => false
  );
}

// ---------------------------------------------------------------------------
// The 3D layer is decoration: when part of it fails (a chunk that doesn't
// load, a scene that throws), that part goes quiet and the page carries on.

interface BoundaryProps {
  children?: ReactNode;
  onError?: (error: unknown) => void;
}

export class SceneBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
