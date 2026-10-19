'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Check, ExternalLink, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FullAnalysis } from '@/types';
import { PRIORITY_STAMP, resourceLinks } from './detailModel';
import { INNER_ROW, Kicker, Pane } from './parts';
import styles from './detail.module.css';

/*
 * Things to Consider: the analysis's suggestions as a stamped paper
 * checklist (a slip in the receipt's idiom: numbered lines, a box to tick,
 * each line's priority stamped in violet ink, the tally stamped at the
 * head; ticks are kept in this browser), what could change the projection,
 * and official places to follow the bill and check eligibility.
 * Suggestions, never advice. An analysis without suggestions or listed
 * uncertainties says so, rather than heading an empty list.
 */

const lineNumber = (i: number) => String(i + 1).padStart(2, '0');

export default function ActionTab({ a }: { a: FullAnalysis }) {
  const titleId = useId();
  // Kept in this browser only (cleared on sign-out), keyed by the item's text so
  // a re-analysis with different suggestions never inherits old ticks.
  const storageKey = `politicon:checklist:${a.policyId}`;
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      setDone(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {});
    } catch { setDone({}); }
  }, [storageKey]);

  const toggle = useCallback((step: string) => {
    setDone((prev) => {
      const next = { ...prev, [step]: !prev[step] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  const items = a.recommendations;
  const checked = items.map((r) => !!done[r.step]);
  const doneCount = checked.filter(Boolean).length;
  const links = resourceLinks(a.category, a.billNumber);
  const uncertainties = a.riskFactors.uncertainties;

  return (
    <div className="space-y-6">
      <section aria-labelledby={titleId} className={cn(styles.paper, 'rounded-pane px-4 pb-5 pt-5 sm:px-7 sm:pt-6')}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 pb-4">
          <div className="min-w-0">
            <Kicker>Your checklist</Kicker>
            <h3 id={titleId} className="mt-1 font-display text-xl font-medium leading-snug text-ink sm:text-2xl">
              Things you could <em>consider</em>
            </h3>
          </div>
          {items.length > 0 && (
            // The tally, stamped: it is text, read with the heading's section.
            <p className={cn(styles.stamp, 'rounded-md border-primary-300/80 px-2.5 py-1 font-mono-data text-meta font-semibold uppercase text-primary-300')}>
              {doneCount} of {items.length} done
            </p>
          )}
        </div>
        <div aria-hidden="true" data-decorative="" className={styles.perforation} />

        {items.length === 0 ? (
          <p className="mt-5 text-sm leading-relaxed text-muted">This analysis didn’t suggest anything to consider.</p>
        ) : (
          <ol aria-labelledby={titleId} className="mt-2">
            {items.map((r, i) => {
              const stamp = PRIORITY_STAMP[r.priority] ?? PRIORITY_STAMP.medium;
              return (
                <li key={i} className={styles.dotted}>
                  <button
                    type="button"
                    onClick={() => toggle(r.step)}
                    role="checkbox"
                    aria-checked={checked[i]}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-md px-2 py-3.5 text-left transition-colors duration-200 ease-civic hover:bg-primary/[0.05]"
                  >
                    <span aria-hidden="true" className="w-6 flex-shrink-0 pt-0.5 font-mono-data text-meta text-muted">{lineNumber(i)}</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors duration-200 ease-civic',
                        checked[i] ? 'border-primary-fill bg-primary-fill' : 'border-fg/35'
                      )}
                    >
                      {checked[i] && <Check className="h-3.5 w-3.5 text-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('text-sm leading-relaxed', checked[i] ? 'text-muted line-through decoration-fg/40' : 'text-ink')}>{r.step}</span>
                    </span>
                    <span className={cn(styles.stamp, 'mt-0.5 flex-shrink-0 rounded-[4px] px-1.5 py-px font-mono-data text-[0.625rem] font-semibold uppercase', stamp.className)}>
                      <span className="sr-only">, priority: </span>{stamp.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <div aria-hidden="true" data-decorative="" className={cn(styles.perforation, 'mt-3')} />
        <p className="mt-4 text-meta leading-relaxed text-muted">
          <span className="font-medium text-primary-300">Suggestions · not advice.</span> From the analysis, for your situation as your
          profile describes it. Your ticks stay in this browser.
        </p>
      </section>

      <Pane>
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-medium text-ink">
          <ShieldAlert className="h-4 w-4 text-primary-300" aria-hidden /> Things that could change this projection
        </h3>
        {uncertainties.length > 0 ? (
          <ul className="mb-6 space-y-2">
            {uncertainties.map((u, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted">
                <span className="mt-1 text-primary-300" aria-hidden>•</span><span>{u}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-6 text-sm text-muted">No specific uncertainties were listed; the assumptions on the Overview tab say what the estimate rests on.</p>
        )}
        <h3 className="mb-3 font-display text-lg font-medium text-ink">Government resources</h3>
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
              className={cn('flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-muted transition-colors duration-200 ease-civic hover:border-fg/16 hover:text-ink', INNER_ROW)}>
              <ExternalLink className="h-3 w-3" aria-hidden /> {l.label}<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </div>
      </Pane>
    </div>
  );
}
