import { cn } from '@/lib/utils';

export interface SkeletonProps {
  /** Size and placement (h-4 w-32, aspect-video…). */
  className?: string;
  /** line: a text-height bar; block: a pane (default); circle: an avatar or icon. */
  shape?: 'line' | 'block' | 'circle';
}

const shapes = {
  line: 'h-3.5 rounded-full',
  block: 'rounded-tile',
  circle: 'aspect-square rounded-full',
};

/**
 * A placeholder shape with a slow sheen while content loads. Hidden from
 * assistive tech: the region that is loading should say so itself (an
 * aria-busy container, or an sr-only "Loading…" in a status region). The
 * sheen only moves when motion is allowed.
 */
export default function Skeleton({ className, shape = 'block' }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      data-decorative=""
      className={cn(
        'block bg-fg/6',
        // The sheen: paper-white by day, a faint light by night.
        'bg-[linear-gradient(100deg,transparent_35%,rgb(var(--c-raised)/0.65)_50%,transparent_65%)]',
        'dark:bg-[linear-gradient(100deg,transparent_35%,rgb(var(--c-fg)/0.07)_50%,transparent_65%)]',
        'bg-[length:250%_100%] bg-no-repeat',
        'motion-safe:animate-shimmer',
        shapes[shape],
        className
      )}
    />
  );
}

/** A paragraph of skeleton lines, the last one shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden="true" data-decorative="" className={cn('flex flex-col gap-2.5', className)}>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <Skeleton key={i} shape="line" className={i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full'} />
      ))}
    </span>
  );
}
