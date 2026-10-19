import { VulnerabilityRadar } from '@/components/charts/LazyCharts';
import { TransmissionWaterfall } from '@/components/charts/StaticCharts';
import { WhatThisMeans } from '@/components/ui/SimpleMode';
import type { Applicability } from '@/lib/applicability';
import { formatPts } from '@/lib/format';
import { CHART_DESCRIPTIONS } from '@/lib/simpleMode';
import { crystalFromAnalysis } from '@/lib/transmission';
import type { FullAnalysis } from '@/types';
import {
  CAPEX_LABEL, LEVERAGE_LABEL, PROFIT_LABEL, better, money, pct, radarData, simpleSummary, titleCase, waterfallLevels,
} from './detailModel';
import { Pane, SectorIndicator, StatRow } from './parts';
import { CrystalView, NoPicture, TerrainView } from './visuals';

/*
 * Economic Context, macro → corporate → personal: the transmission
 * waterfall, the macro indicators and the sector's response; the
 * vulnerability profile as a faceted crystal (CrystalView) beside its
 * radar chart, a pair of equal height; the spending pressure as a terrain of tiles
 * (TerrainView) whose caption is the heatmap that prints every figure; and
 * the personal figures. Each 3D view states its figures in the DOM, each
 * chart keeps its caption (and "View as table"), and an analysis without
 * scores gets one honest empty state for the pair.
 */

export default function EconomicTab({ a, simple, income, applies }: { a: FullAnalysis; simple: boolean; income: number; applies: Applicability }) {
  const { macro, corporate, personal } = a;
  const waterfall = waterfallLevels(a, simple, income);
  const radar = radarData(a, simple);
  // The same rule as the crystal (crystalFromAnalysis): all six at 0 means the analysis scored nothing.
  const scored = crystalFromAnalysis(a).length > 0;
  // A score of 0 is what a missing one becomes: shown as not rated, never as good news.
  const uncertainty = macro.economicUncertaintyScore;
  const vulnerabilityTitle = simple ? 'Where this hits you hardest' : 'Your Vulnerability Profile';
  const vulnerabilityLede = simple ? CHART_DESCRIPTIONS.radar : 'How exposed you are to this policy across six dimensions (higher = more pressure).';

  return (
    <div className="space-y-6">
      {simple && <WhatThisMeans text={simpleSummary(a, 'macro')} />}

      <Pane
        title={simple ? 'How this reaches your wallet' : 'Economic Transmission'}
        lede={simple ? CHART_DESCRIPTIONS.waterfall : 'How the policy flows from the macro economy, through your employment sector, down to your personal finances.'}
      >
        <TransmissionWaterfall levels={waterfall} />
      </Pane>

      <div className="grid gap-6 lg:grid-cols-2">
        <Pane title={simple ? 'The big picture' : 'Macroeconomic Indicators'}>
          <StatRow label={simple ? 'How healthy the economy gets' : 'GDP impact'} value={pct(macro.gdpImpactPct)} positive={better(macro.gdpImpactPct)} />
          <StatRow label={simple ? 'How fast prices rise' : 'Inflation (CPI/PCE)'} value={pct(macro.inflationImpactPct)} positive={better(macro.inflationImpactPct, 'down')} />
          <StatRow label={simple ? 'How unpredictable things get' : 'Economic uncertainty'} value={uncertainty > 0 ? `${uncertainty}/100` : 'Not rated'} positive={uncertainty > 0 ? uncertainty <= 50 : undefined} />
          {macro.gdpExplanation && <p className="mt-3 text-xs leading-relaxed text-muted">{macro.gdpExplanation}</p>}
          {macro.inflationExplanation && <p className="mt-2 text-xs leading-relaxed text-muted">{macro.inflationExplanation}</p>}
          {macro.uncertaintyExplanation && <p className="mt-2 text-xs leading-relaxed text-muted">{macro.uncertaintyExplanation}</p>}
          {macro.balanceOfPaymentsEffect && <p className="mt-2 text-xs leading-relaxed text-muted">{macro.balanceOfPaymentsEffect}</p>}
        </Pane>

        <Pane title={simple ? 'Your industry’s health' : `Sector Response — ${titleCase(corporate.sector)}`}>
          {simple && <WhatThisMeans text={simpleSummary(a, 'corporate')} />}
          <div className="mt-3 space-y-2.5">
            <SectorIndicator label={simple ? 'Hiring & investment' : 'Capital expenditure'} value={CAPEX_LABEL[corporate.capexDirection].text} dir={CAPEX_LABEL[corporate.capexDirection].dir} />
            <SectorIndicator label={simple ? 'Job security' : 'Financial leverage'} value={LEVERAGE_LABEL[corporate.leverageEffect].text} dir={LEVERAGE_LABEL[corporate.leverageEffect].dir} />
            <SectorIndicator label={simple ? 'Profitability' : 'Profitability (ROA/ROE)'} value={PROFIT_LABEL[corporate.profitabilityTrend].text} dir={PROFIT_LABEL[corporate.profitabilityTrend].dir} />
            <SectorIndicator label={simple ? 'Effect on savings & stocks' : 'Equity portfolio'} value={corporate.equityImpactRange || pct(corporate.equityPortfolioImpactPct)} dir={corporate.equityPortfolioImpactPct > 0 ? 'positive' : corporate.equityPortfolioImpactPct < 0 ? 'negative' : 'neutral'} />
          </div>
          {corporate.capexExplanation && <p className="mt-3 text-xs leading-relaxed text-muted">{corporate.capexExplanation}</p>}
        </Pane>
      </div>

      {/* Vulnerability: the crystal (its six scores printed under it) beside the radar chart of the same scores,
          one pair of equal height. The vitrine stands straight on the page: its view shows through it from the
          stage behind the page, which a pane's paper would hide. */}
      {scored ? (
        <div className="grid gap-6 lg:grid-cols-[5fr_7fr]">
          <CrystalView a={a} simple={simple} />
          <Pane title={vulnerabilityTitle} lede={vulnerabilityLede} className="flex flex-col">
            <div className="flex flex-1 flex-col justify-center">
              <VulnerabilityRadar data={radar} height={400} title={simple ? 'Where this hits you hardest' : 'Vulnerability profile'} />
            </div>
          </Pane>
        </div>
      ) : (
        <Pane title={vulnerabilityTitle} lede={vulnerabilityLede}>
          {/* The crystal's rule for the chart too: no scores is an empty state, never a radar of zeros. */}
          <NoPicture>This analysis has no vulnerability scores, so there is no crystal or chart to draw.</NoPicture>
        </Pane>
      )}

      {/* Spending: the terrain of tiles, with the heatmap that prints every category's figure as its caption. */}
      <TerrainView
        a={a}
        title={simple ? 'What gets cheaper or pricier' : 'Spending Category Pressure'}
        lede={simple ? CHART_DESCRIPTIONS.heatmap : 'Monthly dollar pressure per spending category — teal saves you money, amber costs more.'}
      />

      <Pane title={simple ? 'The bottom line for you' : 'Personal Financial Data'}>
        <div className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <StatRow label={simple ? 'Spendable money each month' : 'Disposable income'} value={money(personal.disposableIncomeMonthly, '/mo')} positive={better(personal.disposableIncomeMonthly)} cue={personal.disposableIncomeMonthly} kind="income" />
            <StatRow label={simple ? 'Your net worth (1 year)' : 'Net worth (1yr)'} value={pct(personal.netWorthChange1yrPct)} positive={better(personal.netWorthChange1yrPct)} />
            <StatRow label={simple ? 'Your net worth (3 years)' : 'Net worth (3yr)'} value={pct(personal.netWorthChange3yrPct)} positive={better(personal.netWorthChange3yrPct)} />
            {(applies.homeEquity || personal.realEstateEquityDollar !== 0) && (
              <StatRow label={simple ? 'Change in your home’s value' : 'Real estate equity change'} value={money(personal.realEstateEquityDollar)} positive={better(personal.realEstateEquityDollar)} />
            )}
          </div>
          <div>
            <StatRow label={simple ? 'How much more you can save' : 'Savings rate change'} value={formatPts(personal.savingsRateChangePct)} positive={better(personal.savingsRateChangePct)} />
            {(applies.debt || personal.debtToIncomeChangePct !== 0) && (
              <StatRow label={simple ? 'Share of paycheck going to debt' : 'Debt-to-income change'} value={formatPts(personal.debtToIncomeChangePct)} positive={better(personal.debtToIncomeChangePct, 'down')} />
            )}
            {applies.debt && personal.debtImpacts.slice(0, 4).map((d, i) => (
              <StatRow key={i} label={d.label} value={money(d.value)} positive={d.value >= 0} cue={d.value} />
            ))}
          </div>
        </div>
        {personal.savingsRateExplanation && <p className="mt-4 text-xs leading-relaxed text-muted">{personal.savingsRateExplanation}</p>}
        {/* Precautionary index */}
        <div className="mt-5 border-t border-fg/8 pt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-ink">{simple ? 'Should you build up emergency savings?' : 'Precautionary behavior index'}</span>
            <span className="font-mono-data text-sm font-bold text-ink">{personal.precautionaryIndex}/100</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-fg/6" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-civic" style={{ width: `${Math.max(0, Math.min(100, personal.precautionaryIndex))}%` }} />
          </div>
          {personal.precautionaryExplanation && <p className="mt-3 text-xs leading-relaxed text-muted">{personal.precautionaryExplanation}</p>}
        </div>
      </Pane>
    </div>
  );
}
