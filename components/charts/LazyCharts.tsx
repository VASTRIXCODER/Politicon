'use client';

import dynamic from 'next/dynamic';
import { createContext, useContext, type ComponentProps, type ComponentType } from 'react';

/*
 * Code-split versions of the Recharts charts in ./Charts. Recharts (~120 KB
 * gzipped) is only downloaded when a chart actually renders, e.g. when its tab
 * is opened, instead of with the page. Each chart reserves its final height
 * while loading, so nothing below it jumps.
 */

// Room for the caption row ChartFigure draws under the chart (mt-3 + one line + toggle).
const CAPTION_SPACE = 40;

/** The height of the chart being loaded (next/dynamic's `loading` gets none of the chart's props). */
const ChartHeight = createContext(300);

function ChartLoading() {
  const height = useContext(ChartHeight);
  return (
    <div role="status" className="flex flex-col" style={{ minHeight: height + CAPTION_SPACE }}>
      <div className="flex-1 rounded-2xl bg-white/4 motion-safe:animate-pulse" />
      <div className="mt-3 h-6 w-2/3 rounded-lg bg-white/4 motion-safe:animate-pulse" />
      <span className="sr-only">Loading chart…</span>
    </div>
  );
}

/**
 * Tells the skeleton the chart's height, so it holds that space (plus caption)
 * while the chunk loads. Only the skeleton reserves it: once loaded, the figure
 * sizes itself, so a short "View as table" or empty state leaves no gap.
 */
function sized<P extends { height?: number }>(Chart: ComponentType<P>, defaultHeight: number) {
  function SizedChart(props: P) {
    return (
      <ChartHeight.Provider value={props.height ?? defaultHeight}>
        <Chart {...props} />
      </ChartHeight.Provider>
    );
  }
  return SizedChart;
}

type Charts = typeof import('./Charts');

const LazyCategoryImpactBar = dynamic(() => import('./Charts').then((m) => m.CategoryImpactBar), { ssr: false, loading: ChartLoading });
const LazyImpactDonut = dynamic(() => import('./Charts').then((m) => m.ImpactDonut), { ssr: false, loading: ChartLoading });
const LazyMonthlyTimeline = dynamic(() => import('./Charts').then((m) => m.MonthlyTimeline), { ssr: false, loading: ChartLoading });
const LazyProjectionBars = dynamic(() => import('./Charts').then((m) => m.ProjectionBars), { ssr: false, loading: ChartLoading });
const LazyBeforeAfterBar = dynamic(() => import('./Charts').then((m) => m.BeforeAfterBar), { ssr: false, loading: ChartLoading });
const LazyCumulativeStackedBar = dynamic(() => import('./Charts').then((m) => m.CumulativeStackedBar), { ssr: false, loading: ChartLoading });
const LazyCumulativeProjectionLines = dynamic(() => import('./Charts').then((m) => m.CumulativeProjectionLines), { ssr: false, loading: ChartLoading });
const LazyVulnerabilityRadar = dynamic(() => import('./Charts').then((m) => m.VulnerabilityRadar), { ssr: false, loading: ChartLoading });

export const CategoryImpactBar = sized<ComponentProps<Charts['CategoryImpactBar']>>(LazyCategoryImpactBar, 300);
export const ImpactDonut = sized<ComponentProps<Charts['ImpactDonut']>>(LazyImpactDonut, 300);
export const MonthlyTimeline = sized<ComponentProps<Charts['MonthlyTimeline']>>(LazyMonthlyTimeline, 300);
export const ProjectionBars = sized<ComponentProps<Charts['ProjectionBars']>>(LazyProjectionBars, 280);
export const BeforeAfterBar = sized<ComponentProps<Charts['BeforeAfterBar']>>(LazyBeforeAfterBar, 260);
export const CumulativeStackedBar = sized<ComponentProps<Charts['CumulativeStackedBar']>>(LazyCumulativeStackedBar, 320);
export const CumulativeProjectionLines = sized<ComponentProps<Charts['CumulativeProjectionLines']>>(LazyCumulativeProjectionLines, 340);
export const VulnerabilityRadar = sized<ComponentProps<Charts['VulnerabilityRadar']>>(LazyVulnerabilityRadar, 320);
