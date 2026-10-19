'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Surface from '@/components/ui/Surface';
import { cn } from '@/lib/utils';
import { METHODOLOGY } from './impactModel';

/** How the figures are made, as an accordion of plain answers (one open at a time). */
export default function Methodology() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Surface as="section" pad="lg" aria-labelledby="impact-method" className="mt-12">
      <h2 id="impact-method" className="mb-6 font-display text-xl font-medium text-ink sm:text-2xl">
        Methodology &amp; <em>transparency</em>
      </h2>
      <div className="space-y-3">
        {METHODOLOGY.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className="overflow-hidden rounded-tile border border-fg/8 bg-fg/[0.03]">
              <h3>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`method-${i}`}
                  className="flex w-full items-center justify-between gap-3 rounded-tile p-5 text-left"
                >
                  <span className="text-sm font-medium text-ink">{item.q}</span>
                  <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-muted transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                </button>
              </h3>
              <div id={`method-${i}`} hidden={!isOpen} className="px-5 pb-5">
                <p className="text-sm leading-relaxed text-muted">{item.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Surface>
  );
}
