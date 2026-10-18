import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type IconTileTone = 'violet' | 'gain' | 'loss' | 'gold' | 'neutral' | 'danger';
export type IconTileSize = 'sm' | 'md' | 'lg';

export interface IconTileProps {
  icon: LucideIcon;
  /**
   * violet (default) for features and actions, gain/loss only next to money
   * that moves that way, gold only for official-record items, danger only for
   * errors and destructive actions (never a cost), neutral for the rest.
   */
  tone?: IconTileTone;
  size?: IconTileSize;
  className?: string;
}

// Tint, hairline and an AA icon colour per tone (the text variants of each token).
const tones: Record<IconTileTone, string> = {
  violet: 'bg-primary/10 border-primary/20 text-primary-300',
  gain: 'bg-gain-fill/12 border-gain/20 text-gain',
  loss: 'bg-loss-fill/12 border-loss/20 text-loss',
  gold: 'bg-gold/10 border-gold/25 text-gold',
  neutral: 'bg-fg/5 border-fg/10 text-muted',
  danger: 'bg-danger/10 border-danger/20 text-danger',
};

const sizes: Record<IconTileSize, { tile: string; icon: string }> = {
  sm: { tile: 'h-8 w-8 rounded-[0.625rem]', icon: 'h-4 w-4' },
  md: { tile: 'h-10 w-10 rounded-tile', icon: 'h-5 w-5' },
  lg: { tile: 'h-14 w-14 rounded-pane', icon: 'h-6 w-6' },
};

/** A lucide icon in a tinted, softly lit tile. Decorative: the label belongs in the text beside it. */
export default function IconTile({ icon: Icon, tone = 'violet', size = 'md', className }: IconTileProps) {
  const s = sizes[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex flex-shrink-0 items-center justify-center border',
        // A top highlight, as if lit from above.
        'shadow-[inset_0_1px_0_rgb(var(--c-raised)/0.7)] dark:shadow-[inset_0_1px_0_rgb(var(--c-fg)/0.06)]',
        tones[tone],
        s.tile,
        className
      )}
    >
      <Icon className={s.icon} strokeWidth={1.75} />
    </span>
  );
}
