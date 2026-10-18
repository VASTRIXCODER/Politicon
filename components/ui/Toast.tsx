'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { EASE_CIVIC } from '@/components/providers/MotionProvider';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error';
interface ToastState { id: number; message: string; type: ToastType }

// Errors stay up longer so they can be read; both can be dismissed, and
// neither closes while the pointer or keyboard focus is on it.
const DURATION: Record<ToastType, number> = { success: 4000, error: 9000 };

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
 * nothing is announced twice.
 *
 *   const { toast, showToast } = useToast();
 *   showToast('Saved'); … return <>{toast}…</>;
 */
export function useToast() {
  const [state, setState] = useState<ToastState | null>(null);
  const [hold, setHold] = useState({ hover: false, focus: false });
  const counter = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    counter.current += 1;
    setHold({ hover: false, focus: false });
    setState({ id: counter.current, message, type });
  }, []);
  const dismiss = useCallback(() => {
    // Closing a toast that has focus puts focus back where it came from.
    if (box.current?.contains(document.activeElement)) returnFocus.current?.focus();
    returnFocus.current = null;
    setHold({ hover: false, focus: false });
    setState(null);
  }, []);

  const paused = hold.hover || hold.focus;
  useEffect(() => {
    if (!state || paused) return;
    const t = setTimeout(dismiss, DURATION[state.type]);
    return () => clearTimeout(t);
  }, [state, paused, dismiss]);

  const toast = (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {state?.type === 'success' && <span key={state.id}>{state.message}</span>}
      </div>
      <div role="alert" className="sr-only">
        {state?.type === 'error' && <span key={state.id}>{state.message}</span>}
      </div>
      <AnimatePresence>
        {state && (
          <m.div
            key={state.id}
            ref={box}
            onMouseEnter={() => setHold((h) => ({ ...h, hover: true }))}
            onMouseLeave={() => setHold((h) => ({ ...h, hover: false }))}
            onFocus={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) returnFocus.current = e.relatedTarget as HTMLElement | null;
              setHold((h) => ({ ...h, focus: true }));
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold((h) => ({ ...h, focus: false }));
            }}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE_CIVIC }}
            className={cn(
              'fixed bottom-4 left-4 right-4 z-toast flex items-start gap-3 overflow-hidden sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-md',
              'rounded-tile border border-fg/10 bg-raised py-3.5 pl-5 pr-3.5 text-sm font-medium text-ink shadow-lift',
              'dark:shadow-[0_24px_48px_-16px_rgb(0_0_0/0.7)]'
            )}
          >
            <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', TONE[state.type].rail)} />
            {state.type === 'success'
              ? <Check className={cn('w-4 h-4 flex-shrink-0 mt-0.5', TONE.success.icon)} aria-hidden />
              : <AlertTriangle className={cn('w-4 h-4 flex-shrink-0 mt-0.5', TONE.error.icon)} aria-hidden />}
            <span className="flex-1 leading-relaxed">{state.message}</span>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss notification"
              className="-my-1 flex-shrink-0 rounded-full p-1.5 text-muted transition-colors duration-200 ease-civic hover:bg-fg/5 hover:text-ink"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );

  return { toast, showToast };
}
