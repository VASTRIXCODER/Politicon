'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { sceneStore } from '@/lib/three/sceneStore';
import { capTier, useTier } from '@/lib/three/tier';
import { useResolvedTheme } from '@/lib/useTheme';
import {
  SceneBoundary,
  nightSections,
  stageStatus,
  useNightSectionCount,
  usePrefersReducedMotion,
  useSceneViewCount,
} from '@/components/three/runtime';

/*
 * Mounted once in the root layout. It is the only 3D code in the first-load
 * bundle, and it stays tiny: it feeds the scene store (scroll, pointer,
 * theme, section), finds night sections, and loads the WebGL stage once the
 * page is idle, on devices of tier 1 or 2, and only where the stage adds
 * something: a page with a SceneView or a night section on it, or a
 * marketing page where the ambient light drifts under a mouse. Everywhere
 * else (app pages, reading pages, touch screens) the CSS poster light is the
 * same picture without a WebGL context. three, R3F and drei live behind the
 * dynamic import below (scripts/check-bundle.mjs fails the build if they
 * reach a first-load chunk).
 */
const Stage = dynamic(() => import('@/components/three/Stage'), { ssr: false });

/**
 * Routes where the ambient light drifts (with a mouse, and motion allowed).
 * Reading pages (help, legal) stay still: their content covers the field.
 */
const DRIFT_ROUTES = new Set(['/', '/explorer', '/lab']);

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/**
 * How long the stage outlives the last thing that needed it, so moving
 * between two 3D pages (or a page that draws its scenes once data arrives)
 * keeps the same canvas.
 */
const RELEASE_MS = 4000;

/** The stage failed to load or crashed: run the rest of this visit without 3D (posters everywhere). */
function onStageError(error: unknown) {
  console.warn('Politicon: the 3D stage stopped, showing posters instead.', error);
  stageStatus.set('off');
  capTier(0);
}

function whenIdle(cb: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: 2500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 1200);
  return () => window.clearTimeout(id);
}

/** Scroll progress and pointer position, written at most once per frame. */
function useScrollAndPointer(pathname: string) {
  useEffect(() => {
    let raf = 0;
    let pointer: { x: number; y: number } | null = null;

    const flush = () => {
      raf = 0;
      const root = document.documentElement;
      const max = root.scrollHeight - window.innerHeight;
      const scroll = max > 1 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      sceneStore.set(pointer ? { scroll, pointer } : { scroll });
      pointer = null;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer = {
        x: (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1,
        y: 1 - (e.clientY / Math.max(1, window.innerHeight)) * 2,
      };
      schedule();
    };

    const fine = typeof window.matchMedia === 'function' && window.matchMedia(FINE_POINTER).matches;
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    if (fine) window.addEventListener('pointermove', onMove, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointermove', onMove);
    };
    // A new page has a new height: measure again on every navigation.
  }, [pathname]);
}

function subscribeFine(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const mql = window.matchMedia(FINE_POINTER);
  mql.addEventListener?.('change', onChange);
  return () => mql.removeEventListener?.('change', onChange);
}

/** A mouse-class pointer (the CSS light drifts under the same rule). False on the server. */
function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribeFine,
    () => typeof window.matchMedia === 'function' && window.matchMedia(FINE_POINTER).matches,
    () => false
  );
}

/**
 * Keeps runtime.nightSections in step with the [data-scene-night] elements
 * on the page. A MutationObserver (batched to one lookup per frame) sees a
 * section the moment a client page renders it, and the ambient field reads
 * the list each frame. Not run on tier 0, where nothing would paint them.
 */
function useNightSectionScan(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof MutationObserver === 'undefined') return;
    let raf = 0;
    const scan = () => {
      raf = 0;
      const found = Array.from(document.querySelectorAll<HTMLElement>('[data-scene-night]'));
      const previous = nightSections.get();
      if (found.length !== previous.length || found.some((el, i) => el !== previous[i])) nightSections.set(found);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(scan);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-scene-night'] });
    scan();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      nightSections.set([]);
    };
  }, [enabled]);
}

/** The [data-scene-section] that fills most of the viewport. */
function useSceneSection(pathname: string) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const ratios = new Map<Element, number>();
    const pick = () => {
      let best = '';
      let bestRatio = 0;
      ratios.forEach((ratio, el) => {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = (el as HTMLElement).dataset.sceneSection ?? '';
        }
      });
      sceneStore.set({ section: best });
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // How much of the viewport the section covers, not how much of the section is visible.
          const cover = e.intersectionRect.height / Math.max(1, window.innerHeight);
          if (e.isIntersecting) ratios.set(e.target, cover);
          else ratios.delete(e.target);
        }
        pick();
      },
      { threshold: [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1] }
    );
    const observed = new Set<Element>();
    const scan = () => {
      document.querySelectorAll('[data-scene-section]').forEach((el) => {
        if (observed.has(el)) return;
        observed.add(el);
        io.observe(el);
      });
    };
    // Client pages render their sections after data arrives, so look again shortly after.
    scan();
    const timers = [window.setTimeout(scan, 600), window.setTimeout(scan, 2000)];
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      io.disconnect();
      sceneStore.set({ section: '' });
    };
  }, [pathname]);
}

export default function StageLoader() {
  const pathname = usePathname();
  const tier = useTier();
  const theme = useResolvedTheme();
  const reducedMotion = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const views = useSceneViewCount();
  const nights = useNightSectionCount();
  const [idle, setIdle] = useState(false);
  const [held, setHeld] = useState(false);

  useScrollAndPointer(pathname);
  useSceneSection(pathname);
  useNightSectionScan(tier > 0);

  useEffect(() => {
    sceneStore.set({ theme });
  }, [theme]);

  const drift = DRIFT_ROUTES.has(pathname) && finePointer && !reducedMotion;
  const wanted = tier > 0 && (views > 0 || nights > 0 || drift);

  // Hold the stage while something wants it; let it go a little after the
  // last thing that did (see RELEASE_MS).
  useEffect(() => {
    if (wanted) {
      setHeld(true);
      return;
    }
    const id = window.setTimeout(() => setHeld(false), RELEASE_MS);
    return () => window.clearTimeout(id);
  }, [wanted]);

  // Wait for an idle moment before pulling in the WebGL code, so it never
  // competes with hydration or the first interaction.
  useEffect(() => {
    if (!wanted || idle) return;
    return whenIdle(() => setIdle(true));
  }, [wanted, idle]);

  const load = tier > 0 && idle && (wanted || held);
  useEffect(() => {
    if (!load) stageStatus.set('off');
    else if (stageStatus.get() === 'off') stageStatus.set('loading');
  }, [load]);

  if (!load) return null;
  return (
    <SceneBoundary onError={onStageError}>
      <Stage tier={tier as 1 | 2} animated={drift} reducedMotion={reducedMotion} />
    </SceneBoundary>
  );
}
