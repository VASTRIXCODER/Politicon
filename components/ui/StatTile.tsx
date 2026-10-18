import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import IconTile from '@/components/ui/IconTile';
import { cn } from '@/lib/utils';

export type StatTone = 'neutral' | 'violet' | 'gain' | 'loss';

export interface StatDelta {
  /** The signed change. Shown with "+" or "−" and words, never by colour alone. */
  value: number;
  /** Formats the size of the change (always given a positive number). Default: en-US number. */
  format?: (abs: number) => string;
  /** What the direction means, e.g. { up: 'saves you', down: 'costs you' }. Default "up" / "down". */
  words?: { up: string; down: string; flat?: string };
  /**
   * Which direction is good news: 'up' (default) shows increases as gains,
   * 'down' as costs, 'none' keeps the change neutral.
   */
  good?: 'up' | 'down' | 'none';
}

export interface StatTileProps {
  label: ReactNode;
  /** The figure, already formatted (or a <CountUp>). Set in Geist Mono with tabular digits. */
  value: ReactNode;
  /** A short note under the value ("per year", "Example · illustrative"). */
  hint?: ReactNode;
  delta?: StatDelta;
  /** Colours the value: gain/loss only for money moving that way. */
  tone?: StatTone;
  icon?: LucideIcon;
  className?: string;
}

const valueTones: Record<StatTone, string> = {
  neutral: 'text-ink',
  violet: 'text-primary-300',
  gain: 'text-gain',
  loss: 'text-loss',
};

const iconTones = { neutral: 'neutral', violet: 'violet', gain: 'gain', loss: 'loss' } as const;

const numberFormat = new Intl.NumberFormat('en-US');

/** The sign, figure and words for a delta, e.g. "+$120 saves you" or "−3 down". */
export function describeDelta({ value, format, words }: StatDelta) {
  const size = Math.abs(value);
  const figure = format ? format(size) : numberFormat.format(size);
  if (value === 0) return { direction: 'flat' as const, sign: '', figure, words: words?.flat ?? 'no change' };
  const up = value > 0;
  return {
    direction: up ? ('up' as const) : ('down' as const),
    // U+2212 minus: the true sign, and read as "minus".
    sign: up ? '+' : '−',
    figure,
    words: up ? (words?.up ?? 'up') : (words?.down ?? 'down'),
  };
}

/**
 * One figure with its label: a solid paper tile (numbers never sit on glass).
 *
 *   <StatTile label="Net yearly impact" value={formatUSD(1240)} tone="gain"
 *     delta={{ value: 120, format: formatUSD, words: { up: 'more than last year', down: 'less than last year' } }} />
 */
export default function StatTile({ label, value, hint, delta, tone = 'neutral', icon, className }: StatTileProps) {
  const d = delta ? describeDelta(delta) : null;
  const good = delta?.good ?? 'up';
  const deltaTone =
    !d || d.direction === 'flat' || good === 'none'
      ? 'text-muted'
      : (d.direction === 'up') === (good === 'up')
        ? 'text-gain'
        : 'text-loss';
  const DeltaIcon = !d || d.direction === 'flat' ? ArrowRight : d.direction === 'up' ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col gap-3 rounded-tile border border-fg/8 bg-surface p-4 shadow-pane sm:p-5',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-meta font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
        {icon && <IconTile icon={icon} tone={iconTones[tone]} size="sm" />}
      </div>
      {/* Wraps rather than widening the page when a long figure meets a narrow grid cell. */}
      <p
        className={cn(
          'font-mono-data text-2xl font-medium leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-3xl sm:leading-tight',
          valueTones[tone]
        )}
      >
        {value}
      </p>
      {(d || hint) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {d && (
            <span className={cn('inline-flex items-center gap-1 font-medium', deltaTone)}>
              <DeltaIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="font-mono-data">
                {d.sign}
                {d.figure}
              </span>
              <span>{d.words}</span>
            </span>
          )}
          {hint && <span className="text-muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}
