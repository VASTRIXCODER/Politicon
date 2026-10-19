'use client';

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import SceneView from '@/components/three/SceneView';
import HouseholdScene from '@/components/three/scenes/HouseholdScene.lazy';
import { newestPiece } from '@/components/three/kit/dioramaLayout';
import { describeHousehold, type HouseholdModel } from '@/lib/household';
import { useLessMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import HouseholdPoster, { POSTER_ASPECT } from './HouseholdPoster';
import { plaqueSpot } from './householdArt';
import styles from './onboarding.module.css';

/*
 * "Build your household": the diorama beside the onboarding questions. Each
 * answer the plinth can show adds its piece as the person goes (the building
 * for their housing, the grown-ups and dependents, an object per kind of
 * debt, their state on a plate set into the plinth), and a caption beside it
 * says the same in words, announced politely once the answers settle.
 *
 * Two shapes. Below lg, a compact band the page docks above the questions
 * (app/onboarding/page.tsx), so every piece lands in view: a small framed
 * 4:3 window close on the household, the caption beside it. From lg up, a
 * large 5:4 view of the whole plinth in its own column. The 3D scene
 * (HouseholdScene) renders into it on devices that run 3D; the poster (the
 * same drawing, server-renderable) stands in everywhere else, and both
 * follow the same model and framing. With `reveal` (the last question) the
 * camera pulls back and the windows light up. It lasts under three seconds,
 * never holds anything up, and is a still frame under reduced motion and
 * "Pause motion" (the toggle in the page's header).
 */

/** The phone band's window (the lg panel is POSTER_ASPECT, 5:4). */
const BAND_ASPECT = 4 / 3;
/** Below Tailwind's lg: the band, framed close on the household. */
const BAND_QUERY = '(max-width: 1023.98px)';
/** How long the caption waits for answers to settle before it speaks. */
const CAPTION_SETTLE_MS = 700;

const PLAQUE_SPOT = plaqueSpot(POSTER_ASPECT);

export interface HouseholdStageProps {
  model: HouseholdModel;
  /** The profile is complete: the finishing reveal. */
  reveal: boolean;
  className?: string;
}

/** `value`, once it has stopped changing for `ms` (the first value at once). */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const id = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(id);
  }, [value, settled, ms]);
  return settled;
}

const subscribeBand = (onChange: () => void) => {
  const mql = window.matchMedia(BAND_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

/** The page shows the phone band (the scene only renders in the browser, so the server's answer never reaches it). */
function useBand(): boolean {
  return useSyncExternalStore(subscribeBand, () => window.matchMedia(BAND_QUERY).matches, () => false);
}

export default function HouseholdStage({ model, reveal, className }: HouseholdStageProps) {
  // The newest piece, from the model before this one (derived during render, as React recommends for previous values).
  const [seen, setSeen] = useState<{ model: HouseholdModel; last: string | null }>({ model, last: null });
  if (seen.model !== model) setSeen({ model, last: newestPiece(seen.model, model) });
  const lastAdded = seen.last;

  const still = useLessMotion();
  const band = useBand();
  const caption = useSettled(describeHousehold(model), CAPTION_SETTLE_MS);

  const poster = (
    <>
      <HouseholdPoster model={model} aspect={BAND_ASPECT} close lastAdded={lastAdded} lit={reveal} instant={still} className="lg:hidden" />
      <HouseholdPoster model={model} aspect={POSTER_ASPECT} lastAdded={lastAdded} lit={reveal} instant={still} className="hidden lg:block" />
    </>
  );

  return (
    <div
      className={cn(
        // Phone band: the window on the left, the words beside it. lg: one column.
        'relative grid grid-cols-[minmax(0,48%)_minmax(0,1fr)] items-center gap-x-3 rounded-pane border border-fg/8 p-2 sm:grid-cols-[minmax(0,42%)_minmax(0,1fr)] sm:gap-x-5 sm:p-3',
        'lg:block lg:rounded-[1.75rem] lg:p-6',
        className
      )}
    >
      <p
        aria-hidden="true"
        className="col-start-2 row-start-1 self-end font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-muted lg:flex lg:min-h-6 lg:items-center lg:px-1"
      >
        Your household
      </p>

      <div
        data-household-stage=""
        className="relative col-start-1 row-span-2 row-start-1 lg:mt-3"
        style={{ '--plaque-poster-x': `${PLAQUE_SPOT.x}%`, '--plaque-poster-y': `${PLAQUE_SPOT.y}%` } as CSSProperties}
      >
        {/* The band's window clips the poster to its corners; the 3D scene is scissored to the same box. */}
        <SceneView className="aspect-[4/3] w-full overflow-hidden rounded-md lg:aspect-[5/4] lg:overflow-visible lg:rounded-none" poster={poster}>
          <HouseholdScene model={model} mode="build" lastAdded={lastAdded} reveal={reveal} close={band} />
        </SceneView>
        {/* The window's frame, so the plinth running out of it reads as a close-up, not a cut. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-fg/12 lg:hidden" />
        {model.state && (
          // A plate set into the plinth's drum (in the band, on the window's corner); the caption carries the words for screen readers.
          <span
            aria-hidden="true"
            data-decorative=""
            className={cn(styles.plaque, lastAdded === 'state' && styles.plaqueIn, 'font-mono-data text-meta font-medium uppercase')}
          >
            {model.state}
          </span>
        )}
      </div>

      <div className="col-start-2 row-start-2 self-start pt-1 lg:mt-5 lg:px-1 lg:pt-0">
        <p aria-live="polite" className="text-[0.8125rem] leading-[1.15rem] text-ink [text-wrap:pretty] sm:text-sm sm:leading-relaxed lg:text-base">
          {caption}
        </p>
        <p className="mt-1 hidden text-meta text-muted sm:block">Drawn only from your answers, never your exact figures.</p>
      </div>
    </div>
  );
}
