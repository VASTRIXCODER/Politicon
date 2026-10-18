'use client';

import { useId, useState } from 'react';
import { Lightbulb, BookOpen, ChevronDown } from 'lucide-react';
import { JargonTerm } from '@/types';
import { jargonList } from '@/lib/simpleMode';
import { cn } from '@/lib/utils';

/** "What this means for you" plain-language callout, shown only in Simple Mode. */
export function WhatThisMeans({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="relative mb-5 flex items-start gap-3 overflow-hidden rounded-tile border border-accent/15 bg-accent/5 py-3.5 pl-5 pr-4">
      {/* Simple Mode's orchid rail. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent/70" />
      <Lightbulb className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden />
      <div>
        <p className="text-meta font-semibold text-accent uppercase tracking-[0.12em] mb-1">What this means for you</p>
        <p className="text-sm text-text-primary leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

/** Collapsible Jargon Buster — every economic term on the page in plain English. */
export function JargonBuster({ terms }: { terms: JargonTerm[] }) {
  const [open, setOpen] = useState(true);
  const panelId = useId();

  const list = jargonList(terms);

  if (list.length === 0) return null;

  return (
    // A solid pane: definitions are reading matter, not a control.
    <div className="rounded-pane overflow-hidden border border-fg/8 bg-surface shadow-pane">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left rounded-[inherit] transition-colors duration-200 ease-civic hover:bg-fg/3"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <BookOpen className="w-4 h-4 text-accent" aria-hidden /> Jargon Buster
        </span>
        <ChevronDown
          className={cn('w-4 h-4 text-text-muted transition-transform duration-300 ease-civic motion-reduce:transition-none', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        // Focusable so the list can be scrolled from the keyboard.
        <dl id={panelId} tabIndex={0} className="px-4 pb-4 space-y-3 max-h-[420px] overflow-y-auto">
          {list.map((t) => (
            <div key={t.term.toLowerCase()} className="border-t border-fg/8 pt-3 first:border-0 first:pt-0">
              <dt className="text-xs font-semibold text-accent">{t.term}</dt>
              <dd className="text-xs text-text-muted leading-relaxed mt-0.5">{t.definition}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
