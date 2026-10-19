import { useId } from 'react';
import { MARK_PATHS_SMALL, MARK_VIEWBOX } from '@/lib/brand/mark';
import { cn } from '@/lib/utils';

/*
 * The receipt's stamp: a violet rubber-stamp seal, "Estimates · not advice",
 * pressed at a slant, the Aperture Dome at its heart, with a little of the
 * paper showing through the ink. Violet, never archive gold: gold marks
 * only the official record, and this is our estimate. Decorative (the
 * receipt says the same words in its small print).
 */

const R = 42.5;
const CIRCLE = 2 * Math.PI * R;

export default function ReceiptSeal({ className }: { className?: string }) {
  const id = useId();
  const ring = `${id}ring`;
  const ink = `${id}ink`;
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" data-decorative="" focusable="false" className={cn('text-primary-300', className)}>
      <defs>
        {/* Starts at the left and runs clockwise over the top. */}
        <path id={ring} d={`M ${60 - R} 60 A ${R} ${R} 0 1 1 ${60 + R} 60 A ${R} ${R} 0 1 1 ${60 - R} 60`} />
        <filter id={ink} x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="7" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.5 0 0 0 1.55" result="speckle" />
          <feComposite in="SourceGraphic" in2="speckle" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${ink})`} fill="none" stroke="currentColor" opacity={0.9}>
        <circle cx="60" cy="60" r="56" strokeWidth="2.6" />
        <circle cx="60" cy="60" r="51" strokeWidth="0.9" />
        <circle cx="60" cy="60" r="33.5" strokeWidth="0.9" />
        <text
          fill="currentColor"
          stroke="none"
          className="font-mono-data"
          style={{ fontSize: 8.4, fontWeight: 600, letterSpacing: '0.08em' }}
        >
          <textPath href={`#${ring}`} startOffset="0" textLength={CIRCLE * 0.985} lengthAdjust="spacing">
            ESTIMATES · NOT ADVICE · POLITICON ·
          </textPath>
        </text>
        <svg x="42" y="40" width="36" height="36" viewBox={MARK_VIEWBOX}>
          <path d={MARK_PATHS_SMALL.dome + MARK_PATHS_SMALL.base} fill="currentColor" stroke="none" fillRule="evenodd" />
        </svg>
      </g>
    </svg>
  );
}
