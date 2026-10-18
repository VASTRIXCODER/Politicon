'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { getLenis } from '@/components/providers/LenisProvider';
import { usePrefersReducedMotion } from '@/components/three/runtime';
import { useTier } from '@/lib/three/tier';
import { cn } from '@/lib/utils';
import { anchorCorrection, anchorFor, type ScrollAnchor } from './filmAnchor';
import type { FilmStageProps } from './FilmStage';

/*
 * Chooses how the landing film plays, and keeps the reader in place when
 * that changes.
 *
 *   static  Five panels down the page, each a still and its caption, all
 *           fully visible. What the server sends, what hydration renders,
 *           and what stays for reduced motion and on tier 0 (no WebGL,
 *           Data Saver, effects off). With reduced motion on a device that
 *           does run 3D, each still becomes a composed frame of the real
 *           scene (FilmStill).
 *   film    The pinned, scroll-driven film (FilmStage), once the browser
 *           knows motion is allowed and the 3D stage can run, on a screen
 *           tall enough for a caption under the navigation and the rail
 *           (a phone held sideways keeps the static sequence).
 *
 * The film's code loads only when it's wanted, so it isn't in the page's
 * first load. Switching layouts changes the section's height; if the reader
 * is partway through or already past it, the scroll position is corrected in
 * the same frame, so the story doesn't jump.
 */

type Mode = 'static' | 'film';

/** Too short for the pinned film's caption to clear the navigation bar and the rail. */
const SHORT_SCREEN = '(max-height: 520px)';

function subscribeShort(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const mql = window.matchMedia(SHORT_SCREEN);
  mql.addEventListener?.('change', onChange);
  return () => mql.removeEventListener?.('change', onChange);
}

/** A short viewport (landscape phones); false on the server and during hydration. Follows rotation. */
function useShortScreen(): boolean {
  return useSyncExternalStore(
    subscribeShort,
    () => typeof window.matchMedia === 'function' && window.matchMedia(SHORT_SCREEN).matches,
    () => false
  );
}

interface FilmStillProps {
  shot: number;
  poster: ReactNode;
}

export interface FilmPlayerProps {
  /** One server-rendered caption per shot (FilmCaption). */
  captions: ReactNode[];
  /** The same steps as text (FilmTranscript), for screen readers in the pinned film. */
  transcripts: ReactNode[];
  /** One still per shot (FilmPoster). */
  posters: ReactNode[];
  /** Short labels for the film's rail. */
  labels: string[];
  /** Step numerals ("01" …). */
  numerals: string[];
  /** The shot that dips into night (dusk), or -1. */
  nightShot: number;
  /** What the 3D film shows, for screen readers. */
  sceneLabel: string;
  /** Id of the empty target right after the film ("Skip the film"). */
  endId: string;
}

/** Loads a component module once `wanted` turns true; null until it has arrived. */
function useLoaded<P>(wanted: boolean, load: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> | null {
  const [component, setComponent] = useState<ComponentType<P> | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    if (!wanted || component) return;
    let live = true;
    loader.current().then(
      (mod) => {
        if (live) setComponent(() => mod.default);
      },
      // Offline or a failed chunk: the static sequence simply stays.
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [wanted, component]);
  return component;
}

/** Turns the browser's own scroll anchoring off around a layout switch we correct ourselves. */
function holdScrollAnchoring(): () => void {
  const targets = [document.documentElement, document.body];
  const previous = targets.map((el) => el.style.overflowAnchor);
  targets.forEach((el) => {
    el.style.overflowAnchor = 'none';
  });
  return () => targets.forEach((el, i) => (el.style.overflowAnchor = previous[i]));
}

function scrollByNow(dy: number) {
  const top = window.scrollY + dy;
  const lenis = getLenis();
  if (lenis) {
    lenis.resize();
    lenis.scrollTo(top, { immediate: true, force: true });
  } else {
    window.scrollTo(0, top);
  }
}

export default function FilmPlayer({ captions, transcripts, posters, labels, numerals, nightShot, sceneLabel, endId }: FilmPlayerProps) {
  // Both are "no" on the server and during hydration (tier 0, motion allowed),
  // so the first render is always the static sequence the server sent.
  const tier = useTier();
  const reducedMotion = usePrefersReducedMotion();
  const short = useShortScreen();
  const Stage = useLoaded<FilmStageProps>(tier > 0 && !reducedMotion && !short, () => import('./FilmStage'));
  const Still = useLoaded<FilmStillProps>(tier > 0 && reducedMotion, () => import('./FilmStill'));

  // A change of mode (rotating a phone, pausing motion) goes through the same
  // scroll-anchor correction as the first switch.
  const desired: Mode = tier > 0 && !reducedMotion && !short && Stage ? 'film' : 'static';
  const [mode, setMode] = useState<Mode>('static');
  const root = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ at: ScrollAnchor; release: () => void } | null>(null);

  // Measure where the reader is in the old layout, then switch (before paint).
  useLayoutEffect(() => {
    if (desired === mode) return;
    const el = root.current;
    if (el) {
      const box = el.getBoundingClientRect();
      anchor.current = { at: anchorFor(box.top, box.height, window.innerHeight), release: holdScrollAnchoring() };
    }
    setMode(desired);
  }, [desired, mode]);

  // In the new layout, put the reader back at the same point of the story.
  useLayoutEffect(() => {
    const pending = anchor.current;
    anchor.current = null;
    const el = root.current;
    if (!pending) return;
    if (el) {
      const box = el.getBoundingClientRect();
      const dy = anchorCorrection(pending.at, box.top, box.height, window.innerHeight);
      if (Math.abs(dy) >= 1) scrollByNow(dy);
    }
    // Hand anchoring back to the browser once the corrected frame has painted.
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      pending.release();
    };
    const frame = requestAnimationFrame(() => requestAnimationFrame(release));
    return () => {
      cancelAnimationFrame(frame);
      release();
    };
  }, [mode]);

  if (mode === 'film' && Stage) {
    return (
      <div ref={root} className="relative" data-film-mode="film">
        <Stage
          captions={captions}
          transcripts={transcripts}
          posters={posters}
          labels={labels}
          numerals={numerals}
          nightShot={nightShot}
          sceneLabel={sceneLabel}
          skipTo={endId}
        />
        <div id={endId} tabIndex={-1} className="scroll-mt-24 outline-none" />
      </div>
    );
  }

  return (
    <div ref={root} className="relative" data-film-mode="static">
      <ol className="mx-auto max-w-7xl space-y-20 px-4 pb-8 sm:space-y-28 sm:px-6 lg:space-y-36 lg:px-8">
        {captions.map((caption, i) => {
          const flip = i % 2 === 1;
          const night = i === nightShot;
          const poster = (
            <>
              {/* A faint paper sheen behind the drawing (it fades with it when a 3D still takes over). */}
              {!night && <div className="absolute inset-0 bg-gradient-to-b from-raised/70 via-raised/20 to-transparent" />}
              {posters[i]}
            </>
          );
          return (
            <li key={labels[i]} className="grid items-center gap-8 sm:gap-10 lg:grid-cols-12 lg:gap-12">
              {/* No fill of its own (a 3D still draws behind the page); the dusk
                  panel brings its own night, which the 3D stage takes over. */}
              <div
                {...(night ? { 'data-night': '', 'data-scene-night': '' } : {})}
                className={cn(
                  'relative aspect-[5/4] overflow-hidden border border-fg/10 sm:aspect-[16/11] lg:row-start-1',
                  // The dusk pane is square-cornered, a print in a hairline frame:
                  // the stage paints its night sky and field as a rectangle.
                  night ? 'bg-canvas' : 'rounded-pane',
                  flip ? 'lg:col-span-7 lg:col-start-6' : 'lg:col-span-7 lg:col-start-1'
                )}
              >
                {Still ? <Still shot={i} poster={poster} /> : poster}
              </div>
              <div
                className={cn(
                  'lg:row-start-1',
                  flip ? 'lg:col-span-5 lg:col-start-1' : 'lg:col-span-5 lg:col-start-8 lg:pl-4'
                )}
              >
                {caption}
              </div>
            </li>
          );
        })}
      </ol>
      <div id={endId} tabIndex={-1} className="scroll-mt-24 outline-none" />
    </div>
  );
}
