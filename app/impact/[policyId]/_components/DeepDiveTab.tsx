'use client';

import { useState } from 'react';
import { Briefcase, ChevronDown, GraduationCap, Heart, Home, Landmark, PiggyBank, Waves } from 'lucide-react';
import IconTile from '@/components/ui/IconTile';
import Surface from '@/components/ui/Surface';
import { cn } from '@/lib/utils';
import type { FullAnalysis } from '@/types';
import { deepDiveRows } from './detailModel';
import { StatRow } from './parts';
import styles from './detail.module.css';

/*
 * Deep Dive: one disclosure per area of life (housing first, open), each
 * with the analysis's own figures for it. The figures fade in as a section
 * opens (CSS, still under reduced motion and "Pause motion").
 */

const SECTION_DEFS = [
  { key: 'housing', title: 'Housing', icon: Home },
  { key: 'employment', title: 'Employment', icon: Briefcase },
  { key: 'healthcare', title: 'Healthcare', icon: Heart },
  { key: 'retirement', title: 'Retirement', icon: PiggyBank },
  { key: 'education', title: 'Education', icon: GraduationCap },
  { key: 'tax', title: 'Taxes', icon: Landmark },
  { key: 'ripple', title: 'Ripple Effects', icon: Waves },
] as const;

export default function DeepDiveTab({ a }: { a: FullAnalysis }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ housing: true });

  return (
    <div className="space-y-3">
      {SECTION_DEFS.map(({ key, title, icon }) => {
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
                <span className="flex-1 font-display text-base font-medium text-ink">{title}</span>
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
