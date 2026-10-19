'use client';

import { useId, useMemo, useState } from 'react';
import SceneView from '@/components/three/SceneView';
import Skyline from '@/components/three/scenes/Skyline.lazy';
import SegmentedControl from '@/components/ui/SegmentedControl';
import {
  SKYLINE_HORIZONS,
  describeSkyline,
  horizonWords,
  skylineLayout,
  skylineReach,
  skylineScaleNote,
  skylineTowers,
  type SkylineHorizon,
  type SkylineSource,
} from '@/lib/skyline';
import { cn } from '@/lib/utils';
import SkylinePoster from './SkylinePoster';
import SkylineReadout from './SkylineReadout';
import styles from './skyline.module.css';

/*
 * "The Skyline" beside the receipt on /impact: every analyzed policy as a
 * glass tower (the Skyline scene on the shared stage; its server-drawn
 * poster before and without 3D) in a small night vitrine, a horizon control
 * (1, 3 or 5 years: the analyses' own cumulative estimates, on one scale),
 * a legend and the scale in words, and the readout on a solid pane that
 * states every figure the model shows.
 *
 * `focus` is shared with the receipt: a line pointed at or focused there
 * lights its tower here, and a tower pointed at here marks its line there,
 * so the receipt is the keyboard and screen-reader way into the model.
 *
 * The page loads this with next/dynamic, off its first-load bundle (it only
 * renders once the user's analyses are in, in the browser).
 */

export interface SkylineSectionProps {
  /** The analyses, in the receipt's order (so tower n is line n). */
  rows: readonly SkylineSource[];
  focus?: string | null;
  onFocus?: (id: string | null) => void;
  /** The horizon shown first (default 5 years: the long view). */
  initialHorizon?: SkylineHorizon;
  className?: string;
}

const OPTIONS = SKYLINE_HORIZONS.map((h) => ({
  value: String(h) as `${SkylineHorizon}`,
  label: h === 1 ? '1 year' : `${h} years`,
}));

function Legend() {
  const key = 'inline-flex items-center gap-2';
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-meta text-muted">
      <li className={key}>
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-gain-fill" />
        Teal rises: could save you money
      </li>
      <li className={key}>
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-loss-fill" />
        Amber hangs below: could cost you
      </li>
      <li className={key}>
        <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-primary shadow-[0_0_6px_rgb(var(--c-glow)/0.8)]" />
        The street: $0
      </li>
      <li className={key}>
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-primary" />
        Empty lot: no projection yet
      </li>
    </ul>
  );
}

export default function SkylineSection({ rows, focus = null, onFocus, initialHorizon = 5, className }: SkylineSectionProps) {
  const titleId = useId();
  const [horizon, setHorizon] = useState<SkylineHorizon>(initialHorizon);
  const towers = useMemo(() => skylineTowers(rows, horizon), [rows, horizon]);
  const reach = useMemo(() => skylineReach(rows), [rows]);
  const layout = useMemo(() => skylineLayout(towers, reach), [towers, reach]);

  return (
    <section
      aria-labelledby={titleId}
      data-night=""
      data-scene-night=""
      className={cn(styles.vitrine, 'relative isolate overflow-hidden rounded-[2rem] bg-canvas px-4 pb-4 pt-5 text-ink sm:px-6 sm:pb-6 sm:pt-6', className)}
    >
      <div aria-hidden="true" data-decorative="" className={cn('pointer-events-none absolute inset-0 -z-10', styles.aurora)} />

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-primary-300">The skyline</p>
          <h2 id={titleId} className="mt-1.5 font-display text-2xl font-medium text-ink sm:text-3xl">
            How it adds up, <em>{horizonWords(horizon)}</em>
          </h2>
        </div>
        <SegmentedControl
          size="sm"
          label="Projection horizon"
          value={String(horizon) as `${SkylineHorizon}`}
          onValueChange={(v) => setHorizon(Number(v) as SkylineHorizon)}
          options={OPTIONS}
        />
      </div>

      <figure className="mt-4">
        <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
          <SceneView
            interactive
            className="absolute inset-0"
            label={describeSkyline(towers, horizon)}
            poster={<SkylinePoster towers={towers} reach={reach} focus={focus} />}
          >
            <Skyline towers={towers} horizon={horizon} reach={reach} focus={focus} onFocus={onFocus} />
          </SceneView>
        </div>
        <figcaption className="mt-3 space-y-2 px-1">
          <Legend />
          <p className="text-meta leading-relaxed text-muted">
            {skylineScaleNote(layout, horizon)} One tower per policy, in the receipt&apos;s order
            {layout.rows > 1 ? ', back row first' : ', left to right'}; point at or focus a receipt line to light its tower.
          </p>
        </figcaption>
      </figure>

      <SkylineReadout className="mt-4" towers={towers} horizon={horizon} focus={focus} />
    </section>
  );
}
