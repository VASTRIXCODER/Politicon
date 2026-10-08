'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Open dialogs, oldest first. Only the topmost one handles Tab and Escape, so
 * two open at once (e.g. the nav drawer over the advisor's history panel)
 * don't pull focus back and forth.
 */
const openStack: symbol[] = [];

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest('[inert],[aria-hidden="true"]'),
  );
}

interface Options {
  /** Where focus goes when the dialog closes (e.g. the button that opened it). Defaults to whatever had focus on open. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Stop the page behind from scrolling while open. */
  lockScroll?: boolean;
}

/**
 * Modal behaviour for a drawer, sheet or overlay panel while `open`:
 * focus moves into it, Tab and Shift+Tab stay inside it, Escape calls
 * `onClose`, and focus goes back to the opener once it closes. When dialogs
 * stack, only the most recently opened one responds to the keyboard.
 * Attach the returned ref to the dialog element (role="dialog" aria-modal).
 */
export function useModalDialog<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
  { returnFocusRef, lockScroll = false }: Options = {},
) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    openStack.push(token);
    // Captured now: some browsers (Safari) don't focus a button on click, so prefer the explicit opener.
    const returnTarget = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null);
    const node = ref.current;
    if (node && !node.contains(document.activeElement)) {
      (focusables(node)[0] ?? node).focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const root = ref.current;
      if (!root || openStack[openStack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(root);
      if (items.length === 0) { e.preventDefault(); root.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);

    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    if (lockScroll) html.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = openStack.indexOf(token);
      if (at !== -1) openStack.splice(at, 1);
      if (lockScroll) html.style.overflow = previousOverflow;
      // Leave focus alone if it already moved somewhere real outside the dialog.
      const active = document.activeElement;
      const focusLost = !active || active === document.body || !!node?.contains(active);
      if (returnTarget?.isConnected && focusLost) returnTarget.focus({ preventScroll: true });
    };
  }, [open, lockScroll, returnFocusRef]);

  return ref;
}
