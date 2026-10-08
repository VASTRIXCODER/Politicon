import Link from 'next/link';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  /** 'full' = mark + wordmark, 'mark' = icon tile only, 'wordmark' = text only. */
  variant?: 'full' | 'mark' | 'wordmark';
  size?: 'sm' | 'md' | 'lg';
  /** Wraps the logo in a link (default '/'). Pass null for a plain, non-link logo. */
  href?: string | null;
  className?: string;
}

const sizes = {
  sm: { tile: 'w-7 h-7 rounded-lg', icon: 'w-3.5 h-3.5', text: 'text-base' },
  md: { tile: 'w-8 h-8 rounded-lg', icon: 'w-4 h-4', text: 'text-lg' },
  lg: { tile: 'w-10 h-10 rounded-xl', icon: 'w-5 h-5', text: 'text-2xl' },
};

/** The Politicon brand mark: violet Zap tile plus "Politi·con" wordmark. */
export default function Logo({ variant = 'full', size = 'md', href = '/', className }: LogoProps) {
  const s = sizes[size];

  const mark = variant !== 'wordmark' && (
    <span
      aria-hidden="true"
      className={cn(
        'flex flex-shrink-0 items-center justify-center bg-primary/20 border border-primary/30 transition-colors group-hover:bg-primary/30',
        s.tile
      )}
    >
      <Zap className={cn(s.icon, 'text-primary')} />
    </span>
  );

  const wordmark = variant !== 'mark' && (
    <span className={cn('font-display font-semibold tracking-tight text-text-primary', s.text)}>
      Politi<span className="text-primary">con</span>
    </span>
  );

  const classes = cn('inline-flex items-center gap-2', className);

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
