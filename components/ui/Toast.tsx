'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, X } from 'lucide-react';

export type ToastType = 'success' | 'error';
interface ToastState { id: number; message: string; type: ToastType }

// Errors stay up longer so they can be read; both can be dismissed, and
// neither closes while the pointer or keyboard focus is on it.
const DURATION: Record<ToastType, number> = { success: 4000, error: 9000 };

/**
 * A single app-wide style of toast. Success messages are announced politely
 * (role=status), errors assertively (role=alert), through live regions that
 * stay mounted so screen readers notice the text arriving.
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
          <motion.div
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
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className={`fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 sm:max-w-md z-[200] flex items-start gap-3 px-5 py-3.5 rounded-2xl shadow-xl border text-sm font-medium backdrop-blur-md ${
              state.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/80 border-red-500/30 text-red-300'
            }`}
          >
            {state.type === 'success'
              ? <Check className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
              : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />}
            <span className="flex-1">{state.message}</span>
            <button onClick={dismiss} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return { toast, showToast };
}
