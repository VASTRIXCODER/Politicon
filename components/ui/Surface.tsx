import type { ComponentPropsWithRef, ReactNode } from 'react';
import Spotlight from '@/components/ui/Spotlight';
import { cn } from '@/lib/utils';

export type SurfaceVariant = 'paper' | 'glass' | 'night' | 'outline';
export type SurfacePad = 'none' | 'sm' | 'md' | 'lg';
export type SurfaceRadius = 'tile' | 'pane' | 'xl';

export interface SurfaceProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  as?: 'div' | 'section' | 'article' | 'aside' | 'li';
  /**
   * paper (default): a solid porcelain pane, for content, numbers and charts.
   * glass: frosted and rim-lit, for controls and toolbars only (never behind numbers).
   * night: a deep-violet "Chamber" pane; tokens flip to night inside it.
   * outline: a hairline frame with no fill.
   */
  variant?: SurfaceVariant;
  /** Padding step (default md). */
  pad?: SurfacePad;
  /** Corner radius on the design scale (default pane). A rounded-* class in className still wins. */
  radius?: SurfaceRadius;
  /** Hover lift, violet rim and a cursor spotlight. Only for panes that are clickable as a whole. */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
}

const variants: Record<SurfaceVariant, string> = {
  // shadow-pane is theme-aware: a soft ink shadow by day, a deep drop by night.
  paper: 'bg-surface border border-fg/8 shadow-pane',
  glass: 'glass',
  night: cn(
    'bg-surface text-ink border border-fg/10',
    // Aurora light falling from the top edge.
    'bg-[radial-gradient(120%_70%_at_50%_0%,rgb(var(--c-violet)/0.18),transparent_65%)]',
    'shadow-[inset_0_1px_0_rgb(var(--c-fg)/0.06),0_24px_56px_-24px_rgb(0_0_0/0.7)]'
  ),
  outline: 'border border-fg/12',
};

const pads: Record<SurfacePad, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

const radii: Record<SurfaceRadius, string> = {
  tile: 'rounded-tile',
  pane: 'rounded-pane',
  xl: 'rounded-[2rem]',
};

// A thin rim of violet light along the top edge (glass and night panes).
const RIM =
  'before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/40 before:to-transparent';

const INTERACTIVE = cn(
  'isolate transition-[border-color,box-shadow,background-color,translate] duration-300 ease-civic',
  'focus-within:border-primary/40',
  '[@media(hover:hover)]:hover:border-primary/30 [@media(hover:hover)]:hover:shadow-lift',
  // `translate`, not `transform`, so it composes with Motion's inline transform.
  'motion-safe:[@media(hover:hover)]:hover:[translate:0_-2px]'
);

/**
 * The design system's pane. One component for every card, panel and frame,
 * with a fixed scale of padding and radii. Server-safe: only the optional
 * spotlight is a client island.
 *
 *   <Surface>…</Surface>                            solid paper pane
 *   <Surface variant="glass" pad="sm">…</Surface>   a toolbar
 *   <Surface variant="night" as="section">…</Surface> a Chamber moment on a light page
 */
export default function Surface({
  as: Tag = 'div',
  variant = 'paper',
  pad = 'md',
  radius = 'pane',
  interactive = false,
  className,
  children,
  ...props
}: SurfaceProps) {
  const Element = Tag as 'div';
  return (
    <Element
      {...props}
      data-night={variant === 'night' ? '' : undefined}
      className={cn(
        'relative',
        variants[variant],
        (variant === 'glass' || variant === 'night') && RIM,
        pads[pad],
        radii[radius],
        interactive && INTERACTIVE,
        className
      )}
    >
      {interactive && <Spotlight />}
      {children}
    </Element>
  );
}
