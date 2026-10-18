import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'primary' | 'secondary' | 'gold' | 'example' | 'success' | 'danger' | 'warning';

interface BadgeProps {
  children: ReactNode;
  /**
   * default: neutral metadata. primary: violet. secondary: orchid, for
   * non-meaning highlights. gold: the official record only (Congress.gov /
   * Open States provenance, seals). example: "Example" / "Illustrative"
   * labels, a dashed outline that reads as "not real", never as the record.
   * success: a gain. danger: errors only, never a cost. warning: caution notes.
   */
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

// Token tints with the AA text variant of each colour (checked on surface and canvas).
const variants: Record<BadgeVariant, string> = {
  default: 'bg-fg/5 border-fg/10 text-muted',
  primary: 'bg-primary/10 border-primary/20 text-primary-300',
  secondary: 'bg-accent/10 border-accent/20 text-accent',
  gold: 'bg-gold/10 border-gold/25 text-gold',
  example: 'border-dashed border-fg/30 bg-transparent text-muted',
  success: 'bg-gain-fill/10 border-gain/20 text-gain',
  danger: 'bg-danger/10 border-danger/20 text-danger',
  warning: 'bg-caution/10 border-caution/25 text-caution',
};

const sizes = {
  sm: 'px-2 py-0.5 text-meta',
  md: 'px-3 py-1 text-xs',
};

/** A small label pill: categories, bill numbers, "Example", "Coming soon". */
export default function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-mono-data font-medium tracking-wide',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}
