'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Skeleton from '@/components/ui/Skeleton';
import styles from '@/components/onboarding/onboarding.module.css';
import { describeHousehold, type HouseholdModel } from '@/lib/household';
import { cn } from '@/lib/utils';

/*
 * The household beside the profile editor: the diorama the person built in
 * onboarding (HouseholdAvatar), redrawn from the answers on screen as they
 * change, before anything is saved, with the sentence under it that says
 * what it shows. Screen readers get the sentence, not the picture as well
 * (the drawing is hidden from them, so it isn't heard twice), and hear it
 * politely once the answers settle, as in onboarding
 * (components/onboarding/HouseholdStage).
 *
 * The frame has no fill: the 3D scene draws on the stage canvas behind the
 * page, so an opaque pane here would hide it.
 */

/** The avatar's width: 160px (md) above the form, 200px (lg) beside it. */
const AVATAR_BOX = 'w-40 xl:w-[12.5rem]';

// The drawing and its scene load after the page, keeping them off its first load.
const HouseholdAvatar = dynamic(() => import('@/components/avatar/HouseholdAvatar'), {
  ssr: false,
  loading: () => <Skeleton shape="circle" className={AVATAR_BOX} />,
});

/** How long the caption waits for the answers to settle before it changes (and speaks). */
const CAPTION_SETTLE_MS = 700;

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

export default function ProfileHousehold({ model, className }: { model: HouseholdModel; className?: string }) {
  const caption = useSettled(describeHousehold(model), CAPTION_SETTLE_MS);
  return (
    <div className={cn('rounded-pane border border-fg/10 p-5', className)}>
      <p aria-hidden="true" className="font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-muted">
        Live preview
      </p>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:gap-6 xl:flex-col xl:gap-4">
        <div aria-hidden="true" data-decorative="" className="flex-shrink-0">
          <HouseholdAvatar model={model} size="lg" className={AVATAR_BOX} />
        </div>
        <div className="w-full min-w-0 sm:flex-1 xl:flex-none">
          <p aria-live="polite" className="text-sm leading-relaxed text-ink [text-wrap:pretty]">
            {/* A new sentence rises in (CSS; still under reduced motion and "Pause motion"). */}
            <span key={caption} className={cn('block', styles.enter)}>{caption}</span>
          </p>
          <p className="mt-2 text-meta text-muted">Drawn only from your answers, never your exact figures.</p>
        </div>
      </div>
    </div>
  );
}
