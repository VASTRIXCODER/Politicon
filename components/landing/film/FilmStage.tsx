'use client';

import { useCallback, useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react';
import SceneView from '@/components/three/SceneView';
import LandingFilm from '@/components/three/scenes/LandingFilm.lazy';
import { getLenis, onLenisChange } from '@/components/providers/LenisProvider';
import { FILM_SHOTS, filmStore, useFilmScene, useFilmStore } from '@/lib/three/filmStore';
import { playCue } from '@/lib/sound';
import { cn } from '@/lib/utils';
import BillRecord from './BillRecord';
import { duskProgress, scrollTopForProgress, shotRestProgress, snapTarget, trackProgress } from './filmMath';
import styles from './film.module.css';

/*
 * The landing film, pinned: a track five screens tall with a sticky stage
 * inside it. As the page scrolls through the track, the film's progress
 * (0 → 1) goes to filmStore, where the 3D scene reads it every frame
 * (components/three/scenes/LandingFilm), and the caption for the current
 * shot cross-fades in over a paper scrim. The rail jumps to any shot.
 *
 * Screen readers get every step, not only the one on screen: the captions
 * are a list of five, where the current step is its visible caption and
 * each of the others is the same step as text (FilmTranscript; the hidden
 * captions themselves are aria-hidden and inert). The rail comes first in
 * the reading order, and jumping with it from the keyboard moves focus to
 * the step it lands on.
 *
 * Loaded on demand by FilmPlayer, only where motion is allowed and the 3D
 * stage can run, so none of this is in the page's first load. Pinning is
 * CSS (position: sticky) and progress is one measurement per scroll event,
 * written before the stage renders that frame: no scroll library or
 * ScrollTrigger to keep in step with Lenis.
 */

export interface FilmStageProps {
  /** One server-rendered caption per shot. */
  captions: ReactNode[];
  /** The same steps as text, read in place of the captions not on screen. */
  transcripts: ReactNode[];
  /** One still per shot, shown until the 3D scene draws. */
  posters: ReactNode[];
  /** Short rail labels. */
  labels: string[];
  /** The rail's numerals ("01" …). */
  numerals: string[];
  /** The shot that dips into night (dusk), or -1. */
  nightShot: number;
  /** What the film shows, for screen readers. */
  sceneLabel: string;
  /** The element right after the film, for "Skip the film". */
  skipTo: string;
}

const DESKTOP_SNAP = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';
/**
 * How long a rail jump may take to land before it stops waiting to move
 * focus. Generous, since a slow device can take seconds to scroll five
 * screens; the wait also ends as soon as the reader does anything else
 * (scrolls, touches, clicks or presses a key), so focus never jumps later.
 */
const FOCUS_WAIT_MS = 10_000;
/** Input that means the reader has moved on from a rail jump. */
const LET_GO = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
/** How long the scroll must be still before a gentle snap to the nearest shot. */
const SNAP_IDLE_MS = 180;

/** Writes the film's progress for every scroll and resize while mounted. */
function useFilmTracking(track: RefObject<HTMLDivElement | null>, stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const trackEl = track.current;
    const stageEl = stage.current;
    if (!trackEl || !stageEl) return;
    let stageHeight = stageEl.offsetHeight;

    // In the scroll event itself (not a later frame), so the store is current
    // when the stage renders the frame this scroll asked for.
    const update = () => {
      const rect = trackEl.getBoundingClientRect();
      const progress = trackProgress(rect.top, rect.height, stageHeight);
      filmStore.set({ progress, active: rect.bottom > 0 && rect.top < window.innerHeight });
      stageEl.style.setProperty('--film-progress', progress.toFixed(4));
    };
    const remeasure = () => {
      stageHeight = stageEl.offsetHeight;
      update();
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', remeasure, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);
    resize?.observe(trackEl);
    update();
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', remeasure);
      resize?.disconnect();
      filmStore.reset();
    };
  }, [track, stage]);
}

/** The scroll position (px) at which the film rests on `shot`. */
function shotScrollTop(trackEl: HTMLElement, stageEl: HTMLElement, shot: number) {
  const rect = trackEl.getBoundingClientRect();
  return scrollTopForProgress(shotRestProgress(shot), rect.top + window.scrollY, rect.height, stageEl.offsetHeight);
}

/**
 * Desktop with a mouse and smooth scrolling: once the scroll settles a short
 * way from a shot's resting point, ease the rest of the way there. Never on
 * touch screens, and never far (a fraction of one shot's length).
 */
function useGentleSnap(track: RefObject<HTMLDivElement | null>, stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const trackEl = track.current;
    const stageEl = stage.current;
    if (!trackEl || !stageEl || typeof window.matchMedia !== 'function') return;
    const desktop = window.matchMedia(DESKTOP_SNAP);
    let timer = 0;

    const settle = () => {
      const lenis = getLenis();
      if (!lenis || lenis.isScrolling || !desktop.matches) return;
      const rect = trackEl.getBoundingClientRect();
      const stageHeight = stageEl.offsetHeight;
      const progress = trackProgress(rect.top, rect.height, stageHeight);
      if (progress <= 0 || progress >= 1) return;
      const target = snapTarget(progress, rect.height - stageHeight);
      if (target === null) return;
      lenis.scrollTo(scrollTopForProgress(target, rect.top + window.scrollY, rect.height, stageHeight), { duration: 0.7 });
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, SNAP_IDLE_MS);
    };

    // Only while Lenis runs the scroll (it is created after the page's own effects).
    let detach: (() => void) | null = null;
    const stop = onLenisChange((lenis) => {
      detach?.();
      detach = null;
      if (!lenis) return;
      window.addEventListener('scroll', onScroll, { passive: true });
      detach = () => window.removeEventListener('scroll', onScroll);
    });
    return () => {
      stop();
      detach?.();
      window.clearTimeout(timer);
    };
  }, [track, stage]);
}

/** A soft tick as each new shot comes in (only if the visitor turned sound on). */
function useShotCue(shot: number) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    playCue('tick');
  }, [shot]);
}

function Rail({
  labels,
  numerals,
  shot,
  onJump,
}: {
  labels: string[];
  numerals: string[];
  shot: number;
  onJump: (shot: number, fromKeyboard: boolean) => void;
}) {
  return (
    <nav
      aria-label="Jump to a step"
      className={cn(
        // Phones: a row of segments above the caption. Desktops: a column on the right.
        'absolute inset-x-4 top-20 sm:inset-x-6',
        'lg:inset-x-auto lg:right-[max(1.5rem,calc((100vw-80rem)/2+2rem))] lg:top-1/2 lg:-translate-y-1/2'
      )}
    >
      <ol className="glass flex gap-1 rounded-full px-2 py-1.5 lg:flex-col lg:gap-0 lg:rounded-pane lg:px-2 lg:py-3">
        {labels.map((label, i) => {
          const current = i === shot;
          return (
            <li key={label} className="flex-1 lg:flex-none">
              <button
                type="button"
                // A click with no pointer (detail 0) came from the keyboard.
                onClick={(e: MouseEvent<HTMLButtonElement>) => onJump(i, e.detail === 0)}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'group flex h-8 w-full items-center justify-center gap-2.5 rounded-full px-1.5 font-mono-data text-meta transition-colors duration-200 ease-civic',
                  'lg:h-11 lg:justify-start lg:rounded-tile lg:px-3',
                  current ? 'text-ink' : 'text-muted hover:text-ink'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(styles.segment, 'h-1 w-full lg:h-6 lg:w-[3px]')}
                  style={{ '--i': i } as CSSProperties}
                >
                  <span className={styles.fill} />
                </span>
                <span aria-hidden="true" className="hidden lg:inline">{numerals[i]}</span>
                <span className="sr-only lg:not-sr-only lg:whitespace-nowrap lg:font-body lg:text-sm">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function FilmStage({ captions, transcripts, posters, labels, numerals, nightShot, sceneLabel, skipTo }: FilmStageProps) {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const record = useRef<HTMLDivElement>(null);
  const shot = useFilmStore((s) => s.shot);
  // Night comes in part-way into the dusk shot, with the scene's own dusk:
  // where the playing scene is (it trails a fast scroll a little), or the
  // scroll itself while no scene plays.
  const nightAt = duskProgress(nightShot);
  const scrolledDusk = useFilmStore((s) => s.progress >= nightAt);
  const sceneDusk = useFilmScene((p) => (p === null ? null : p >= nightAt));
  const dusk = sceneDusk ?? scrolledDusk;
  // A step the rail is taking the reader to, to focus once its caption is up.
  const pendingFocus = useRef<{ shot: number; timer: number } | null>(null);

  useFilmTracking(track, stage);
  useGentleSnap(track, stage);
  useShotCue(shot);

  /** Focuses a step's caption (its title is read out); false while it isn't up yet. */
  const focusStep = useCallback((i: number) => {
    const article = stage.current?.querySelector<HTMLElement>(`[data-film-step="${i}"] article`);
    if (!article || article.closest('[inert]')) return false;
    article.tabIndex = -1;
    article.focus({ preventScroll: true });
    return true;
  }, []);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || pending.shot !== shot || !focusStep(shot)) return;
    window.clearTimeout(pending.timer);
    pendingFocus.current = null;
  }, [shot, focusStep]);

  // Any other input while a jump is under way lets go of its focus move.
  useEffect(() => {
    const letGo = () => {
      const pending = pendingFocus.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pendingFocus.current = null;
    };
    for (const type of LET_GO) window.addEventListener(type, letGo, { passive: true, capture: true });
    return () => {
      for (const type of LET_GO) window.removeEventListener(type, letGo, { capture: true });
      window.clearTimeout(pendingFocus.current?.timer);
    };
  }, []);

  const jump = (target: number, fromKeyboard: boolean) => {
    const trackEl = track.current;
    const stageEl = stage.current;
    if (!trackEl || !stageEl) return;
    const top = shotScrollTop(trackEl, stageEl, target);
    playCue('whoosh');
    window.clearTimeout(pendingFocus.current?.timer);
    pendingFocus.current = null;
    // From the keyboard, focus follows to the step (a mouse keeps it on the rail).
    if (fromKeyboard && !(filmStore.get().shot === target && focusStep(target))) {
      const timer = window.setTimeout(() => {
        pendingFocus.current = null;
      }, FOCUS_WAIT_MS);
      pendingFocus.current = { shot: target, timer };
    }
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(top, { duration: 1.2 });
    else window.scrollTo({ top, behavior: 'smooth' });
  };

  const night = dusk ? { 'data-night': '' } : {};

  return (
    <>
      <a
        href={`#${skipTo}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-overlay focus:rounded-full focus:bg-raised focus:px-4 focus:py-2 focus:text-sm focus:text-ink focus:shadow-pane"
      >
        Skip the film
      </a>
      <div ref={track} className={styles.track} style={{ '--film-shots': FILM_SHOTS } as CSSProperties}>
        <div ref={stage} className={styles.stage} {...(dusk ? { 'data-dusk': '' } : {})}>
          <SceneView
            className="absolute inset-0"
            label={sceneLabel}
            poster={
              <div className="absolute inset-0">
                {posters.map((poster, i) => (
                  <div key={i} className={styles.poster} data-state={i === shot ? 'active' : 'idle'}>
                    {poster}
                  </div>
                ))}
              </div>
            }
          >
            <LandingFilm quality="full" record={record} />
          </SceneView>
          {/* The bill's official record, pinned to the glass sheet by the scene while it rests. */}
          <BillRecord ref={record} />

          {/* Paper light behind the captions, and its night twin for the dusk shot. */}
          <div aria-hidden="true" className={styles.scrim} />
          <div aria-hidden="true" data-night="" className={cn(styles.scrim, styles.scrimNight)} />

          <div className={styles.overlay} {...night}>
            <Rail labels={labels} numerals={numerals} shot={shot} onJump={jump} />
            <div className="mx-auto flex h-full max-w-7xl items-end px-4 pb-8 sm:px-6 sm:pb-12 lg:items-center lg:px-8 lg:pb-0">
              <ol aria-label="How it works, in five steps" className={cn(styles.slot, 'w-full lg:w-[min(32rem,44%)]')}>
                {captions.map((caption, i) => {
                  const current = i === shot;
                  const state = current ? 'active' : i < shot ? 'before' : 'after';
                  return (
                    <li key={i} className={styles.step} data-film-step={i}>
                      <div className={styles.caption} data-state={state} aria-hidden={!current || undefined} inert={!current}>
                        {caption}
                      </div>
                      {/* The steps not on screen, as text in their place. */}
                      {!current && <div className="sr-only">{transcripts[i]}</div>}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </div>
      {/* Dusk back into paper; the navigation bar stays night over its darker half. */}
      <div aria-hidden="true" data-nav-night="0.5" className={styles.exit}>
        <div data-night="" className={styles.exitNight} />
      </div>
    </>
  );
}
