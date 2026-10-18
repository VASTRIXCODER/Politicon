import Link from 'next/link';
import { useId } from 'react';
import { MARK_PATHS, MARK_PATHS_SMALL, MARK_VIEWBOX, WORDMARK } from '@/lib/brand/mark';
import { cn } from '@/lib/utils';

interface LogoProps {
  /** 'full' = mark + wordmark, 'mark' = the mark only, 'wordmark' = text only. */
  variant?: 'full' | 'mark' | 'wordmark';
  size?: 'sm' | 'md' | 'lg';
  /** Wraps the logo in a link (default '/'). Pass null for a plain, non-link logo. */
  href?: string | null;
  className?: string;
}

// 32px and below draw the small mark (lib/brand/mark.ts): the iris's fine
// gaps would vanish under a pixel.
const sizes = {
  sm: { mark: 'h-6 w-6', detail: 'small', text: 'text-base', gap: 'gap-1.5' },
  md: { mark: 'h-7 w-7', detail: 'small', text: 'text-lg', gap: 'gap-2' },
  lg: { mark: 'h-9 w-9', detail: 'full', text: 'text-2xl', gap: 'gap-2.5' },
} as const;

/**
 * The Aperture Dome mark, decorative (the caller names it). It takes its
 * colour from `currentColor` (violet by default), adds a rim light from the
 * top left, and fills the iris opening with light. Without color-mix() the
 * gradients fall back to flat currentColor and a white lens. `detail="small"`
 * draws the simplified mark, for 32px and below.
 */
export function LogoMark({ className, detail = 'full' }: { className?: string; detail?: 'full' | 'small' }) {
  // Gradient ids must be unique per instance: a gradient defined inside a
  // hidden copy of the logo (the closed mobile menu) would not paint others.
  const id = useId();
  const shell = `${id}shell`;
  const light = `${id}light`;
  const paths = detail === 'small' ? MARK_PATHS_SMALL : MARK_PATHS;
  return (
    <svg viewBox={MARK_VIEWBOX} aria-hidden="true" focusable="false" className={cn('flex-shrink-0 text-primary', className)}>
      <defs>
        <linearGradient id={shell} x1="0.15" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="currentColor" style={{ stopColor: 'color-mix(in srgb, currentColor 60%, white)' }} />
          <stop offset="0.55" stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" style={{ stopColor: 'color-mix(in srgb, currentColor 85%, #15121F)' }} />
        </linearGradient>
        <radialGradient id={light} cx="0.42" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FFFFFF" style={{ stopColor: 'color-mix(in srgb, currentColor 32%, white)' }} />
        </radialGradient>
      </defs>
      {/* The lens opens a little on hover of a linked logo. */}
      <path
        d={paths.aperture}
        fill={`url(#${light})`}
        className="origin-center transition-transform duration-500 ease-civic [transform-box:fill-box] group-hover:scale-110 motion-reduce:transition-none"
      />
      {/* evenodd: the small mark's dome has its aperture knocked out. */}
      <path d={paths.dome + paths.base} fill={`url(#${shell})`} fillRule="evenodd" />
    </svg>
  );
}

/** The Politicon logo: the Aperture Dome mark plus the Fraunces wordmark. */
export default function Logo({ variant = 'full', size = 'md', href = '/', className }: LogoProps) {
  const s = sizes[size];

  const mark = variant !== 'wordmark' && <LogoMark className={s.mark} detail={s.detail} />;

  const wordmark = variant !== 'mark' && (
    <span className={cn('font-display font-semibold leading-none tracking-[-0.02em] text-ink', s.text)}>{WORDMARK}</span>
  );

  const classes = cn('inline-flex items-center', s.gap, className);

  if (href) {
    return (
      <Link href={href} aria-label={variant === 'mark' ? 'Politicon home' : undefined} className={cn('group rounded-lg', classes)}>
        {mark}
        {wordmark}
      </Link>
    );
  }

  if (variant === 'mark') {
    return (
      <span role="img" aria-label="Politicon" className={classes}>
        {mark}
      </span>
    );
  }

  return (
    <span className={classes}>
      {mark}
      {wordmark}
    </span>
  );
}
