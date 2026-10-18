'use client';

import { useEffect, useState, type CSSProperties } from 'react';
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
 * debt, their state on a plate set into the plinth), and a caption under it
 * says the same in words, announced politely once the answers settle.
 *
 * One box for every screen: a wide band above the form on a phone, a large
 * 5:4 view in its own column from lg up. The 3D scene (HouseholdScene)
 * renders into it on devices that run 3D; the poster (the same drawing,
 * server-renderable) stands in everywhere else, and both follow the same
 * model. With `reveal` (the last question) the camera pulls back and the
 * windows light up; it never holds anything up, and can be skipped.
 */

/** The phone band's shape (the panel is POSTER_ASPECT, 5:4). */
const BAND_ASPECT = 2.4;
/** How long the caption waits for answers to settle before it speaks. */
const CAPTION_SETTLE_MS = 700;
/** How long the reveal plays (the scene's REVEAL_SECONDS, with a margin). */
const REVEAL_MS = 2800;

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

export default function HouseholdStage({ model, reveal, className }: HouseholdStageProps) {
  // The newest piece, from the model before this one (derived during render, as React recommends for previous values).
  const [seen, setSeen] = useState<{ model: HouseholdModel; last: string | null }>({ model, last: null });
  if (seen.model !== model) setSeen({ model, last: newestPiece(seen.model, model) });
  const lastAdded = seen.last;

  const still = useLessMotion();
  const [skipped, setSkipped] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!reveal) {
      setSkipped(false);
      setPlaying(false);
      return;
    }
    if (still) return;
    setPlaying(true);
    const id = window.setTimeout(() => setPlaying(false), REVEAL_MS);
    return () => window.clearTimeout(id);
  }, [reveal, still]);

  const caption = useSettled(describeHousehold(model), CAPTION_SETTLE_MS);
  const instant = skipped || still;

  const poster = (
    <>
      <HouseholdPoster model={model} aspect={BAND_ASPECT} lastAdded={lastAdded} lit={reveal} instant={instant} className="lg:hidden" />
      <HouseholdPoster model={model} aspect={POSTER_ASPECT} lastAdded={lastAdded} lit={reveal} instant={instant} className="hidden lg:block" />
    </>
  );

  return (
    <div className={cn('relative rounded-pane border border-fg/8 p-3 sm:p-4 lg:rounded-[1.75rem] lg:p-6', className)}>
      <div className="flex min-h-6 items-center justify-between gap-3 px-1">
        <p aria-hidden="true" className="font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-muted">
          Your household
        </p>
        {playing && !skipped && (
          <button
            type="button"
            onClick={() => setSkipped(true)}
            className="-my-1 -mr-2 min-h-6 rounded-md px-2 py-1 text-meta font-medium text-primary-300 underline-offset-4 hover:text-ink hover:underline"
          >
            Skip animation
          </button>
        )}
      </div>

      <div
        data-household-stage=""
        className="relative mt-2 lg:mt-3"
        style={{ '--plaque-poster-x': `${PLAQUE_SPOT.x}%`, '--plaque-poster-y': `${PLAQUE_SPOT.y}%` } as CSSProperties}
      >
        <SceneView className="aspect-[12/5] w-full lg:aspect-[5/4]" poster={poster}>
          <HouseholdScene model={model} mode="build" lastAdded={lastAdded} reveal={reveal} skip={skipped} />
        </SceneView>
        {model.state && (
          // A plate set into the plinth's drum; the caption carries the words for screen readers.
          <span
            aria-hidden="true"
            data-decorative=""
            className={cn(
              styles.plaque,
              lastAdded === 'state' && styles.plaqueIn,
              'hidden font-mono-data text-meta font-medium uppercase tracking-[0.2em] lg:block'
            )}
          >
            {model.state}
          </span>
        )}
      </div>

      <div className="mt-3 px-1 lg:mt-5">
        <p aria-live="polite" className="text-sm leading-relaxed text-ink [text-wrap:pretty] lg:text-base">
          {caption}
        </p>
        <p className="mt-1 hidden text-meta text-muted sm:block">Drawn only from your answers, never your exact figures.</p>
      </div>
    </div>
  );
}
