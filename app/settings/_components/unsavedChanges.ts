import { useEffect, useId } from 'react';

/*
 * The settings page's unsaved changes, for the leave-page warning
 * (LeaveGuard.tsx). A form with answers that aren't saved yet says so with
 * useUnsavedChanges(dirty); while any does, leaving the page asks first.
 * The rules are here, apart from the component, so they can be tested
 * without a browser.
 */

// ─── which forms hold unsaved changes ───────────────────────────────────────

const dirty = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Whether any form on the page holds unsaved changes (for useSyncExternalStore). */
export function hasUnsavedChanges(): boolean {
  return dirty.size > 0;
}

/** Calls `listener` whenever that changes; returns the unsubscribe. */
export function subscribeUnsavedChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marks one form (by a stable id) as holding unsaved changes, or not. */
export function setUnsavedChanges(id: string, unsaved: boolean): void {
  if (unsaved === dirty.has(id)) return;
  if (unsaved) dirty.add(id);
  else dirty.delete(id);
  emit();
}

/** While `unsaved`, this form's changes keep the leave-page warning on. Cleared when it unmounts. */
export function useUnsavedChanges(unsaved: boolean): void {
  const id = useId();
  useEffect(() => {
    setUnsavedChanges(id, unsaved);
    return () => setUnsavedChanges(id, false);
  }, [id, unsaved]);
}

// ─── which clicks leave the page ────────────────────────────────────────────

/** The parts of a click that decide whether it navigates in this tab. */
export interface LeaveClick {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/** The parts of a link that decide where it goes. */
export interface LeaveLink {
  href: string;
  target?: string | null;
  download?: boolean;
}

/**
 * Where a click on `link` would take this tab away from the page at
 * `current` (an absolute URL), as a same-origin path ("/dashboard?x=1#y"),
 * or null when it doesn't leave: a modified or non-primary click (a new tab
 * or window keeps this one), another window, a download, another site
 * (the browser asks before that one itself, via beforeunload), or a link to
 * a place on this same page.
 */
export function leaveTarget(click: LeaveClick, link: LeaveLink, current: string): string | null {
  if (click.defaultPrevented || click.button !== 0) return null;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  if (link.download) return null;
  if (link.target && link.target !== '_self') return null;
  let to: URL;
  let here: URL;
  try {
    here = new URL(current);
    to = new URL(link.href, here);
  } catch {
    return null;
  }
  if (to.origin !== here.origin) return null;
  if (to.pathname === here.pathname && to.search === here.search) return null;
  return to.pathname + to.search + to.hash;
}
