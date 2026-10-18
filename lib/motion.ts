'use client';

/**
 * Whether the page should hold still: the OS "reduce motion" setting, or the
 * site's own "Pause motion" control (components/ui/MotionToggle), which any
 * visitor can use whatever their OS says (WCAG 2.2.2, Pause, Stop, Hide).
 *
 * Pausing is stored in localStorage and applied to <html data-motion="paused">
 * before first paint by MOTION_SCRIPT (lib/motionScript.ts, inlined in
 * app/layout.tsx), so CSS animations and transitions stop at once
 * (app/globals.css), as they do under the OS setting. Scripted motion asks prefersLessMotion() (at the moment it would
 * start) or useLessMotion() (to follow changes): smooth scrolling, the 3D
 * scenes (which drop to their composed still frames), kinetic headlines,
 * the receipt carousel, tilt and magnetic hover.
 *
 * Three-free and tiny: pages import it in their first load.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { MOTION_ATTR, MOTION_STORAGE_KEY, REDUCED_MOTION_QUERY, parseMotionPreference } from '@/lib/motionScript';

export { MOTION_ATTR, MOTION_SCRIPT, MOTION_STORAGE_KEY, REDUCED_MOTION_QUERY, parseMotionPreference } from '@/lib/motionScript';

type Listener = () => void;
const listeners = new Set<Listener>();
/** The visitor's choice, once read (null: not read yet). */
let paused: boolean | null = null;

function readPaused(): boolean {
  if (paused !== null) return paused;
  try {
    paused = parseMotionPreference(localStorage.getItem(MOTION_STORAGE_KEY));
  } catch {
    // Storage blocked: the head script couldn't have set it either.
    paused = document.documentElement.getAttribute(MOTION_ATTR) === 'paused';
  }
  return paused;
}

function osReduced(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** The "Pause motion" control is on. False on the server. */
export function isMotionPaused(): boolean {
  return typeof window !== 'undefined' && readPaused();
}

/** The OS asks for reduced motion, or the visitor paused motion. False on the server. */
export function prefersLessMotion(): boolean {
  return typeof window !== 'undefined' && (readPaused() || osReduced());
}

function emit() {
  listeners.forEach((l) => l());
}

function onStorage(e: StorageEvent) {
  if (e.key !== MOTION_STORAGE_KEY) return;
  paused = parseMotionPreference(e.newValue);
  if (paused) document.documentElement.setAttribute(MOTION_ATTR, 'paused');
  else document.documentElement.removeAttribute(MOTION_ATTR);
  emit();
}

/** Calls `listener` whenever either preference changes (another tab included). */
export function subscribeMotion(listener: Listener): () => void {
  listeners.add(listener);
  const mql = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
  mql?.addEventListener?.('change', listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    mql?.removeEventListener?.('change', listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

/** Pauses (or resumes) motion across the site, at once and for later visits. */
export function setMotionPaused(next: boolean) {
  paused = next;
  try {
    if (next) localStorage.setItem(MOTION_STORAGE_KEY, 'paused');
    else localStorage.removeItem(MOTION_STORAGE_KEY);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  if (next) document.documentElement.setAttribute(MOTION_ATTR, 'paused');
  else document.documentElement.removeAttribute(MOTION_ATTR);
  emit();
}

/**
 * Whether motion should hold still now, following both preferences.
 * `serverValue` is what the server and the hydration render assume (false:
 * motion allowed, unless a component starts paused to be safe).
 */
export function useLessMotion(serverValue = false): boolean {
  return useSyncExternalStore(subscribeMotion, prefersLessMotion, () => serverValue);
}

/** The "Pause motion" control's state and setter (false on the server). */
export function useMotionPaused(): [boolean, (paused: boolean) => void] {
  const value = useSyncExternalStore(subscribeMotion, isMotionPaused, () => false);
  const set = useCallback((next: boolean) => setMotionPaused(next), []);
  return [value, set];
}
