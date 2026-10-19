import { useId } from 'react';
import type { HouseholdModel } from '@/lib/household';
import { cn } from '@/lib/utils';
import { householdArt } from './householdArt';
import styles from './householdPoster.module.css';

/*
 * A household diorama as a server-rendered drawing: the poster behind its 3D
 * scene (HouseholdScene), shown until the scene draws and whenever 3D is off.
 * The model is projected through the scene's own camera (householdArt.ts),
 * so the two line up in a box of the same `aspect`. Decorative: the caption
 * or the box's label says what it shows.
 *
 *   <HouseholdPoster model={model} />                 the onboarding diorama (5:4)
 *   <HouseholdPoster model={model} aspect={4 / 3} close />  …close on the household (the phone's band)
 *   <HouseholdPoster model={model} compact />         the avatar (square)
 *
 * `lastAdded` lifts the newest piece in with a ring of light under it (CSS,
 * so it holds still under reduced motion and "Pause motion"); `lit` brings
 * up the lamplight in the windows.
 */

export interface HouseholdPosterProps {
  model: HouseholdModel;
  /** The avatar's framing (square, from a little higher). */
  compact?: boolean;
  /** Width / height of the box it fills (default 5:4, or 1 when compact). */
  aspect?: number;
  /** Frame the household itself, the plinth running out of the box (the phone's band; the 3D scene's `close`). */
  close?: boolean;
  /** The newest piece (dioramaLayout.ts newestPiece): it rises in. */
  lastAdded?: string | null;
  /** Lamplight in the windows (the finished household). */
  lit?: boolean;
  /** Changes land at once, without their transitions (reduced or paused motion). */
  instant?: boolean;
  className?: string;
}

export const POSTER_ASPECT = 5 / 4;

export default function HouseholdPoster({ model, compact = false, aspect, close = false, lastAdded = null, lit = false, instant = false, className }: HouseholdPosterProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const art = householdArt(model, compact ? 'avatar' : 'build', aspect ?? (compact ? 1 : POSTER_ASPECT), lastAdded, close && !compact);
  const url = (name: string) => `url(#${uid}-${name})`;

  return (
    <svg
      viewBox={`0 0 ${art.width} ${art.height}`}
      aria-hidden="true"
      focusable="false"
      data-decorative=""
      className={cn(styles.art, lit && styles.lit, instant && styles.instant, 'h-full w-full', className)}
    >
      <defs>
        <radialGradient id={`${uid}-halo`}>
          <stop offset="0" className={styles.stopHalo} />
          <stop offset="0.55" className={styles.stopHaloMid} />
          <stop offset="1" className={styles.stopHaloEdge} />
        </radialGradient>
        <radialGradient id={`${uid}-shadow`}>
          <stop offset="0" className={styles.stopShadow} />
          <stop offset="1" className={styles.stopShadowEdge} />
        </radialGradient>
        <linearGradient id={`${uid}-drum`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={styles.stopDrumTop} />
          <stop offset="1" className={styles.stopDrumBottom} />
        </linearGradient>
      </defs>

      <ellipse {...art.halo} fill={url('halo')} />
      <ellipse {...art.plinth.shadow} fill={url('shadow')} />
      {art.plinth.side && <path d={art.plinth.side} fill={url('drum')} />}
      <path d={art.plinth.top} className={styles.plinthTop} />
      <path d={art.plinth.ring} className={styles.inlay} />
      {art.pulse && <ellipse key={lastAdded} {...art.pulse} className={styles.pulse} />}

      {art.pieces.map((piece) => (
        <g key={piece.id} className={piece.id === lastAdded ? styles.rise : undefined}>
          {piece.shapes.map((shape, i) =>
            shape.tone === 'shadow' ? (
              <path key={i} d={shape.d} fill={url('shadow')} className={styles.flat} />
            ) : (
              <path key={i} d={shape.d} className={styles[shape.tone]} />
            )
          )}
        </g>
      ))}
    </svg>
  );
}
