import { BeforeAfterBar, CategoryImpactBar, ImpactDonut } from '@/components/charts/LazyCharts';
import { WhatThisMeans } from '@/components/ui/SimpleMode';
import { CHART_DESCRIPTIONS } from '@/lib/simpleMode';
import type { FullAnalysis } from '@/types';
import { costRow, money, simpleSummary } from './detailModel';
import { Pane, StatRow } from './parts';

/*
 * Financial Breakdown: the annual impact by category, its proportions, and
 * the effective tax rate before and after, with the paycheck and tax lines.
 * Every chart keeps its caption and "View as table".
 */

export default function BreakdownTab({ a, categoryBars, simple }: {
  a: FullAnalysis; categoryBars: { name: string; value: number; color?: string }[]; simple: boolean;
}) {
  // ImpactDonut picks a palette colour for any slice without one.
  const donutData = categoryBars.map((c) => ({ name: c.name, value: c.value, color: c.color || '' }));
  const beforeAfter = [{ label: 'Effective Tax Rate', before: a.tax.effectiveRateBefore, after: a.tax.effectiveRateAfter }];
  return (
    <div className="space-y-6">
      {simple && <WhatThisMeans text={simpleSummary(a, 'personal')} />}
      <Pane title="Annual Impact by Category" lede={simple ? CHART_DESCRIPTIONS.category : undefined}>
        <CategoryImpactBar data={categoryBars} height={320} title="Annual impact by category" />
      </Pane>

      <div className="grid gap-6 lg:grid-cols-2">
        <Pane title="Proportion of Impact">
          <ImpactDonut data={donutData} height={320} title="Proportion of impact by category" />
        </Pane>

        <Pane title="Before vs After — Effective Tax Rate">
          <BeforeAfterBar items={beforeAfter} unit="%" height={240} title="Effective tax rate before and after" />
          <div className="mt-4">
            <StatRow label="Take-home per paycheck" value={money(a.immediate.takeHomePerPaycheck)} positive={a.immediate.takeHomePerPaycheck >= 0} cue={a.immediate.takeHomePerPaycheck} kind="income" />
            <StatRow label="Monthly budget" value={money(a.immediate.monthlyBudgetImpact, '/mo')} positive={a.immediate.monthlyBudgetImpact >= 0} cue={a.immediate.monthlyBudgetImpact} />
            <StatRow {...costRow('Federal income tax', a.tax.federalLiabilityChange)} />
            <StatRow {...costRow('State income tax', a.tax.stateLiabilityChange)} />
          </div>
        </Pane>
      </div>
    </div>
  );
}
