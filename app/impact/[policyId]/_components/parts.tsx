import type { CSSProperties, ReactNode } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import Surface from '@/components/ui/Surface';
import { impactWords } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ImpactDirection } from '@/types';
import type { StatRowData } from './detailModel';
import styles from './detail.module.css';

/*
 * The small pieces every tab of the impact page is built from. Server-safe
 * and hook-free.
 */

/** Flat surface for rows inside a pane (no nested blur, no second shadow). */
export const INNER_ROW = 'bg-fg/4 border border-fg/8';

export function DirIcon({ d, className = 'w-5 h-5' }: { d: ImpactDirection; className?: string }) {
  if (d === 'positive') return <TrendingUp className={`${className} text-gain`} aria-hidden />;
  if (d === 'negative') return <TrendingDown className={`${className} text-loss`} aria-hidden />;
  return <Minus className={`${className} text-muted`} aria-hidden />;
}

/**
 * One labelled figure. `cue` is the signed dollar amount behind the value; when
 * set, "saves you" / "costs you" (or "you gain" / "you lose" for money coming
 * in, `kind: 'income'`) is spelled out so direction never relies on colour.
 */
export function StatRow({ label, value, positive, cue, kind }: StatRowData) {
  const neutral = cue !== undefined && Math.round(cue) === 0;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-fg/6 py-2.5 last:border-0">
      <span className="min-w-0 text-xs text-muted">{label}</span>
      <span className={cn('text-right font-mono-data text-sm font-semibold', positive === undefined || neutral ? 'text-ink' : positive ? 'text-gain' : 'text-loss')}>
        {value}
        {cue !== undefined && !neutral && <span className="block text-meta font-normal text-muted">{impactWords(cue, kind)}</span>}
      </span>
    </div>
  );
}

/** A small mono kicker over a group of figures ("You gain", "Assumptions behind these numbers"). */
export function Kicker({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <p id={id} className={cn('font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-muted', className)}>
      {children}
    </p>
  );
}

/**
 * A pane of figures or a chart: solid paper (the glass rule: numbers never
 * sit behind refraction), with its heading and an optional caption.
 */
export function Pane({
  title,
  lede,
  children,
  className,
  headingClassName,
  as = 'h3',
}: {
  title?: ReactNode;
  /** A sentence under the title (the chart's description). */
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
  headingClassName?: string;
  as?: 'h2' | 'h3';
}) {
  const Heading = as;
  return (
    <Surface pad="lg" className={cn('min-w-0', className)}>
      {title && (
        <Heading className={cn('font-display text-lg font-medium leading-snug text-ink', lede ? 'mb-1' : 'mb-4', headingClassName)}>
          {title}
        </Heading>
      )}
      {lede && <p className="mb-5 text-xs leading-relaxed text-muted [text-wrap:pretty]">{lede}</p>}
      {children}
    </Surface>
  );
}

export function SectorIndicator({ label, value, dir }: { label: string; value: string; dir: ImpactDirection }) {
  const color = dir === 'positive' ? 'text-gain' : dir === 'negative' ? 'text-loss' : 'text-muted';
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-tile px-4 py-3', INNER_ROW)}>
      <span className="text-xs text-muted">{label}</span>
      <span className={cn('flex items-center gap-1.5 text-right text-sm font-medium', color)}>
        <DirIcon d={dir} className="h-3.5 w-3.5 flex-shrink-0" /> {value}
      </span>
    </div>
  );
}

/**
 * A Chamber: the night vitrine a 3D view stands in on the day page. The
 * view (a SceneView) goes in `children`; `caption` is the DOM that carries
 * its meaning (a legend, the figures it draws), on a solid night plate, under
 * the view or, with `side`, beside it on wide screens; with `captionFirst`
 * the plate comes above the view until then (the hero: its number in a
 * phone's first screen). Only the visual order changes: the plate stays the
 * figure's caption.
 * data-scene-night asks the stage to paint the Chamber's light behind it,
 * after which the vitrine's own canvas steps aside so the view shows.
 */
export function Chamber({
  children,
  caption,
  side = false,
  captionFirst = false,
  className,
  style,
  label,
}: {
  children: ReactNode;
  caption?: ReactNode;
  /** The caption beside the view from lg up (a full-width vitrine). */
  side?: boolean;
  /** Below lg, the caption above the view rather than under it. */
  captionFirst?: boolean;
  className?: string;
  style?: CSSProperties;
  /** An accessible name for the figure, when the caption doesn't open with a heading. */
  label?: string;
}) {
  return (
    <figure
      data-night=""
      data-scene-night=""
      aria-label={label}
      style={style}
      className={cn(
        styles.chamber,
        'relative isolate m-0 min-w-0 overflow-hidden rounded-[2rem] bg-canvas p-3 text-ink sm:p-4',
        side && 'lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-center lg:gap-4',
        captionFirst && 'max-lg:flex max-lg:flex-col',
        className
      )}
    >
      <div aria-hidden="true" data-decorative="" className={cn(styles.aurora, 'pointer-events-none absolute inset-0 -z-10')} />
      <div className="min-w-0">{children}</div>
      {caption && (
        <figcaption
          className={cn(styles.plate, 'mt-3 min-w-0 rounded-pane px-4 py-4 sm:px-5 sm:py-5', side && 'lg:mt-0', captionFirst && 'max-lg:order-first max-lg:mb-3 max-lg:mt-0')}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** A key entry under a 3D view: a swatch and what it means, in words. */
export function LegendItem({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-[3px]', swatch)} />
      {children}
    </li>
  );
}
