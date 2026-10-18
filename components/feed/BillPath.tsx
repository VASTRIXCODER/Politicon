import type { CSSProperties } from 'react';
import { billPath, formatRecordDate, type BillPathModel } from '@/lib/billPath';
import { cn } from '@/lib/utils';
import type { PolicyRecord } from '@/types';
import styles from './billPath.module.css';

export interface BillPathProps {
  /** The official record. Without a verified one, no stage is shown. */
  record?: PolicyRecord;
  /** Filled in where an older record didn't keep them. */
  billNumber?: string;
  region?: string;
  /** A model already worked out (lib/billPath), instead of `record`. */
  path?: BillPathModel;
  className?: string;
}

/**
 * Where a bill stands, Introduced → Committee → Floor → Other chamber →
 * Signed, as its official record shows it (lib/billPath): the furthest
 * stage reached, never a prediction, with the date the record was read.
 *
 * The lane and the little bill sheet are decorative (aria-hidden); the
 * caption under them says the same in words, so it is the one thing read
 * out ("Where it stands: In committee, stage 2 of 5, as of Oct 18, 2026").
 * Server-safe: no hooks, and its motion is CSS that stops under reduced
 * motion and "Pause motion".
 */
export default function BillPath({ record, billNumber, region, path: given, className }: BillPathProps) {
  const path = given ?? billPath(record, { billNumber, region });
  const n = path.steps.length;
  const asOf = path.known ? formatRecordDate(path.asOf) : null;

  return (
    <div
      className={cn(styles.path, className)}
      data-bill-path=""
      data-outcome={path.outcome ?? 'unknown'}
      style={{ '--n': n, '--reached': Math.max(0, path.reached) } as CSSProperties}
    >
      <div aria-hidden="true" data-decorative="">
        <div className={styles.track}>
          <span className={styles.floor} />
          <span className={styles.rail} />
          {path.known && path.reached > 0 && <span className={styles.lit} />}
          {path.steps.map((step, i) => (
            <span
              key={step.id}
              className={styles.node}
              data-state={step.state}
              data-last={i === n - 1 ? '' : undefined}
              style={{ '--i': i } as CSSProperties}
            />
          ))}
          {path.known && <span className={styles.sheet} />}
        </div>
        <ol className={cn(styles.labels, 'text-meta')}>
          {path.steps.map((step, i) => (
            <li
              key={step.id}
              data-on={path.known && i === path.reached ? '' : undefined}
              className={cn(styles.label, 'px-0.5 leading-tight', path.known && i === path.reached ? 'font-medium text-ink' : 'text-muted')}
              style={{ gridColumn: i + 1 }}
            >
              {step.label}
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-meta text-muted">
        <span className="sr-only">Where it stands: </span>
        <span className={cn('font-medium', path.known ? 'text-ink' : 'text-muted')}>{path.headline}</span>
        {path.known ? (
          <>
            <span className="font-mono-data">
              <span aria-hidden="true">· </span>
              <span className="sr-only">, </span>stage {path.reached + 1} of {n}
            </span>
            {path.outcome === 'repealed' && <span>· Official status: repealed</span>}
            {asOf && (
              <span className="font-mono-data">
                <span aria-hidden="true">· </span>
                <span className="sr-only">, </span>as of {asOf}
              </span>
            )}
          </>
        ) : null}
      </p>
    </div>
  );
}
