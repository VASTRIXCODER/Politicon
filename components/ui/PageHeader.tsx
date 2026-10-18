import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  /** A short kicker above the title ("Your Ledger", "Step 2 of 4"). */
  eyebrow?: ReactNode;
  /** The headline. Wrap the accent words in <em>: "What this bill <em>means for you</em>". */
  title: ReactNode;
  /** One or two sentences under the title. */
  lede?: ReactNode;
  /** Buttons or controls, beside the title on wide screens and below it on phones. */
  actions?: ReactNode;
  /** h1 (default) for the page title, h2 for a section header. */
  as?: 'h1' | 'h2';
  className?: string;
}

// Kept out of cn(): tailwind-merge reads text-display-* as a text colour and
// would drop it next to one.
const TITLE_SIZE = { h1: 'text-display-md', h2: 'text-display-sm' } as const;

/**
 * The editorial header every page opens with: an eyebrow, a Fraunces
 * headline with italic violet accent words, a lede and optional actions.
 */
export default function PageHeader({ eyebrow, title, lede, actions, as: Heading = 'h1', className }: PageHeaderProps) {
  return (
    // A div, not <header>: outside <main> a header becomes a second banner landmark.
    <div className={cn('flex flex-col gap-6 text-ink sm:flex-row sm:items-end sm:justify-between sm:gap-10', className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <p className="mb-4 inline-flex items-center gap-2.5 font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-primary-300">
            {/* A point of violet light, like a status lamp. */}
            <span
              aria-hidden="true"
              data-decorative=""
              className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_rgb(var(--c-violet)/0.18),0_0_12px_rgb(var(--c-glow)/0.9)]"
            />
            {eyebrow}
          </p>
        )}
        <Heading className={`${TITLE_SIZE[Heading]} font-display font-medium [text-wrap:balance]`}>{title}</Heading>
        {lede && (
          <div className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg [text-wrap:pretty]">{lede}</div>
        )}
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
