'use client';

import { useId, useMemo, useRef, useState } from 'react';
import SceneView from '@/components/three/SceneView';
import TransmissionHero from '@/components/three/scenes/TransmissionHero.lazy';
import FlowSankey from '@/components/three/scenes/FlowSankey.lazy';
import TimelineRibbon from '@/components/three/scenes/TimelineRibbon.lazy';
import VulnerabilityCrystal from '@/components/three/scenes/VulnerabilityCrystal.lazy';
import SpendingTerrain from '@/components/three/scenes/SpendingTerrain.lazy';
import TransmissionPoster from '@/components/impact/posters/TransmissionPoster';
import FlowPoster from '@/components/impact/posters/FlowPoster';
import RibbonPoster from '@/components/impact/posters/RibbonPoster';
import CrystalPoster from '@/components/impact/posters/CrystalPoster';
import TerrainPoster from '@/components/impact/posters/TerrainPoster';
import FlowMarks from '@/components/impact/posters/FlowMarks';
import ViewMarks, { MARK_BADGE } from '@/components/impact/posters/ViewMarks';
import { SpendingHeatmap } from '@/components/charts/StaticCharts';
import { formatUSD, impactWords } from '@/lib/format';
import {
  CRYSTAL_DIRECTION,
  CRYSTAL_VIEW,
  RIBBON_LEGEND,
  TERRAIN_VIEW,
  ribbonBandShare,
  crystalFromAnalysis,
  crystalMarks,
  crystalScaleNote,
  crystalViewBox,
  describeCrystal,
  describeFlows,
  describeRibbon,
  describeTerrain,
  describeTransmission,
  flowScaleNote,
  flowTotals,
  flowsFromAnalysis,
  ribbonFromAnalysis,
  ribbonScaleNote,
  ribbonUncertainty,
  terrainFromAnalysis,
  terrainLayout,
  terrainMarks,
  terrainScaleNote,
  terrainViewBox,
  type TransmissionTone,
} from '@/lib/transmission';
import { cn } from '@/lib/utils';
import type { FullAnalysis } from '@/types';
import { Chamber, Kicker, LegendItem } from './parts';

/*
 * The impact page's 3D views, each a SceneView on the shared stage (its
 * server-drawn poster before and without 3D) inside a small Chamber, with
 * the DOM that carries its meaning beside it: what it shows, its scale in
 * words and the figures it draws. The canvas is decoration (aria-hidden);
 * the SceneView's label and these captions say the same in words. Every
 * picture is bound to the analysis's own fields through lib/transmission
 * (the same mappers the scenes and posters read), and an analysis without
 * the data for one gets an honest empty state, never a picture of zeros.
 *
 * None of these views take pointer input; the one control (the timeline's
 * month) is a DOM range input, so the keyboard reaches everything. (Pointing
 * at a row of the flow's list, the crystal's scores or the terrain's
 * heatmap lights the same thing in the picture: a convenience; the numbers
 * laid over the views, matching the rows' numbers, say the same to everyone.)
 */

/** A channel's number badge: its direction's colour as a ring and a tint. */
const TONE_BADGE: Record<TransmissionTone, string> = {
  gain: 'border-gain-fill bg-gain-fill/20',
  loss: 'border-loss-fill bg-loss-fill/20',
  neutral: 'border-fg/30 bg-fg/10',
};
const TONE_TEXT: Record<TransmissionTone, string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  neutral: 'text-muted',
};

const yearly = (n: number) => formatUSD(n, { signed: true, suffix: '/yr' });
const toneOfValue = (n: number): TransmissionTone => (Math.round(n) > 0 ? 'gain' : Math.round(n) < 0 ? 'loss' : 'neutral');

/** The legend every money picture shares: the two directions, in words. */
function MoneyLegend({ neutral }: { neutral?: string }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-meta text-muted">
      <LegendItem swatch="bg-gain-fill">Teal saves you money</LegendItem>
      <LegendItem swatch="bg-loss-fill">Amber costs you</LegendItem>
      {/* The scenes' porcelain, dimmed by night as they draw it. */}
      {neutral && <LegendItem swatch="bg-porcelain/70">{neutral}</LegendItem>}
    </ul>
  );
}

/** Where a picture (or a chart) would be when the analysis has nothing for it to draw. */
export function NoPicture({ children }: { children: string }) {
  return (
    <div className="flex aspect-[16/9] items-center justify-center rounded-pane border border-dashed border-fg/15 px-6 text-center">
      <p className="max-w-xs text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The hero: the bill sheet resolving into the net
// ---------------------------------------------------------------------------

export function HeroView({ a }: { a: FullAnalysis }) {
  // The gold seal is the official record's: only a verified record gets it. So is the stage: an
  // unverified analysis's status is the model's guess, so it never lights the column "in effect".
  const verified = !!a.record?.verified;
  const status = verified ? a.status : undefined;
  const props = { netAnnualImpact: a.netAnnualImpact, status, title: a.policyTitle, verified };
  return (
    <SceneView eager className="aspect-[10/9] w-full lg:aspect-[16/9]" label={describeTransmission(props)} poster={<TransmissionPoster netAnnualImpact={a.netAnnualImpact} status={status} verified={verified} />}>
      <TransmissionHero {...props} />
    </SceneView>
  );
}

// ---------------------------------------------------------------------------
// Overview: the flow from the bill into each part of the budget
// ---------------------------------------------------------------------------

/** The flow view's box shape (its aspect-[16/9] class), for the channel numbers laid over it. */
const FLOW_ASPECT = 16 / 9;

export function FlowView({ a }: { a: FullAnalysis }) {
  const flows = useMemo(() => flowsFromAnalysis(a), [a]);
  const totals = flowTotals(flows);
  const verified = !!a.record?.verified;
  const headingId = useId();
  // The row pointed at: its channel lights in the view.
  const [hover, setHover] = useState<string | null>(null);

  return (
    <Chamber
      side
      caption={
        <>
          <h3 id={headingId} className="font-display text-lg font-medium leading-snug text-ink">Where the money goes</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted [text-wrap:pretty]">{flowScaleNote(flows)}</p>
          {flows.length > 0 && (
            <>
              <ul aria-labelledby={headingId} className="mt-4 divide-y divide-fg/8" onPointerLeave={() => setHover(null)}>
                {flows.map((f, i) => (
                  <li
                    key={f.id}
                    onPointerEnter={() => setHover(f.id)}
                    className={cn('-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors duration-200 ease-civic', hover === f.id && 'bg-fg/5')}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                      {/* The channel's number beside the view (FlowMarks), in its direction's colour. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-[1.125rem] flex-shrink-0 items-center justify-center rounded-full border font-mono-data text-[0.625rem] font-semibold leading-none text-ink',
                          TONE_BADGE[f.tone]
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 truncate" title={f.label}>{f.label}</span>
                    </span>
                    <span className={cn('text-right font-mono-data text-sm font-semibold', TONE_TEXT[f.tone])}>
                      {yearly(f.value)}
                      <span className="block text-meta font-normal text-muted">{impactWords(f.value)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex items-baseline justify-between gap-3 border-t-[3px] border-double border-fg/20 pt-3">
                <span className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Your net</span>
                <span className={cn('text-right font-mono-data text-base font-semibold', TONE_TEXT[totals.net > 0 ? 'gain' : totals.net < 0 ? 'loss' : 'neutral'])}>
                  {yearly(totals.net)} <span className="text-meta font-normal text-muted">· {impactWords(totals.net)}</span>
                </span>
              </p>
              <MoneyLegend />
            </>
          )}
        </>
      }
    >
      {flows.length > 0 ? (
        <div className="relative">
          <SceneView className="aspect-[16/9] w-full" label={describeFlows(flows)} poster={<FlowPoster flows={flows} verified={verified} focus={hover} />}>
            <FlowSankey flows={flows} verified={verified} focus={hover} />
          </SceneView>
          <FlowMarks flows={flows} aspect={FLOW_ASPECT} focus={hover} />
        </div>
      ) : (
        <NoPicture>This analysis has no yearly amounts by category, so there is no flow to draw.</NoPicture>
      )}
    </Chamber>
  );
}

// ---------------------------------------------------------------------------
// Timeline: year one as a glass ribbon, its width the uncertainty
// ---------------------------------------------------------------------------

/** The key's height for the widest ribbon, in px. */
const KEY_PX = 22;

/**
 * The ribbon's widths side by side, in proportion to the scene's
 * (lib/transmission ribbonBandShare): a sure estimate's, this one's, and
 * the widest (unrated). Each with the line of light through its middle, as
 * the ribbon has. Decoration: the sentence beside it says the same.
 */
function WidthKey({ uncertainty, rated }: { uncertainty: number; rated: boolean }) {
  const items = [
    { label: 'Sure', u: 0, current: false },
    { label: 'This estimate', u: uncertainty, current: true },
    ...(rated ? [{ label: 'Unrated', u: 1, current: false }] : []),
  ];
  return (
    <div aria-hidden="true" data-decorative="" className="mt-2.5 flex items-start gap-5">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col items-center gap-1">
          <span className="relative flex w-9 items-center" style={{ height: KEY_PX }}>
            <span
              className={cn('w-full rounded-[3px]', it.current ? 'bg-primary/60 ring-1 ring-primary-300/60' : 'bg-primary/25')}
              style={{ height: Math.max(2, Math.round(ribbonBandShare(it.u) * KEY_PX)) }}
            />
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink/70" />
          </span>
          <span className={cn('text-[0.6875rem] leading-none', it.current ? 'font-medium text-ink' : 'text-muted')}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export function RibbonView({ a, simple }: { a: FullAnalysis; simple: boolean }) {
  const points = useMemo(() => ribbonFromAnalysis(a), [a]);
  // The month picked out (null: the whole year, nothing lit).
  const [focus, setFocus] = useState<number | null>(null);
  const sliderId = useId();
  const slider = useRef<HTMLInputElement>(null);
  const { uncertainty, rated } = ribbonUncertainty(a.confidenceScore);
  const first = points[0];
  const last = points[points.length - 1];
  const shown = points.find((p) => p.month === focus) ?? last;
  const valueText = (month: number) => {
    const p = points.find((x) => x.month === month);
    return p ? `Month ${p.month}: ${formatUSD(p.value, { signed: true })} so far, ${impactWords(p.value)}` : `Month ${month}`;
  };

  return (
    <Chamber
      side
      caption={
        <>
          <h3 className="font-display text-lg font-medium leading-snug text-ink">
            {simple ? 'Your first year, month by month' : 'Year one as a ribbon'}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted [text-wrap:pretty]">{ribbonScaleNote(points)}</p>

          {/* Confidence as width: the uncertainty is drawn, and said; the key draws the widths in proportion. */}
          <div className="mt-4 rounded-tile border border-fg/8 bg-fg/4 px-3 py-2.5">
            <p className="text-meta leading-relaxed text-muted">
              <span className="font-medium text-ink">{RIBBON_LEGEND.title}</span> — {RIBBON_LEGEND.wider}. It is the same all year, and isn’t a range of dollars.{' '}
              {rated
                ? <>This estimate’s confidence is <span className="font-mono-data text-ink">{Math.round(a.confidenceScore)}/100</span> (model-rated): an uncertainty of {Math.round(uncertainty * 100)}%.</>
                : 'This estimate’s confidence wasn’t rated, so the ribbon is drawn at its widest.'}
            </p>
            <WidthKey uncertainty={uncertainty} rated={rated} />
          </div>

          {points.length > 0 && first && last && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={sliderId} className="text-sm font-medium text-ink">Look at a month</label>
                {/* Always mounted, so pressing it never drops focus: it hands focus to the month control
                    and goes quiet (aria-disabled) while the whole year is shown. */}
                <button
                  type="button"
                  aria-disabled={focus === null || undefined}
                  onClick={() => {
                    if (focus === null) return;
                    setFocus(null);
                    slider.current?.focus();
                  }}
                  className={cn(
                    '-my-1 inline-flex min-h-6 items-center rounded-md px-1 text-meta font-medium underline-offset-2',
                    focus === null ? 'cursor-default text-muted' : 'text-primary-300 hover:underline'
                  )}
                >
                  Show the whole year
                </button>
              </div>
              <input
                ref={slider}
                id={sliderId}
                type="range"
                min={first.month}
                max={last.month}
                step={1}
                value={focus ?? last.month}
                onChange={(e) => setFocus(Number(e.currentTarget.value))}
                aria-valuetext={valueText(focus ?? last.month)}
                className="mt-2 h-6 w-full cursor-pointer accent-primary"
              />
              {/* The running total with its own words, then (a month picked) that month's change on its own line, in its own tone. */}
              <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">
                  {focus === null ? `By month ${shown.month}` : `Month ${shown.month}`}
                </span>
                <span className={cn('font-mono-data text-base font-semibold', TONE_TEXT[toneOfValue(shown.value)])}>
                  {formatUSD(shown.value, { signed: true })} so far
                  <span className="ml-1.5 text-meta font-normal text-muted">· {impactWords(shown.value)}</span>
                </span>
              </p>
              {focus !== null && (
                <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">This month</span>
                  <span className={cn('font-mono-data text-sm font-semibold', TONE_TEXT[toneOfValue(shown.delta)])}>
                    {formatUSD(shown.delta, { signed: true })}
                    <span className="ml-1.5 text-meta font-normal">· {impactWords(shown.delta)}</span>
                  </span>
                </p>
              )}
            </div>
          )}
        </>
      }
    >
      {points.length > 0 ? (
        <SceneView
          className="aspect-[16/9] w-full"
          label={describeRibbon(points, a.confidenceScore, focus)}
          poster={<RibbonPoster points={points} focus={focus} />}
        >
          <TimelineRibbon points={points} focus={focus} />
        </SceneView>
      ) : (
        <NoPicture>This analysis has no month-by-month amounts, so there is no ribbon to draw.</NoPicture>
      )}
    </Chamber>
  );
}

// ---------------------------------------------------------------------------
// Economic context: the vulnerability crystal and the spending terrain
// ---------------------------------------------------------------------------

/** The crystal's box shape (its aspect-square class), for the axis numbers laid over it. */
const CRYSTAL_ASPECT = 1;

export function CrystalView({ a, simple }: { a: FullAnalysis; simple: boolean }) {
  const axes = useMemo(() => crystalFromAnalysis(a, { simple }), [a, simple]);
  const listId = useId();
  // The score pointed at: its spoke lights in the view.
  const [hover, setHover] = useState<string | null>(null);
  const marks = useMemo(() => crystalMarks(axes.length).map((at, i) => ({ id: axes[i].axis, at, tone: 'violet' as const })), [axes]);
  const box = useMemo(crystalViewBox, []);
  return (
    <Chamber
      caption={
        <>
          <Kicker>{simple ? 'Where the pressure is' : 'The vulnerability crystal'}</Kicker>
          <p className="mt-1.5 text-xs leading-relaxed text-muted [text-wrap:pretty]">{crystalScaleNote()}</p>
          {axes.length > 0 && (
            <>
              {/* The list's key: every score below reads as a risk ("Income stability 38" is moderately at risk, not stable). */}
              <p id={listId} className="mt-3 font-mono-data text-meta uppercase tracking-[0.14em] text-muted">
                Risk scores, out of 100 · {CRYSTAL_DIRECTION.toLowerCase()}
              </p>
              <dl aria-labelledby={listId} className="mt-2 grid grid-cols-1 gap-x-5 gap-y-0.5 min-[420px]:grid-cols-2" onPointerLeave={() => setHover(null)}>
                {axes.map((x, i) => (
                  <div
                    key={x.axis}
                    onPointerEnter={() => setHover(x.axis)}
                    className={cn('-mx-1.5 flex items-baseline justify-between gap-3 rounded-md px-1.5 py-1 transition-colors duration-200 ease-civic', hover === x.axis && 'bg-fg/5')}
                  >
                    <dt className="flex min-w-0 items-baseline gap-2 text-meta text-muted">
                      {/* The axis's number over the view (ViewMarks). */}
                      <span aria-hidden="true" className={cn(MARK_BADGE, 'translate-y-[0.2rem] border-primary-300 bg-primary/15')}>{i + 1}</span>
                      <span className="min-w-0">{x.label}</span>
                    </dt>
                    <dd className="font-mono-data text-sm font-semibold text-ink">{x.score}<span className="text-meta font-normal text-muted">/100</span></dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </>
      }
    >
      {axes.length > 0 ? (
        <div className="relative">
          <SceneView className="aspect-square w-full" label={describeCrystal(axes)} poster={<CrystalPoster axes={axes} focus={hover} />}>
            <VulnerabilityCrystal axes={axes} focus={hover} />
          </SceneView>
          <ViewMarks marks={marks} box={box} view={CRYSTAL_VIEW} aspect={CRYSTAL_ASPECT} focus={hover} />
        </div>
      ) : (
        <NoPicture>This analysis has no vulnerability scores, so there is no crystal to draw.</NoPicture>
      )}
    </Chamber>
  );
}

/**
 * The spending terrain as a full-width vitrine: the scene, and beside it (on
 * wide screens) a plate with its title, its scale in words and the heatmap
 * that prints every category's monthly figure, one composition rather than
 * two panes saying the same thing. The heatmap's tokens follow the night
 * plate, so its teal, amber and text stay AA there.
 */
/** The terrain's box shape (its aspect-[4/3] class), for the tile numbers laid over it. */
const TERRAIN_ASPECT = 4 / 3;

export function TerrainView({ a, title, lede }: { a: FullAnalysis; title?: string; lede?: string }) {
  const cells = useMemo(() => terrainFromAnalysis(a), [a]);
  // The heatmap cell pointed at: its tile lights in the view.
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => terrainLayout(cells), [cells]);
  const box = useMemo(() => terrainViewBox(layout), [layout]);
  const marks = useMemo(() => terrainMarks(layout), [layout]);
  // The heatmap prints the terrain's own cells (one per category, in the same order), numbered as the tiles are.
  const items = useMemo(() => cells.map((c) => ({ id: c.id, category: c.label, dollarImpact: c.value })), [cells]);
  return (
    <Chamber
      side
      caption={
        <>
          <Kicker>The spending terrain</Kicker>
          {title && <h3 className="mt-1.5 font-display text-lg font-medium leading-snug text-ink">{title}</h3>}
          {lede && <p className="mt-1 text-xs leading-relaxed text-muted [text-wrap:pretty]">{lede}</p>}
          <p className="mt-1.5 text-xs leading-relaxed text-muted [text-wrap:pretty]">{terrainScaleNote(cells)}</p>
          {cells.length > 0 && (
            <>
              <MoneyLegend neutral="Flat porcelain: no change" />
              <div className="mt-4">
                <SpendingHeatmap items={items} numbered focus={hover} onFocus={setHover} />
              </div>
            </>
          )}
        </>
      }
    >
      {cells.length > 0 ? (
        <div className="relative">
          <SceneView className="aspect-[4/3] w-full" label={describeTerrain(cells)} poster={<TerrainPoster cells={cells} focus={hover} />}>
            <SpendingTerrain cells={cells} focus={hover} />
          </SceneView>
          <ViewMarks marks={marks} box={box} view={TERRAIN_VIEW} aspect={TERRAIN_ASPECT} focus={hover} />
        </div>
      ) : (
        <NoPicture>This analysis has no spending categories, so there is no terrain to draw.</NoPicture>
      )}
    </Chamber>
  );
}
