import { MonthlyTimeline, ProjectionBars } from '@/components/charts/LazyCharts';
import { WhatThisMeans } from '@/components/ui/SimpleMode';
import { impactTone } from '@/lib/format';
import { CHART_DESCRIPTIONS } from '@/lib/simpleMode';
import { cn } from '@/lib/utils';
import type { FullAnalysis } from '@/types';
import { milestones, money, simpleSummary } from './detailModel';
import { Pane } from './parts';
import { RibbonView } from './visuals';

/*
 * Timeline: the year one ribbon (RibbonView: twelve months of the
 * cumulative estimate, its width the model's uncertainty, with a month
 * control as the keyboard way in), then the month-by-month chart, the
 * 1/3/5-year projections (the analysis's own timeline.year1/3/5) and the
 * milestones.
 */

export default function TimelineTab({ a, simple }: { a: FullAnalysis; simple: boolean }) {
  const steps = milestones(a, simple);
  return (
    <div className="space-y-6">
      {simple && <WhatThisMeans text={simpleSummary(a, 'personal')} />}

      <RibbonView a={a} simple={simple} />

      <Pane
        title={simple ? 'How it adds up over your first year' : 'Year one, month by month'}
        lede={simple ? CHART_DESCRIPTIONS.timeline : 'Cumulative dollar impact as the policy takes effect.'}
      >
        <MonthlyTimeline data={a.timeline.monthly} height={320} title={simple ? 'How it adds up over your first year' : 'Year one, month by month'} />
      </Pane>

      <div className="grid gap-6 lg:grid-cols-2">
        <Pane title={simple ? 'Where you stand in 1, 3 and 5 years' : '1 / 3 / 5-year cumulative'}>
          <ProjectionBars year1={a.timeline.year1} year3={a.timeline.year3} year5={a.timeline.year5} height={280} title="Cumulative impact after 1, 3 and 5 years" />
        </Pane>

        <Pane title="Milestones">
          <div className="relative pl-6">
            <div className="absolute bottom-1 left-[7px] top-1 w-px bg-fg/10" aria-hidden />
            <ol>
              {steps.map((ms, i) => (
                <li key={i} className="relative mb-5 last:mb-0">
                  <div
                    aria-hidden
                    className={cn(
                      'absolute -left-[22px] top-0.5 h-3.5 w-3.5 rounded-full border-2',
                      ms.value >= 0 ? 'border-gain-fill bg-gain-fill/20' : 'border-loss-fill bg-loss-fill/20'
                    )}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{ms.label}</span>
                    <span className={cn('font-mono-data text-sm font-semibold', impactTone(ms.value))}>{money(ms.value)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Pane>
      </div>
    </div>
  );
}
