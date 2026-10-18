'use client';

import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { m } from 'motion/react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { EASE_CIVIC } from '@/components/providers/MotionProvider';
import Button from '@/components/ui/Button';
import IconTile from '@/components/ui/IconTile';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  /** Shown while true (controlled). */
  open: boolean;
  title: ReactNode;
  /** What will happen, in a sentence or two. */
  body?: ReactNode;
  /** The confirm button's label, a verb: "Delete account", "Clear history". */
  confirmLabel: string;
  cancelLabel?: string;
  /** 'danger' for destructive actions: focus starts on Cancel and Confirm is drawn as a warning. */
  tone?: 'default' | 'danger';
  /** The confirm action is running: Confirm shows `busyLabel` and both buttons wait. */
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  /** Cancel, Escape and a click outside the dialog all call this. */
  onCancel: () => void;
}

/**
 * An in-app confirmation, replacing window.confirm. Built on the native
 * <dialog> opened with showModal(), so the platform supplies the focus trap,
 * the inert page behind it, the top layer and Escape. Focus returns to
 * whatever opened it.
 *
 *   <ConfirmDialog open={asking} title="Delete this analysis?" body="This can't be undone."
 *     confirmLabel="Delete" tone="danger" onConfirm={remove} onCancel={() => setAsking(false)} />
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  busyLabel = 'Working…',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const danger = tone === 'danger';

  // The latest onCancel, for the native close event without re-subscribing.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      // Destructive: start on the safe choice. Otherwise on the action.
      (danger ? cancelRef : confirmRef).current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, danger]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Closed by the platform (a form with method="dialog", close requests) while still meant to be open.
    const onClose = () => {
      const back = returnFocus.current;
      returnFocus.current = null;
      if (back?.isConnected && !dialog.contains(document.activeElement) && document.activeElement !== back) back.focus();
      if (openRef.current) onCancelRef.current();
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  // Escape: keep the dialog controlled; the parent closes it through `open`.
  const onNativeCancel = (e: SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    if (!busy) onCancel();
  };

  // A click on the backdrop lands on the <dialog> itself (the panel fills it).
  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget && !busy) onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={body ? bodyId : undefined}
      onCancel={onNativeCancel}
      onClick={onBackdropClick}
      className={cn(
        'm-auto w-[min(calc(100vw-2rem),28rem)] max-w-none overflow-visible border-0 bg-transparent p-0 text-ink',
        // A fixed night tint: ::backdrop doesn't inherit custom properties in every browser.
        'backdrop:bg-[rgb(14_10_28/0.5)] backdrop:backdrop-blur-[2px]'
      )}
    >
      {/* Re-keyed on open, so the entrance plays each time it opens (and not as it closes). */}
      <m.div
        key={open ? 'open' : 'closed'}
        initial={open ? { opacity: 0, y: 10, scale: 0.98 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: EASE_CIVIC }}
        className="relative overflow-hidden rounded-pane border border-fg/10 bg-raised p-6 shadow-lift sm:p-7 dark:shadow-[0_32px_64px_-24px_rgb(0_0_0/0.8)]"
      >
        {/* Light along the top edge, tinted by the tone. */}
        <span
          aria-hidden="true"
          data-decorative=""
          className={cn(
            'pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent to-transparent',
            danger ? 'via-danger/50' : 'via-primary/50'
          )}
        />
        <div className="flex items-start gap-4">
          <IconTile icon={danger ? AlertTriangle : HelpCircle} tone={danger ? 'danger' : 'violet'} />
          <div className="min-w-0 flex-1 pt-1">
            <h2 id={titleId} className="font-display text-xl font-medium leading-snug text-ink">
              {title}
            </h2>
            {body && (
              <div id={bodyId} className="mt-2 text-sm leading-relaxed text-muted">
                {body}
              </div>
            )}
          </div>
        </div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? 'secondary' : 'primary'}
            magnetic={false}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
            // Danger: the danger red with canvas-coloured text (AA in both themes).
            className={danger ? 'bg-danger text-canvas shadow-none hover:bg-danger/90' : undefined}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </m.div>
    </dialog>
  );
}
