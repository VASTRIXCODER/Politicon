'use client';

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import CountUp from '@/components/ui/CountUp';
import { LogoMark } from '@/components/ui/Logo';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { impactSign, impactTone, impactWords } from '@/lib/format';
import { cn } from '@/lib/utils';
import ReceiptSeal from './ReceiptSeal';
import {
  categoryName,
  latestDate,
  lineNumber,
  policies,
  receiptTotals,
  shortDate,
  spokenYearly,
  yearly,
  type ReceiptLine,
  type ReceiptOrder,
} from './receiptModel';
import styles from './receipt.module.css';

/*
 * "Your Policy Receipt" (/impact), the honest, readable layer of My Impact:
 * a long strip of paper with one numbered line per analyzed policy (its
 * title linking to the full analysis, its category and date, its signed
 * yearly estimate in teal or amber with the words "saves you" / "costs
 * you"), the subtotal of what saves you money, the subtotal of what costs
 * you, and the net at the foot under a double rule, then the stamp.
 *
 * On its first view it prints: it feeds out of the slot and its lines drop
 * into place (CSS only, moving but never fading, skipped under reduced
 * motion and "Pause motion"); every line is in the DOM and readable from the
 * first frame. Pointing at or focusing a line reports it (`onFocus`), so the
 * Skyline can light the same policy's tower, and `focus` marks the line the
 * Skyline is pointing at. Each line's "Details" opens its summary in place
 * (`details`).
 */

export interface PolicyReceiptProps {
  /** One per analysis, in the order to print them. */
  lines: readonly ReceiptLine[];
  order: ReceiptOrder;
  onOrderChange: (order: ReceiptOrder) => void;
  /** The line whose summary is open. */
  openId?: string | null;
  onToggle?: (id: string) => void;
  /** The opened line's summary. */
  details?: (id: string) => ReactNode;
  /** The lit line (the Skyline's tower under the pointer, or this receipt's own). */
  focus?: string | null;
  /** A line pointed at or focused (its id), or let go (null). */
  onFocus?: (id: string | null) => void;
  /** Play the print: the first time the receipt is shown on a visit. */
  print?: boolean;
  className?: string;
}

const ORDER_OPTIONS = [
  { value: 'impact', label: 'Largest first' },
  { value: 'date', label: 'Newest first' },
] as const;

function Amount({ value, size = 'sm' }: { value: number; size?: 'sm' | 'base' }) {
  const sign = impactSign(value);
  return (
    <span className="block text-right">
      <span aria-hidden="true" className={cn('block whitespace-nowrap font-mono-data font-semibold', size === 'sm' ? 'text-sm' : 'text-base', impactTone(value))}>
        {yearly(value)}
      </span>
      <span aria-hidden="true" className={cn('block text-meta', sign === 'neutral' ? 'text-muted' : impactTone(value))}>
        {impactWords(value)}
      </span>
      <span className="sr-only">{spokenYearly(value)}</span>
    </span>
  );
}

function Line({
  line,
  index,
  open,
  lit,
  onToggle,
  onFocus,
  details,
}: {
  line: ReceiptLine;
  index: number;
  open: boolean;
  lit: boolean;
  onToggle?: (id: string) => void;
  onFocus?: (id: string | null) => void;
  details?: (id: string) => ReactNode;
}) {
  const panelId = `receipt-line-${line.id}`;
  const value = line.dollar_impact || 0;
  const date = shortDate(line.created_at);
  return (
    <li
      data-receipt-line={line.id}
      data-focused={lit ? '' : undefined}
      style={{ '--i': index } as CSSProperties}
      onMouseEnter={() => onFocus?.(line.id)}
      onMouseLeave={() => onFocus?.(null)}
      onFocus={() => onFocus?.(line.id)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onFocus?.(null);
      }}
      className={cn(styles.line, 'relative -mx-2 rounded-md px-2 py-3')}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="w-6 flex-shrink-0 pt-0.5 font-mono-data text-meta text-muted">
          {lineNumber(index)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium leading-snug text-ink">
            <Link
              href={`/impact/${encodeURIComponent(line.policy_id)}`}
              className="rounded-sm underline decoration-fg/20 underline-offset-[3px] transition-colors [overflow-wrap:anywhere] hover:decoration-primary"
            >
              {line.policy_title}
            </Link>
          </h3>
          <p className="mt-0.5 font-mono-data text-meta text-muted">
            {categoryName(line.category)}
            {date && ` · ${date}`}
          </p>
          {details && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              onClick={() => onToggle?.(line.id)}
              className="-ml-1.5 mt-1.5 inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-meta font-medium text-primary-300 transition-colors hover:bg-primary/[0.06] hover:text-ink"
            >
              {open ? 'Hide details' : 'Details'}
              <span className="sr-only"> for {line.policy_title}</span>
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200 ease-civic', open && 'rotate-180')} aria-hidden="true" />
            </button>
          )}
        </div>
        <Amount value={value} />
      </div>
      {open && details && (
        <div id={panelId} className={cn(styles.unfold, 'mt-3 border-t border-dashed border-fg/15 pt-4 sm:pl-9')}>
          {details(line.id)}
        </div>
      )}
    </li>
  );
}

function Subtotal({ label, count, value }: { label: string; count: number; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 text-sm text-ink">
        {label}
        <span className="text-muted"> · {policies(count)}</span>
      </dt>
      <dd className={cn('whitespace-nowrap font-mono-data text-sm font-semibold', impactTone(value))}>
        <span aria-hidden="true">{yearly(value)}</span>
        <span className="sr-only">{spokenYearly(value)}</span>
      </dd>
    </div>
  );
}

export default function PolicyReceipt({
  lines,
  order,
  onOrderChange,
  openId = null,
  onToggle,
  details,
  focus = null,
  onFocus,
  print = false,
  className,
}: PolicyReceiptProps) {
  const titleId = useId();
  // Decided once, when the receipt first mounts: a later render never restarts (or cuts short) the print.
  const [printing] = useState(print);
  const totals = receiptTotals(lines);
  const net = totals.net;
  const netWords = impactWords(net);
  const latest = latestDate(lines);
  const tail = lines.length;

  return (
    <section aria-labelledby={titleId} className={cn('min-w-0', className)}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-2xl font-medium text-ink sm:text-3xl">
            Your policy <em>receipt</em>
          </h2>
          <p className="mt-1 text-sm text-muted">{policies(lines.length)}, each with its estimate for a year.</p>
        </div>
        <SegmentedControl size="sm" label="Order the receipt" value={order} onValueChange={onOrderChange} options={ORDER_OPTIONS} />
      </div>

      <div className={cn(styles.stage, printing && styles.print)} data-printing={printing ? '' : undefined}>
        <div aria-hidden="true" data-decorative="" className={styles.slot} />
        <div className={styles.lift}>
          <div className={cn(styles.paper, 'px-4 pt-6 sm:px-6')}>
            <div className="flex items-start justify-between gap-4 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <LogoMark className="h-8 w-8" detail="small" />
                <div className="min-w-0">
                  <p className="font-display text-lg leading-none text-ink">Politicon</p>
                  <p className="mt-1.5 font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Policy receipt</p>
                </div>
              </div>
              <p className="text-right font-mono-data text-meta leading-relaxed text-muted">
                <span className="block">{policies(lines.length)}</span>
                {latest && <span className="block">Latest {latest}</span>}
              </p>
            </div>

            <div aria-hidden="true" data-decorative="" className={styles.perforation} />

            <p aria-hidden="true" className="mt-4 flex items-center justify-between gap-3 font-mono-data text-meta uppercase tracking-[0.14em] text-muted">
              <span>No. · Item</span>
              <span>Per year</span>
            </p>

            <ol aria-labelledby={titleId} className="mt-1">
              {lines.map((line, i) => (
                <Line
                  key={line.id}
                  line={line}
                  index={i}
                  open={openId === line.id}
                  lit={focus === line.id}
                  onToggle={onToggle}
                  onFocus={onFocus}
                  details={details}
                />
              ))}
            </ol>

            <dl className={cn(styles.subtotals, 'mt-1 space-y-2 pt-4')} style={{ '--i': tail } as CSSProperties}>
              <Subtotal label="Subtotal, saves you" count={totals.gainCount} value={totals.gains} />
              <Subtotal label="Subtotal, costs you" count={totals.costCount} value={-totals.costs} />
              {totals.flatCount > 0 && <Subtotal label="No change" count={totals.flatCount} value={0} />}
            </dl>

            <div className={cn(styles.net, 'mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-4')} style={{ '--i': tail + 1 } as CSSProperties}>
              <p>
                <span className="block font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Net per year</span>
                <span className={cn('mt-1 block text-sm font-medium', netWords === 'no change' ? 'text-muted' : impactTone(net))}>
                  {netWords === 'no change' ? 'No net change' : `Altogether, ${netWords}`}
                </span>
              </p>
              {/* The count plays with the print as the receipt mounts (not when it scrolls into view), so the
                  foot never sits at $0 under "Altogether, saves you"; a printed page gets the final figure. */}
              <p className={cn('font-mono-data text-3xl font-semibold leading-none tracking-tight sm:text-4xl', impactTone(net))}>
                <span className="print:hidden">
                  <CountUp value={net} from={printing ? 0 : net} duration={1400} startOnView={false} format={yearly} srLabel={spokenYearly(net)} />
                </span>
                <span aria-hidden="true" className="hidden print:inline">{yearly(net)}</span>
              </p>
            </div>

            <div aria-hidden="true" data-decorative="" className={cn(styles.perforation, 'mt-6')} />

            <div className="mt-5 flex items-center gap-4 pb-2">
              <span className={cn(styles.seal, 'block flex-shrink-0')} style={{ '--i': tail + 2 } as CSSProperties}>
                <ReceiptSeal className="h-24 w-24" />
              </span>
              <p className="text-meta leading-relaxed text-muted">
                <span className="font-medium text-primary-300">Estimates · not advice.</span> Educational estimates from the ranges in your
                profile, not a tax calculation or financial advice. Each line opens its full analysis.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
