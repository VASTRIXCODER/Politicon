'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './toast.module.css';

export type ToastType = 'success' | 'error';
interface ToastState { id: number; message: string; type: ToastType }

// Errors stay up longer so they can be read; both can be dismissed, and
// neither closes while the pointer or keyboard focus is on it.
const DURATION: Record<ToastType, number> = { success: 4000, error: 9000 };

/** How long a dismissed toast takes to leave (toast.module.css toast-out). */
const EXIT_MS = 240;

// The tone rail and icon colour per type. The message itself stays in ink, so
// it reads at full contrast whatever the tone.
const TONE: Record<ToastType, { rail: string; icon: string }> = {
  success: { rail: 'bg-gain-fill', icon: 'text-gain' },
  error: { rail: 'bg-danger', icon: 'text-danger' },
};

/**
 * A single app-wide style of toast: a solid raised pane with a tone rail.
 * Success messages are announced politely (role=status), errors assertively
 * (role=alert), through live regions that stay mounted so screen readers
 * notice the text arriving. The visible pane is not a live region itself, so
 * nothing is announced twice. It rises in and fades out in plain CSS
 * (toast.module.css), so pages that toast don't load an animation library.
 *
 *   const { toast, showToast } = useToast();
 *   showToast('Saved'); … return <>{toast}…</>;
 *
 * It sits at the bottom of the screen (the right-hand corner from tablets
 * up), above the phone's home indicator. A page with its own bar along the
 * bottom (a sticky save bar, a composer) keeps the toast clear of it by
 * setting TOAST_BOTTOM_INSET_VAR on any ancestor, or with useToastClearance,
 * so a toast never lands on the controls it's reporting on.
 */
export function useToast() {
  const [state, setState] = useState<ToastState | null>(null);
  // The toast that was just dismissed, kept for its exit animation.
  const [leaving, setLeaving] = useState<ToastState | null>(null);
  // The toast on screen, for dismiss (which timers and clicks call after it rendered).
  const current = useRef<ToastState | null>(null);
  useEffect(() => {
    current.current = state;
  }, [state]);
  const [hold, setHold] = useState({ hover: false, focus: false });
  const counter = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    counter.current += 1;
    setHold({ hover: false, focus: false });
    setLeaving(null);
    setState({ id: counter.current, message, type });
  }, []);
  const dismiss = useCallback(() => {
    // Closing a toast that has focus puts focus back where it came from.
    if (box.current?.contains(document.activeElement)) returnFocus.current?.focus();
    returnFocus.current = null;
    setHold({ hover: false, focus: false });
    if (current.current) setLeaving(current.current);
    setState(null);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  const paused = hold.hover || hold.focus;
  useEffect(() => {
    if (!state || paused) return;
    const t = setTimeout(dismiss, DURATION[state.type]);
    return () => clearTimeout(t);
  }, [state, paused, dismiss]);

  const shown = state ?? leaving;
  const toast = (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {state?.type === 'success' && <span key={state.id}>{state.message}</span>}
      </div>
      <div role="alert" className="sr-only">
        {state?.type === 'error' && <span key={state.id}>{state.message}</span>}
      </div>
      {shown && (
        <div
          key={shown.id}
          ref={state ? box : undefined}
          data-leaving={state ? undefined : ''}
          aria-hidden={state ? undefined : true}
          onMouseEnter={() => setHold((h) => ({ ...h, hover: true }))}
          onMouseLeave={() => setHold((h) => ({ ...h, hover: false }))}
          onFocus={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) returnFocus.current = e.relatedTarget as HTMLElement | null;
            setHold((h) => ({ ...h, focus: true }));
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold((h) => ({ ...h, focus: false }));
          }}
          className={cn(
            // Its bottom offset (with the page's inset) is in toast.module.css.
            styles.toast,
            'fixed left-4 right-4 z-toast flex items-start gap-3 overflow-hidden sm:left-auto sm:right-6 sm:max-w-md',
            'rounded-tile border border-fg/10 bg-raised py-3.5 pl-5 pr-3.5 text-sm font-medium text-ink shadow-lift',
            'dark:shadow-[0_24px_48px_-16px_rgb(0_0_0/0.7)]'
          )}
        >
          <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', TONE[shown.type].rail)} />
          {shown.type === 'success'
            ? <Check className={cn('w-4 h-4 flex-shrink-0 mt-0.5', TONE.success.icon)} aria-hidden />
            : <AlertTriangle className={cn('w-4 h-4 flex-shrink-0 mt-0.5', TONE.error.icon)} aria-hidden />}
          <span className="flex-1 leading-relaxed">{shown.message}</span>
          <button
            type="button"
            onClick={dismiss}
            tabIndex={state ? undefined : -1}
            aria-label="Dismiss notification"
            className="-my-1 flex-shrink-0 rounded-full p-1.5 text-muted transition-colors duration-200 ease-civic hover:bg-fg/5 hover:text-ink"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      )}
    </>
  );

  return { toast, showToast };
}

/**
 * The room a page keeps along the bottom of the screen for its own bar, as a
 * CSS length (custom properties inherit, so any ancestor of the toast, or
 * <html>, can set it). The toast rises that much higher.
 */
export const TOAST_BOTTOM_INSET_VAR = '--toast-bottom-inset';

/** Space between a bar and a toast lifted above it. */
const CLEARANCE_GAP_PX = 8;

/**
 * While `active`, keeps the page's toast clear of `bar`, a bar along the
 * bottom of the screen (a sticky save bar, a composer): its height, its
 * offset from the edge and a small gap, kept up to date as it changes size
 * and as the page scrolls (a sticky bar sits mid-screen in its own place,
 * then rides the bottom edge once the page scrolls it there).
 */
export function useToastClearance(bar: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const el = bar.current;
    if (!active || !el) return;
    const root = document.documentElement;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // Only a bar in the lower half of the screen is in the toast's way.
      if (!r.height || r.top + r.bottom < window.innerHeight) {
        root.style.removeProperty(TOAST_BOTTOM_INSET_VAR);
        return;
      }
      const offset = Math.max(0, window.innerHeight - r.bottom);
      root.style.setProperty(TOAST_BOTTOM_INSET_VAR, `${Math.ceil(r.height + offset + CLEARANCE_GAP_PX)}px`);
    };
    // Scrolling: once a frame at most.
    let frame = 0;
    const onScroll = () => {
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', onScroll);
      root.style.removeProperty(TOAST_BOTTOM_INSET_VAR);
    };
  }, [bar, active]);
}
