'use client';

import { useEffect, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { useModalDialog } from '@/components/layout/useModalDialog';
import { usePresence } from '@/components/layout/usePresence';
import { cn } from '@/lib/utils';
import styles from './guide.module.css';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** The heading's id (the dialog is labelled by it). */
  titleId: string;
  title: ReactNode;
  /** The close button's accessible name ("Close chat history"). */
  closeLabel: string;
  /** Where focus goes back to when the sheet closes (the button that opened it). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Shown only below this breakpoint (the page shows a side panel above it). */
  hideFrom?: 'md' | 'lg';
  /** Marks the content busy while it loads. */
  busy?: boolean;
  /** A line under the title. */
  hint?: ReactNode;
  children: ReactNode;
}

/** How long the sheet takes to slide away (guide.module.css .sheet). */
const EXIT_MS = 320;

/** Tailwind's md and lg breakpoints, where the page's side panels take over from the sheets. */
const BREAKPOINT_PX = { md: 768, lg: 1024 } as const;

/**
 * A modal sheet that rises from the bottom of a phone screen: a solid pane
 * (it holds lists people read and tap), a backdrop that closes it on tap,
 * Escape and a close button, focus moved in and kept inside while it is
 * open, and given back to the opener when it closes (useModalDialog). It
 * slides in plain CSS, and simply appears under reduced motion.
 *
 * It closes itself when the screen grows past `hideFrom` (a tablet turned to
 * landscape, a window widened): hidden there, it would otherwise stay modal,
 * holding the keyboard and the page's scroll with nothing to show.
 */
export default function BottomSheet({ open, onClose, titleId, title, closeLabel, returnFocusRef, hideFrom = 'md', busy, hint, children }: BottomSheetProps) {
  const { mounted, shown } = usePresence(open, EXIT_MS);
  const ref = useModalDialog<HTMLDivElement>(open, onClose, { returnFocusRef, lockScroll: true });
  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return;
    const wide = window.matchMedia(`(min-width: ${BREAKPOINT_PX[hideFrom]}px)`);
    const check = () => {
      if (wide.matches) onClose();
    };
    check();
    wide.addEventListener('change', check);
    return () => wide.removeEventListener('change', check);
  }, [open, hideFrom, onClose]);
  if (!mounted) return null;
  const hide = hideFrom === 'lg' ? 'lg:hidden' : 'md:hidden';
  return (
    <>
      <div
        aria-hidden="true"
        data-shown={shown || undefined}
        onClick={onClose}
        className={cn(styles.backdrop, hide, 'fixed inset-0 z-overlay bg-[rgb(6_4_14/0.6)] motion-reduce:transition-none')}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-shown={shown || undefined}
        className={cn(
          styles.sheet,
          hide,
          'fixed inset-x-0 bottom-0 z-modal flex max-h-[78dvh] flex-col rounded-t-[1.75rem] border-t border-fg/12 bg-raised text-ink',
          'shadow-[0_-24px_64px_-24px_rgb(0_0_0/0.75)] focus:outline-none motion-reduce:transition-none',
          'pb-[env(safe-area-inset-bottom)]'
        )}
      >
        {/* A rim of violet light along the top edge, and the sheet's grip. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 flex-shrink-0 rounded-full bg-fg/20" />
        <div className="flex items-center justify-between gap-3 border-b border-fg/8 px-5 pb-3 pt-2">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-medium text-ink">{title}</h2>
            {hint && <p className="mt-0.5 text-meta text-muted">{hint}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="flex-shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-fg/6 hover:text-ink">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" aria-busy={busy || undefined}>
          {children}
        </div>
      </div>
    </>
  );
}
