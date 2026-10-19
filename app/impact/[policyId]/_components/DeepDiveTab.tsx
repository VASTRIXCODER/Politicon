'use client';

import { useState } from 'react';
import { Briefcase, ChevronDown, GraduationCap, Heart, Home, Landmark, PiggyBank, Waves } from 'lucide-react';
import IconTile from '@/components/ui/IconTile';
import Surface from '@/components/ui/Surface';
import { formatUSD, impactSign, impactWords } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { FullAnalysis } from '@/types';
import { deepDiveHeadline, deepDiveRows } from './detailModel';
import { StatRow } from './parts';
import styles from './detail.module.css';

/*
 * Deep Dive: one disclosure per area of life (housing first, open), each
 * with the analysis's own figures for it. Every heading carries the area's
 * yearly amount as a small signed ledger glyph (detailModel deepDiveHeadline:
 * the analysis's own category impact; for the ripple effects its cost of
 * living), with a bar from a centre $0 line on one linear scale shared by
 * all seven, so the areas can be compared closed. The figures fade in as a
 * section opens (CSS, still under reduced motion and "Pause motion").
 */

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-muted' } as const;

/** An area's yearly amount: a bar from a centre $0 line (linear, `share` of the longest), its sign and its words. */
function LedgerGlyph({ value, share }: { value: number; share: number }) {
  const sign = impactSign(value);
  return (
    // On a phone the bar sits under the amount (there is no room beside it), from 420px it leads.
    <span className="flex flex-shrink-0 flex-col items-end gap-1.5 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-2.5">
      <span aria-hidden="true" data-decorative="" className="relative order-last block h-1.5 w-[5.5rem] rounded-full bg-fg/8 min-[420px]:order-first min-[420px]:w-14">
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-fg/30" />
        {sign !== 'neutral' && (
          <span
            className={cn('absolute inset-y-0 min-w-[2px] rounded-full', sign === 'loss' ? 'right-1/2 bg-loss-fill' : 'left-1/2 bg-gain-fill')}
            style={{ width: `${(share * 50).toFixed(2)}%` }}
          />
        )}
      </span>
      <span className="w-[5.5rem] text-right">
        <span className={cn('block whitespace-nowrap font-mono-data text-xs font-semibold', sign === 'neutral' ? 'text-muted' : TONE_TEXT[sign])}>
          {sign === 'neutral' ? 'No change' : formatUSD(value, { signed: true, suffix: '/yr' })}
        </span>
        {sign !== 'neutral' && <span className={cn('block text-[0.6875rem] leading-tight', TONE_TEXT[sign])}>{impactWords(value)}</span>}
      </span>
    </span>
  );
}

const SECTION_DEFS = [
  { key: 'housing', title: 'Housing', icon: Home },
  { key: 'employment', title: 'Employment', icon: Briefcase },
  { key: 'healthcare', title: 'Healthcare', icon: Heart },
  { key: 'retirement', title: 'Retirement', icon: PiggyBank },
  { key: 'education', title: 'Education', icon: GraduationCap },
  { key: 'tax', title: 'Taxes', icon: Landmark },
  { key: 'ripple', title: 'Ripple effects', icon: Waves },
] as const;

export default function DeepDiveTab({ a }: { a: FullAnalysis }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ housing: true });
  const headlines = SECTION_DEFS.map(({ key }) => Math.round(deepDiveHeadline(a, key)));
  const largest = Math.max(0, ...headlines.map(Math.abs));

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-meta leading-relaxed text-muted [text-wrap:pretty]">
        Beside each area, its yearly amount in this analysis{largest > 0 ? <>, with a bar from $0 on one linear scale (the longest is {formatUSD(largest)} a year)</> : null}.
        Open an area for its figures.
      </p>
      {SECTION_DEFS.map(({ key, title, icon }, i) => {
        const isOpen = !!open[key];
        const panelId = `deepdive-${key}`;
        return (
          <Surface key={key} pad="none" radius="tile" className={cn('overflow-hidden transition-colors duration-200 ease-civic', isOpen && 'border-primary/25')}>
            <h3>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                className="flex w-full items-center gap-3 rounded-tile p-4 text-left transition-colors duration-200 ease-civic hover:bg-fg/3 sm:p-5"
              >
                <IconTile icon={icon} tone="violet" size="sm" />
                <span className="min-w-0 flex-1 font-display text-base font-medium text-ink">{title}</span>
                <LedgerGlyph value={headlines[i]} share={largest ? Math.abs(headlines[i]) / largest : 0} />
                <ChevronDown className={cn('h-4 w-4 text-muted transition-transform duration-200 ease-civic', isOpen && 'rotate-180')} aria-hidden />
              </button>
            </h3>
            {isOpen && (
              <div id={panelId} className={cn(styles.reveal, 'px-4 pb-4 sm:px-5 sm:pb-5')}>
                <div className="border-t border-fg/8 pt-2">
                  {deepDiveRows(a, key).map((r, i) => <StatRow key={i} {...r} />)}
                </div>
              </div>
            )}
          </Surface>
        );
      })}
    </div>
  );
}
