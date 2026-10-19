'use client';

import { CloudOff, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import styles from '@/components/impact/receipt/skyline.module.css';

/*
 * My Impact's waiting, empty and failed states. The skeleton has the same
 * grid as the receipt beside the skyline (and the vitrine is already night),
 * so nothing jumps, or flashes from day to night, when the analyses arrive.
 */

/** The receipt column and the skyline column, as the loaded page lays them out. */
export const RECEIPT_GRID = 'grid items-start gap-8 lg:grid-cols-12 lg:gap-10';
export const RECEIPT_COLUMN = 'min-w-0 lg:col-span-5';
export const SKYLINE_COLUMN = 'min-w-0 lg:col-span-7 lg:sticky lg:top-28';

export function ReceiptSkeleton({ label = 'Loading your analyses…' }: { label?: string }) {
  return (
    <div className={RECEIPT_GRID} role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className={RECEIPT_COLUMN}>
        <Skeleton shape="line" className="mb-3 h-6 w-56" />
        <Skeleton shape="line" className="mb-6 w-40" />
        <div className="rounded-pane border border-fg/8 bg-surface p-6 shadow-pane">
          <Skeleton className="h-10 w-40" />
          <div className="mt-6 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
          <Skeleton className="mt-6 h-14 w-full" />
        </div>
      </div>
      <div className={SKYLINE_COLUMN}>
        <SkylineSkeleton />
      </div>
    </div>
  );
}

/** The skyline's vitrine while its code (split off the first load) arrives: already night, the same size. */
export function SkylineSkeleton() {
  return (
    <div data-night="" aria-hidden="true" className={cn(styles.vitrine, 'relative isolate overflow-hidden rounded-[2rem] bg-canvas px-4 pb-4 pt-5 text-ink sm:px-6 sm:pb-6 sm:pt-6')}>
      <div data-decorative="" className={cn('pointer-events-none absolute inset-0 -z-10', styles.aurora)} />
      <Skeleton shape="line" className="w-24" />
      <Skeleton shape="line" className="mt-3 h-6 w-64 max-w-full" />
      <Skeleton className="mt-5 aspect-[4/3] w-full rounded-pane sm:aspect-[16/10]" />
      <Skeleton className="mt-4 h-28 w-full rounded-pane" />
    </div>
  );
}

export function NoAnalyses() {
  return (
    <EmptyState
      icon={Search}
      title="No policies analyzed yet"
      body="Browse the policy feed on your dashboard, analyze a policy, and it prints here: its yearly estimate on your receipt and its tower on your skyline."
      action={
        <>
          <Button href="/dashboard" variant="primary" size="sm">
            Go to Dashboard
          </Button>
          <Button href="/advisor" variant="ghost" size="sm">
            Ask the Policy Guide
          </Button>
        </>
      }
    />
  );
}

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon={CloudOff}
        tone="danger"
        title="We couldn't load your analyses"
        body="Your analyses are safe; this page just couldn't read them. Check your connection and try again."
        action={
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
