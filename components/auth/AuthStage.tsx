'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import SceneView from '@/components/three/SceneView';
import AuthSeal from '@/components/three/scenes/AuthSeal.lazy';
import { cn } from '@/lib/utils';
import styles from './auth.module.css';

/*
 * The client half of the night panel beside the sign-in and sign-up forms.
 * The panel only shows from the lg breakpoint, so on smaller screens it must
 * not ask for the 3D stage at all (a SceneView or a data-scene-night section
 * anywhere on the page loads it, hidden or not). Both pieces start in their
 * phone form, which is also what the server renders, and switch once the
 * page knows the screen is wide enough.
 */

const DESKTOP = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const mql = window.matchMedia(DESKTOP);
  mql.addEventListener?.('change', onChange);
  return () => mql.removeEventListener?.('change', onChange);
}

/** True from the lg breakpoint up; false on the server and during hydration. */
function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP).matches,
    () => false
  );
}

/**
 * A night pane (the Chamber) that the WebGL light field paints behind once
 * the stage is up, so the seal's view inside it shows through. Until then,
 * and without WebGL, it keeps its own night background and CSS aurora.
 */
export function AuthNightPanel({ className, children }: { className?: string; children: ReactNode }) {
  const desktop = useDesktop();
  return (
    <div
      data-night=""
      data-scene-night={desktop ? '' : undefined}
      className={cn('relative isolate overflow-hidden bg-canvas text-ink', styles.panelRim, className)}
    >
      <div aria-hidden="true" data-decorative="" className={cn('pointer-events-none absolute inset-0 -z-10', styles.aurora)} />
      {children}
    </div>
  );
}

/** The glass seal: the 3D scene on a wide screen, its server-rendered poster everywhere else. */
export function AuthSealView({ poster, className }: { poster: ReactNode; className?: string }) {
  const desktop = useDesktop();
  if (!desktop) {
    // The same boxes SceneView draws, so nothing moves when it takes over.
    return (
      <div aria-hidden="true" data-decorative="" className={cn('relative', className)}>
        <div className="absolute inset-0">{poster}</div>
      </div>
    );
  }
  return (
    <SceneView eager className={className} poster={poster}>
      <AuthSeal />
    </SceneView>
  );
}
