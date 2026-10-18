import { useId } from 'react';
import { MARK_PATHS, MARK_VIEWBOX } from '@/lib/brand/mark';
import { cn } from '@/lib/utils';

const SEAL_TEXT = 'NON-PARTISAN · EDUCATIONAL ESTIMATES · REAL BILLS · ';
// The seal's text runs on a circle of this radius; textLength fits it exactly once around.
const TEXT_RADIUS = 67;

/** One pass of the seal's line work (rings, ticks, text and the mark), in currentColor. */
function SealArt({ textPathId, ringClassName }: { textPathId: string; ringClassName?: string }) {
  return (
    <>
      <circle cx="100" cy="100" r="95" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {/* The lettered ring (and its ticks) can turn on its own: see `turning`. */}
      <g className={ringClassName}>
        {/* 72 ticks, one every 5 degrees. */}
        <circle cx="100" cy="100" r="87" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="1.1 6.49" />
        <text fill="currentColor" fontSize="9.5" fontWeight="600" letterSpacing="1.5" className="font-mono-data">
          <textPath href={`#${textPathId}`} textLength={Math.round(2 * Math.PI * TEXT_RADIUS) - 4} lengthAdjust="spacing">
            {SEAL_TEXT}
          </textPath>
        </text>
      </g>
      <circle cx="100" cy="100" r="79" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="100" cy="100" r="54" fill="none" stroke="currentColor" strokeWidth="1" />
      <svg x="62" y="62" width="76" height="76" viewBox={MARK_VIEWBOX}>
        <path d={MARK_PATHS.dome + MARK_PATHS.base} fill="currentColor" />
      </svg>
    </>
  );
}

/**
 * A round civic seal (the Aperture Dome inside rings of ticks and lettering),
 * pressed into the paper: violet line work with a lip of light below it by
 * day, a faint violet glow by night. Decorative.
 *
 *   tone="pressed"  blind-embossed into a pane (faint, the default)
 *   tone="lit"      drawn in light, for night bands and posters
 *
 * `ringClassName` goes on the lettered ring (rotate it about the seal's
 * centre with [transform-box:view-box] and origin-center).
 */
export default function CivicSeal({
  className,
  tone = 'pressed',
  ringClassName,
}: {
  className?: string;
  tone?: 'pressed' | 'lit';
  ringClassName?: string;
}) {
  const id = useId();
  const textPathId = `${id}seal-text`;
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      data-decorative=""
      focusable="false"
      className={cn('pointer-events-none select-none', className)}
    >
      <defs>
        <path
          id={textPathId}
          d={`M ${100 - TEXT_RADIUS} 100 a ${TEXT_RADIUS} ${TEXT_RADIUS} 0 1 1 ${TEXT_RADIUS * 2} 0 a ${TEXT_RADIUS} ${TEXT_RADIUS} 0 1 1 ${-TEXT_RADIUS * 2} 0`}
        />
      </defs>
      {tone === 'pressed' ? (
        <>
          {/* The emboss: the same line work in white, a pixel lower (day only). */}
          <g transform="translate(0 1.2)" className="text-white opacity-80 dark:hidden">
            <SealArt textPathId={textPathId} ringClassName={ringClassName} />
          </g>
          <g className="text-primary opacity-[0.16] dark:opacity-[0.22]">
            <SealArt textPathId={textPathId} ringClassName={ringClassName} />
          </g>
        </>
      ) : (
        <g className="text-violet-glow">
          <SealArt textPathId={textPathId} ringClassName={ringClassName} />
        </g>
      )}
    </svg>
  );
}
