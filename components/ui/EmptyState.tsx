import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import IconTile, { type IconTileTone } from '@/components/ui/IconTile';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  /** Icon tint (default violet). */
  tone?: IconTileTone;
  title: ReactNode;
  /** One or two sentences: why it's empty and what to do next. */
  body?: ReactNode;
  /** Usually a <Button>. */
  action?: ReactNode;
  /** Heading level for the title (default h2); use 'p' where a heading would break the outline. */
  titleAs?: 'h2' | 'h3' | 'p';
  /** Drawn as a dashed frame (default) or bare, inside a pane of its own. */
  framed?: boolean;
  className?: string;
}

/**
 * What a list or panel shows when there's nothing in it yet: an icon, a short
 * title, a sentence of help and the one action that fixes it.
 */
export default function EmptyState({
  icon,
  tone = 'violet',
  title,
  body,
  action,
  titleAs: Title = 'h2',
  framed = true,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 py-12 text-center sm:py-14',
        framed && 'rounded-pane border border-dashed border-fg/15 bg-surface/60',
        className
      )}
    >
      {icon && (
        <span className="relative mb-5">
          {/* A pool of violet light behind the tile. */}
          <span
            aria-hidden="true"
            data-decorative=""
            className="absolute -inset-4 rounded-full bg-[radial-gradient(closest-side,rgb(var(--c-glow)/0.22),transparent)]"
          />
          <IconTile icon={icon} tone={tone} size="lg" className="relative" />
        </span>
      )}
      <Title className="font-display text-xl font-medium text-ink sm:text-2xl">{title}</Title>
      {body && <div className="mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</div>}
      {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  );
}
