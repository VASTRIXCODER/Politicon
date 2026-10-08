'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

/** Public marketing pages only; app pages keep the plain system cursor. */
const MARKETING_ROUTES = new Set(['/', '/explorer']);
/** Mouse-like pointer that can hover, and no reduced-motion request. */
const ENABLED_QUERY = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
const HOVER_TARGETS = 'a, button, summary, label, [role="button"], [data-cursor-hover]';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(ENABLED_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const getSnapshot = () => window.matchMedia(ENABLED_QUERY).matches;
const getServerSnapshot = () => false;

/**
 * A soft violet ring that trails the mouse on marketing pages. The system
 * cursor stays visible, so this is decoration only. It is off on touch
 * devices, under reduced motion and on app routes.
 */
export default function CustomCursor() {
  const pathname = usePathname();
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!enabled || !MARKETING_ROUTES.has(pathname)) return null;
  return <CursorRing pathname={pathname} />;
}

function CursorRing({ pathname }: { pathname: string }) {
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;

    let x = 0, y = 0, tx = 0, ty = 0;
    let raf = 0;
    let visible = false;

    const draw = () => {
      ring.style.transform = `translate3d(${x - 16}px, ${y - 16}px, 0)`;
    };

    // Ease the ring toward the pointer; stop the loop once it has caught up.
    const tick = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      if (Math.abs(tx - x) < 0.3 && Math.abs(ty - y) < 0.3) {
        x = tx;
        y = ty;
        raf = 0;
      } else {
        raf = requestAnimationFrame(tick);
      }
      draw();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      if (!visible) {
        // First move (or re-entry): appear at the pointer instead of flying in from a corner.
        x = tx;
        y = ty;
        visible = true;
        draw();
        ring.style.opacity = '1';
        return;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };

    // One delegated listener instead of per-element ones, so new or removed
    // elements never leave the ring stuck in its enlarged state.
    const onOver = (e: PointerEvent) => {
      const target = e.target as Element | null;
      ring.dataset.hover = target?.closest?.(HOVER_TARGETS) ? 'true' : 'false';
    };

    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget) return;
      // Pointer left the window.
      visible = false;
      ring.style.opacity = '0';
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Client-side navigation can remove the hovered link without a pointerout.
  useEffect(() => {
    if (ringRef.current) ringRef.current.dataset.hover = 'false';
  }, [pathname]);

  return (
    <div
      ref={ringRef}
      aria-hidden="true"
      className="group/cursor fixed top-0 left-0 z-[9999] pointer-events-none opacity-0 transition-opacity duration-200"
      style={{ willChange: 'transform' }}
    >
      <div className="w-8 h-8 rounded-full border border-primary/40 transition-[transform,border-color] duration-200 group-data-[hover=true]/cursor:scale-125 group-data-[hover=true]/cursor:border-primary/80" />
    </div>
  );
}
