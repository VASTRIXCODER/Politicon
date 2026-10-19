import Skeleton from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import styles from './dashboard.module.css';

/*
 * The ledger section's shape while its data (or its code: the section is
 * split out of the page's first load) is on the way: the vitrine (already
 * night, as the section's is) with a placeholder where the model stands, and
 * the readout's pane with its title. Same grid and frames as LedgerSection,
 * so nothing moves, and nothing flashes from day to night, when it arrives.
 */

export const LEDGER_GRID = 'mb-12 grid items-start gap-6 lg:grid-cols-12 lg:gap-8';
export const LEDGER_FIGURE = 'min-w-0 lg:sticky lg:top-28 lg:col-span-5';
/**
 * The vitrine, a small Chamber: a night section (data-night) with its own
 * night canvas, which the stage's light field replaces once it paints it
 * (LedgerSection adds data-scene-night), so the 3D model behind the page shows.
 */
export const LEDGER_FRAME = 'relative isolate overflow-hidden rounded-[2rem] bg-canvas px-3 pb-4 pt-3 text-ink sm:px-5';

export const LEDGER_BOX = 'relative mx-auto aspect-[4/5] max-h-[34rem] w-full';
/** The readout's paper pane (Surface paper, pad lg). */
export const LEDGER_PANE = 'relative min-w-0 rounded-pane border border-fg/8 bg-surface p-6 shadow-pane sm:p-8 lg:col-span-7';

/** The vitrine's aurora: CSS light until the light field takes the vitrine over. */
export function LedgerAurora() {
  return <div aria-hidden="true" data-decorative="" className={cn('pointer-events-none absolute inset-0 -z-10', styles.aurora)} />;
}

export default function LedgerSkeleton() {
  return (
    <div className={LEDGER_GRID}>
      <div className={LEDGER_FIGURE}>
        <div data-night="" className={cn(styles.chamber, LEDGER_FRAME)}>
          <LedgerAurora />
          <div className={LEDGER_BOX}>
            <Skeleton className="absolute inset-4 rounded-pane" />
          </div>
          <Skeleton shape="line" className="mx-auto mt-3 w-3/5" />
        </div>
      </div>
      <section aria-labelledby="dashboard-ledger-loading" aria-busy="true" className={LEDGER_PANE}>
        <h2 id="dashboard-ledger-loading" className="font-display text-2xl font-medium text-ink sm:text-3xl">
          Your <em>Ledger</em>
        </h2>
        <div role="status" className="mt-5">
          <span className="sr-only">Loading your ledger…</span>
          <Skeleton shape="line" className="w-32" />
          <Skeleton className="mt-3 h-12 w-56 max-w-full" />
          <Skeleton shape="line" className="mt-3 w-48 max-w-full" />
          <Skeleton className="mt-6 h-11 w-full" />
          <Skeleton className="mt-3 h-11 w-full" />
        </div>
      </section>
    </div>
  );
}
