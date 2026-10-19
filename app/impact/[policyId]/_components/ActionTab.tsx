'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FullAnalysis } from '@/types';
import { resourceLinks } from './detailModel';
import { INNER_ROW, Pane } from './parts';

/*
 * Things to Consider: the analysis's suggestions as a checklist (kept in
 * this browser), what could change the projection, and official places to
 * follow the bill and check eligibility. Suggestions, never advice.
 */

// Danger is kept for errors, so a high priority is a caution note.
const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-caution/10 border-caution/25 text-caution',
  medium: 'bg-primary/10 border-primary/20 text-primary-300',
  low: 'bg-fg/5 border-fg/10 text-muted',
};

export default function ActionTab({ a }: { a: FullAnalysis }) {
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

  const checked = a.recommendations.map((r) => !!done[r.step]);
  const doneCount = checked.filter(Boolean).length;
  const links = resourceLinks(a.category, a.billNumber);

  return (
    <div className="space-y-6">
      <Pane>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-medium text-ink">Things you could consider</h3>
          <span className="font-mono-data text-xs text-muted">{doneCount}/{a.recommendations.length} done</span>
        </div>
        <div className="space-y-3">
          {a.recommendations.map((r, i) => (
            <button key={i} type="button" onClick={() => toggle(r.step)} role="checkbox" aria-checked={checked[i]}
              className={cn('flex w-full items-start gap-3 rounded-tile p-4 text-left transition-colors duration-200 ease-civic hover:border-fg/16', INNER_ROW)}>
              <span className={cn('mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ease-civic', checked[i] ? 'border-primary-fill bg-primary-fill' : 'border-fg/20')} aria-hidden>
                {checked[i] && <Check className="h-3.5 w-3.5 text-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('text-sm', checked[i] ? 'text-muted line-through' : 'text-ink')}>{r.step}</span>
              </span>
              <span className={cn('flex-shrink-0 rounded-full border px-2 py-0.5 font-mono-data text-meta uppercase', PRIORITY_STYLES[r.priority])}>
                <span className="sr-only">, priority: </span>{r.priority}
              </span>
            </button>
          ))}
        </div>
      </Pane>

      <Pane>
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-medium text-ink">
          <ShieldAlert className="h-4 w-4 text-primary-300" aria-hidden /> Things that could change this projection
        </h3>
        <ul className="mb-6 space-y-2">
          {a.riskFactors.uncertainties.map((u, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted">
              <span className="mt-1 text-primary-300" aria-hidden>•</span><span>{u}</span>
            </li>
          ))}
        </ul>
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
