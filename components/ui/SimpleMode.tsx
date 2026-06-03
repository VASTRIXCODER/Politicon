'use client';

import { useState } from 'react';
import { Lightbulb, BookOpen, ChevronDown } from 'lucide-react';
import { JargonTerm } from '@/types';
import { BASE_JARGON } from '@/lib/simpleMode';

/** "What this means for you" plain-language callout, shown only in Simple Mode. */
export function WhatThisMeans({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-2xl bg-secondary/10 border border-secondary/20 px-4 py-3">
      <Lightbulb className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-[11px] font-semibold text-secondary uppercase tracking-wide mb-0.5">What this means for you</p>
        <p className="text-sm text-text-primary leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

/** Collapsible Jargon Buster — every economic term on the page in plain English. */
export function JargonBuster({ terms }: { terms: JargonTerm[] }) {
  const [open, setOpen] = useState(true);

  // Merge model-supplied terms with the built-in dictionary (model wins on conflicts).
  const merged = new Map<string, string>();
  for (const [term, definition] of Object.entries(BASE_JARGON)) merged.set(term.toLowerCase(), definition);
  for (const t of terms) if (t.term) merged.set(t.term.toLowerCase(), t.definition);

  const list = terms.length > 0
    ? terms
    : Array.from(merged.entries()).map(([term, definition]) => ({ term, definition }));

  if (list.length === 0) return null;

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <BookOpen className="w-4 h-4 text-secondary" /> Jargon Buster
        </span>
        <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 max-h-[420px] overflow-y-auto">
          {list.map((t) => (
            <div key={t.term} className="border-t border-white/6 pt-3 first:border-0 first:pt-0">
              <p className="text-xs font-semibold text-secondary capitalize">{t.term}</p>
              <p className="text-xs text-text-muted leading-relaxed mt-0.5">{t.definition}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
