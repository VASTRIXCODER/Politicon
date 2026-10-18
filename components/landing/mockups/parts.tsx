import type { CSSProperties, ReactNode } from 'react';
import { LogoMark } from '@/components/ui/Logo';
import { formatUSD, impactSign } from '@/lib/format';
import { cn } from '@/lib/utils';
import { scalePct } from './data';
import styles from './mockups.module.css';

/*
 * Small pieces shared by the product mockups. Everything here draws inside a
 * TiltStage, which is aria-hidden, so none of it is focusable: "buttons" and
 * "tabs" are plain spans that only look like the app's.
 */

/**
 * One depth layer of a TiltStage: the main pane at depth 0, satellites
 * lifted toward the viewer. Must be a direct child of the stage's 3D group
 * (anything nested deeper is flattened).
 */
export function Layer({
  depth = 0,
  className,
  style,
  children,
}: {
  /** px toward the viewer. */
  depth?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={cn(styles.layer, className)} style={{ ...style, '--z': depth } as CSSProperties}>
      {children}
    </div>
  );
}

/** A pane of the product, with the pointer's sheet of light over it. Pass `night` for a Chamber pane. */
export function Pane({ night = false, className, children }: { night?: boolean; className?: string; children: ReactNode }) {
  return (
    <div data-night={night ? '' : undefined} className={cn(styles.pane, night && styles.chamber, 'text-ink', className)}>
      {children}
      <span className={styles.glare} />
    </div>
  );
}

const TABS = ['Dashboard', 'Policies', 'My Impact', 'Policy Guide'] as const;
export type AppTab = (typeof TABS)[number];

/** The app's top bar in miniature: the mark, where you are, and the main tabs. */
export function AppBar({ active, crumb }: { active: AppTab; crumb?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-fg/8 px-4 py-2.5 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <LogoMark className="h-5 w-5" detail="small" />
        <span className="font-display text-sm font-medium text-ink">Politicon</span>
        {crumb && (
          <span className="min-w-0 truncate text-meta text-muted">
            <span className="px-1 text-fg/30">/</span>
            {crumb}
          </span>
        )}
      </div>
      <div className="hidden items-center gap-0.5 md:flex">
        {TABS.map((tab) => (
          <span
            key={tab}
            className={cn(
              'whitespace-nowrap rounded-full px-2.5 py-1 text-meta',
              tab === active ? 'bg-fg/6 font-medium text-ink' : 'text-muted'
            )}
          >
            {tab}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The dashed "Example" stamp (Badge variant 'example'), as non-interactive mockup type. */
export function ExampleStamp({ children = 'Example', className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border border-dashed border-fg/30 px-2 py-0.5 font-mono-data text-meta font-medium tracking-wide text-muted',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Text colour for a signed amount: ledger teal for gains, ember amber for costs. */
export const AMOUNT_TONE = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-muted' } as const;
const BAR_TONE = { gain: 'bg-gain-fill', loss: 'bg-loss-fill', neutral: 'bg-fg/20' } as const;

/**
 * A category line: its label, its signed amount, and a diverging bar on the
 * explorer's shared scale (gains right of the centre line, costs left).
 */
export function DivergingRow({ label, amount, className }: { label: string; amount: number; className?: string }) {
  const sign = impactSign(amount);
  const width = scalePct(amount) / 2;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-meta text-muted">{label}</span>
        <span className={cn('font-mono-data text-meta font-medium', AMOUNT_TONE[sign])}>
          {formatUSD(amount, { signed: true })}
        </span>
      </div>
      <div className={styles.track}>
        {width > 0 && (
          <span
            className={cn(
              'absolute inset-y-0',
              BAR_TONE[sign],
              sign === 'gain' ? 'left-1/2 rounded-r-full' : 'right-1/2 rounded-l-full'
            )}
            style={{ width: `${width}%` }}
          />
        )}
      </div>
    </div>
  );
}
