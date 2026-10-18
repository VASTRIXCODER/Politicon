import { MARK_PATHS_SMALL, MARK_VIEWBOX } from '@/lib/brand/mark';
import { cn } from '@/lib/utils';

/**
 * The official record's seal on the policy page mockup: the Aperture Dome
 * inside a ring of ticks, struck in archive gold (the one place gold may
 * appear: it marks the official record). By day the same line work sits a
 * hair lower in white, so the seal reads as pressed into the paper.
 * Decorative; its colour comes from `text-gold` on the svg.
 */
export default function RecordSeal({ className }: { className?: string }) {
  const art = (
    <>
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* 48 ticks, one every 7.5 degrees. */}
      <circle cx="32" cy="32" r="26.5" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="0.9 2.57" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <svg x="14" y="13" width="36" height="36" viewBox={MARK_VIEWBOX}>
        <path d={MARK_PATHS_SMALL.dome + MARK_PATHS_SMALL.base} fill="currentColor" fillRule="evenodd" />
      </svg>
    </>
  );
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={cn('text-gold', className)}>
      <g transform="translate(0 0.9)" className="text-white opacity-70 dark:hidden">
        {art}
      </g>
      <g>{art}</g>
    </svg>
  );
}
