import type { ReactNode } from 'react';
import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './legal.module.css';

/*
 * Help's building blocks: the questions as native disclosures (details and
 * summary, so they open with Enter or Space, announce their state, and
 * find-in-page opens the one holding a match), each answer gliding open
 * where the browser can animate to `auto`; and the contact card that sits
 * beside them.
 */

export interface FaqItem {
  q: string;
  a: ReactNode;
}

export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={cn('border-y border-fg/10', className)}>
      {items.map(({ q, a }, i) => (
        <details key={q} className={cn('group border-b border-fg/10 last:border-b-0', styles.faq)}>
          <summary
            className={cn(
              'flex cursor-pointer items-start gap-4 rounded-lg py-5 text-ink transition-colors duration-200 ease-civic hover:text-primary-300 sm:gap-5',
              styles.summary
            )}
          >
            <span aria-hidden="true" className="w-6 flex-shrink-0 pt-1.5 font-mono-data text-meta text-primary-300">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="flex-1 font-display text-lg font-medium leading-snug tracking-[-0.01em] sm:text-xl">{q}</span>
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-fg/12 text-base leading-none text-primary-300 group-open:border-primary/30 group-open:bg-primary/8',
                styles.toggle
              )}
            >
              +
            </span>
          </summary>
          <div className="pb-6 pl-10 pr-2 sm:pl-11 sm:pr-12">
            <p>{a}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

/** A porcelain card with the support address, like the back of an envelope. */
export function ContactCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-pane border border-fg/8 bg-surface p-6 shadow-pane sm:p-7">
      {/* Airmail edging along the top: a dashed band of violet light. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[repeating-linear-gradient(135deg,rgb(var(--c-violet)/0.55)_0_10px,transparent_10px_20px)]"
      />
      <div
        aria-hidden="true"
        className="mb-5 flex h-11 w-11 items-center justify-center rounded-tile border border-primary/25 bg-primary/10 text-primary-300 shadow-[0_10px_24px_-12px_rgb(var(--c-violet)/0.6)]"
      >
        <Mail className="h-5 w-5" />
      </div>
      <h2 className="mb-3 font-display text-xl font-medium leading-snug tracking-[-0.01em] text-ink">{title}</h2>
      <div className="legal-prose space-y-3 text-sm leading-relaxed text-ink/85">{children}</div>
    </section>
  );
}
