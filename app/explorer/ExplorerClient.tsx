'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { BarChart3, Move3d, Table2, X } from 'lucide-react';
import SceneView from '@/components/three/SceneView';
import Badge from '@/components/ui/Badge';
import BracketCity from '@/components/three/scenes/BracketCity.lazy';
import SegmentedControl, { type SegmentedOption } from '@/components/ui/SegmentedControl';
import {
  CITY_DATA,
  DIRECTION_WORD,
  cityDescription,
  focusSummary,
  type CityFocus,
  type CityHit,
  type CityLabelSink,
} from '@/components/three/scenes/bracketCityData';
import { BRACKETS, CATEGORIES, UNIT_LABEL, divergingBar, formatAnnual, type BracketKey, type CategoryKey } from '@/lib/explorerData';
import { formatUSD, impactSign, type ImpactSign } from '@/lib/format';
import { playCue } from '@/lib/sound';
import { cn } from '@/lib/utils';
import styles from './_components/city.module.css';

/*
 * The interactive part of /explorer: the focus controls (an income bracket,
 * a category), the city they light (a 3D model over a server-rendered
 * poster), the readout that says in words and bars what the focus shows,
 * and the full breakdown with its table. The model is decoration: every
 * figure is in the readout and the breakdown, and a polite live region
 * reads out each change of focus.
 */

const TONE: Record<ImpactSign, string> = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-muted' };

const CAT_DOT: Record<CategoryKey, string> = {
  taxes: 'bg-cat-taxes',
  healthcare: 'bg-cat-healthcare',
  housing: 'bg-cat-housing',
  employment: 'bg-cat-employment',
};

const districtOf = (bracket: BracketKey | null | undefined) => CITY_DATA.districts.find((d) => d.bracket === bracket);
const categoryOf = (key: CategoryKey | null | undefined) => CATEGORIES.find((c) => c.key === key);

// ---------------------------------------------------------------------------
// Small pieces

/** A diverging bar on the explorer's shared scale: gains right of the zero line, costs left. */
function Bar({ amount, className }: { amount: number; className?: string }) {
  const bar = divergingBar(amount);
  return (
    <div aria-hidden="true" className={cn('relative h-2 rounded-full bg-fg/6', className)}>
      <div className="absolute -inset-y-1 left-1/2 w-px bg-fg/20" />
      {bar.width > 0 && (
        <div
          className={cn(
            'absolute inset-y-0 transition-[width] duration-500 ease-civic motion-reduce:transition-none',
            bar.sign === 'gain' ? 'left-1/2 rounded-r-full bg-gain-fill' : 'right-1/2 rounded-l-full bg-loss-fill'
          )}
          style={{ width: `${bar.width}%` }}
        />
      )}
    </div>
  );
}

/** "Gain +$650" with the word, the sign and the colour; "per year" for screen readers. */
function Figure({ amount, className, wordClassName }: { amount: number; className?: string; wordClassName?: string }) {
  const sign = impactSign(amount);
  return (
    <span className={cn('font-mono-data font-medium tabular-nums', TONE[sign], className)}>
      <span className={cn('mr-1.5 font-body text-meta font-medium uppercase tracking-[0.12em]', wordClassName)}>{DIRECTION_WORD[sign]}</span>
      {formatUSD(amount, { signed: true })}
      <span className="sr-only"> per year</span>
    </span>
  );
}

function Row({ label, amount, active = false, dot }: { label: ReactNode; amount: number; active?: boolean; dot?: string }) {
  return (
    <li className={cn('rounded-tile px-3 py-2.5 transition-colors duration-300 ease-civic', active ? 'bg-primary/8 ring-1 ring-primary/30' : 'bg-transparent')}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
          {dot && <span aria-hidden="true" className={cn('h-2 w-2 flex-shrink-0 rounded-full', dot)} />}
          <span className="truncate">{label}</span>
        </span>
        <Figure amount={amount} className="text-sm" />
      </div>
      <Bar amount={amount} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// The readout: the focus in words and bars, on solid paper.

function Readout({ focus, onClear }: { focus: CityFocus; onClear: () => void }) {
  const district = districtOf(focus.bracket);
  const category = categoryOf(focus.category);
  const tower = district && category ? district.towers.find((t) => t.category === category.key) : undefined;

  let title: ReactNode;
  let note: string;
  let rows: ReactNode;
  let footer: ReactNode = null;

  if (district && category && tower) {
    title = (
      <>
        {category.label}, <em>{district.label}</em>
      </>
    );
    note = `A typical ${district.label} household, the ${category.label.toLowerCase()} example policies summed (${UNIT_LABEL}).`;
    rows = district.towers.map((t) => (
      <Row key={t.category} label={t.categoryLabel} amount={t.amount} active={t.category === category.key} dot={CAT_DOT[t.category]} />
    ));
    footer = (
      <div className="mt-2 rounded-tile border border-fg/10 px-4 py-4">
        <p className="text-meta uppercase tracking-[0.14em] text-muted">This tower</p>
        <p className="mt-1">
          <Figure amount={tower.amount} className="text-3xl" wordClassName="text-xs" />
          <span className="ml-1 font-mono-data text-sm text-muted">/yr</span>
        </p>
      </div>
    );
  } else if (district) {
    title = (
      <>
        <em>{district.label}</em> households
      </>
    );
    note = `Net per category for a typical household in the bracket (${UNIT_LABEL}).`;
    rows = district.towers.map((t) => <Row key={t.category} label={t.categoryLabel} amount={t.amount} dot={CAT_DOT[t.category]} />);
  } else if (category) {
    title = (
      <>
        <em>{category.label}</em>, bracket by bracket
      </>
    );
    note = `The ${category.label.toLowerCase()} example policies summed, for a typical household in each bracket (${UNIT_LABEL}).`;
    rows = CITY_DATA.districts.map((d) => (
      <Row key={d.bracket} label={d.label} amount={d.towers.find((t) => t.category === category.key)?.amount ?? 0} />
    ));
  } else {
    title = (
      <>
        The whole <em>city</em>
      </>
    );
    note = `Net across all ${CITY_DATA.policyCount} example policies, for a typical household in each bracket (${UNIT_LABEL}).`;
    rows = CITY_DATA.districts.map((d) => <Row key={d.bracket} label={d.label} amount={d.net} />);
  }

  if (district && !category) {
    footer = (
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-fg/10 px-3 pt-4">
        <span className="text-sm text-muted">Net across all {CITY_DATA.policyCount} example policies</span>
        <Figure amount={district.net} className="text-lg" />
      </p>
    );
  }

  return (
    <div className="glass-strong flex h-full flex-col rounded-pane p-4 sm:p-6">
      <div className="flex min-h-8 items-center justify-between gap-3 px-1">
        <p className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">In focus</p>
        {(district || category) && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-meta font-medium text-primary-300 transition-colors hover:bg-fg/5 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear focus
          </button>
        )}
      </div>
      <h3 className="mt-3 px-1 font-display text-2xl font-medium text-ink [text-wrap:balance]">{title}</h3>
      <p className="mt-2 px-1 text-sm leading-relaxed text-muted">{note}</p>
      <ul className="mt-4 space-y-1">{rows}</ul>
      {footer}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The breakdown: every bracket and category, as bars or as a table.

function Breakdown({ focus }: { focus: CityFocus }) {
  const [asTable, setAsTable] = useState(false);
  const viewId = useId();
  const cats = focus.category ? CATEGORIES.filter((c) => c.key === focus.category) : CATEGORIES;
  const title = 'Example impact by income bracket';

  return (
    <section aria-labelledby="breakdown-heading" className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono-data text-meta uppercase tracking-[0.18em] text-muted">Fig. 2 · Every figure</p>
            <Badge variant="example">Illustrative</Badge>
          </div>
          <h2 id="breakdown-heading" className="mt-4 font-display text-display-sm font-medium text-ink [text-wrap:balance]">
            Example impact by <em>income bracket</em>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Each figure is the sum of a category&rsquo;s example policies for a typical household in the bracket, on the same
            scale as the city.{' '}
            {focus.category ? `Showing ${categoryOf(focus.category)?.label} only; clear the category to see all four.` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-controls={viewId}
          className="inline-flex min-h-10 flex-shrink-0 items-center gap-2 self-start rounded-full border border-fg/15 px-4 text-sm font-medium text-ink transition-colors hover:border-primary/40 sm:self-auto"
        >
          {asTable ? <BarChart3 className="h-4 w-4" aria-hidden="true" /> : <Table2 className="h-4 w-4" aria-hidden="true" />}
          {asTable ? 'View as chart' : 'View as table'}
          <span className="sr-only">: {title}</span>
        </button>
      </div>

      <div id={viewId} className="glass-strong mt-8 rounded-pane p-4 sm:p-8">
        {asTable ? (
          // Focusable so keyboard users can scroll a table wider than the pane.
          <div className="overflow-x-auto" role="region" aria-label={`${title} (table)`} tabIndex={0}>
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">
                {title}, {UNIT_LABEL}. Positive amounts are gains for the household, negative ones costs.
              </caption>
              <thead>
                <tr className="border-b border-fg/10 text-left">
                  <th scope="col" className="py-3 pr-4 font-medium text-muted">
                    Income bracket
                  </th>
                  {cats.map((c) => (
                    <th key={c.key} scope="col" className="px-3 py-3 text-right font-medium text-muted">
                      {c.label}
                    </th>
                  ))}
                  <th scope="col" className="py-3 pl-3 text-right font-medium text-muted">
                    Net, all {CITY_DATA.policyCount} policies
                  </th>
                </tr>
              </thead>
              <tbody>
                {CITY_DATA.districts.map((d) => (
                  <tr key={d.bracket} className={cn('border-b border-fg/6 last:border-0', d.bracket === focus.bracket && 'bg-primary/5')}>
                    <th scope="row" className="py-3 pr-4 text-left font-normal text-ink">
                      {d.label}
                    </th>
                    {cats.map((c) => {
                      const amount = d.towers.find((t) => t.category === c.key)?.amount ?? 0;
                      return (
                        <td key={c.key} className={cn('whitespace-nowrap px-3 py-3 text-right font-mono-data', TONE[impactSign(amount)])}>
                          {formatAnnual(amount)}
                        </td>
                      );
                    })}
                    <td className={cn('whitespace-nowrap py-3 pl-3 text-right font-mono-data font-medium', TONE[impactSign(d.net)])}>
                      {formatAnnual(d.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <ul className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-meta text-muted" aria-label="Key">
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-gain-fill" aria-hidden="true" />
                Right of the line: the household gains
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-loss-fill" aria-hidden="true" />
                Left: it costs the household
              </li>
              <li className="font-mono-data">{UNIT_LABEL}</li>
            </ul>
            <ul className="space-y-3">
              {CITY_DATA.districts.map((d) => (
                <li
                  key={d.bracket}
                  className={cn(
                    'rounded-tile border px-3 py-4 transition-colors duration-300 ease-civic sm:px-4',
                    d.bracket === focus.bracket ? 'border-primary/40 bg-primary/5' : 'border-transparent'
                  )}
                >
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="font-mono-data text-sm font-medium text-ink" id={`breakdown-${d.bracket}`}>
                      {d.label}
                    </h3>
                    <span className="text-meta text-muted">
                      Net, all {CITY_DATA.policyCount} policies: <Figure amount={d.net} className="text-meta" wordClassName="mr-1" />
                    </span>
                  </div>
                  <ul
                    aria-labelledby={`breakdown-${d.bracket}`}
                    className={cn('grid gap-x-6 gap-y-4', cats.length > 1 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1')}
                  >
                    {cats.map((c) => {
                      const amount = d.towers.find((t) => t.category === c.key)?.amount ?? 0;
                      return (
                        <li key={c.key}>
                          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
                            <span className="flex items-center gap-1.5 text-meta text-muted">
                              <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', CAT_DOT[c.key])} />
                              {c.label}
                            </span>
                            <Figure amount={amount} className="text-sm" wordClassName="mr-1" />
                          </div>
                          <Bar amount={amount} className="h-2.5" />
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const PHONE = '(max-width: 639px)';

function subscribePhone(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const mql = window.matchMedia(PHONE);
  mql.addEventListener?.('change', onChange);
  return () => mql.removeEventListener?.('change', onChange);
}

/** A phone-width screen: the compact city. False on the server (the model only mounts after hydration). */
function usePhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches,
    () => false
  );
}

/**
 * Whether a sideways scroller has more to show before or after what's in
 * view (false, false until measured, as on the server), kept current as it
 * scrolls and resizes.
 */
function useScrollEdges(ref: RefObject<HTMLElement | null>): { before: boolean; after: boolean } {
  const [edges, setEdges] = useState({ before: false, after: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const before = el.scrollLeft > 1;
      const after = el.scrollLeft < max - 1;
      setEdges((prev) => (prev.before === before && prev.after === after ? prev : { before, after }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resize?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      resize?.disconnect();
    };
  }, [ref]);
  return edges;
}

const BRACKET_OPTIONS: SegmentedOption<BracketKey | 'all'>[] = [
  { value: 'all', label: 'All', ariaLabel: 'All brackets' },
  ...BRACKETS.map((b) => ({
    value: b.key,
    label: (
      <>
        <span className="sm:hidden">{CITY_DATA.districts.find((d) => d.bracket === b.key)?.short ?? b.label}</span>
        <span className="hidden sm:inline">{b.label}</span>
      </>
    ),
    ariaLabel: b.label,
  })),
];

const NO_FOCUS: CityFocus = { bracket: null, category: null };

export interface ExplorerClientProps {
  /** The city drawn on the server (CityPoster): what shows until, and unless, the 3D model draws. */
  poster: ReactNode;
  /** How to read the model (server-rendered), under the model and the readout. */
  legend?: ReactNode;
}

export default function ExplorerClient({ poster, legend }: ExplorerClientProps) {
  const [focus, setFocus] = useState<CityFocus>(NO_FOCUS);
  const [said, setSaid] = useState('');
  const [tip, setTip] = useState<CityHit | null>(null);
  const phone = usePhone();
  const frame = useRef<HTMLDivElement>(null);
  const tipBox = useRef<HTMLDivElement>(null);
  const labelEls = useRef<Partial<Record<BracketKey, HTMLSpanElement | null>>>({});
  const bracketLabel = useId();
  const bracketScroller = useRef<HTMLDivElement>(null);
  const bracketEdges = useScrollEdges(bracketScroller);

  const choose = useCallback((next: CityFocus) => {
    setFocus(next);
    setSaid(focusSummary(CITY_DATA, next));
    playCue('tick');
  }, []);

  const pickBracket = (value: BracketKey | 'all') => choose({ ...focus, bracket: value === 'all' ? null : value });
  const toggleCategory = (key: CategoryKey | null) =>
    choose({ ...focus, category: key === null || focus.category === key ? null : key });

  // A tower clicked in the model focuses it; clicking it again lets go.
  const onPick = useCallback(
    (hit: CityHit) =>
      choose(
        focus.bracket === hit.bracket && focus.category === hit.category ? NO_FOCUS : { bracket: hit.bracket, category: hit.category }
      ),
    [choose, focus]
  );

  // The tooltip: content changes only when the tower under the pointer does; position follows the pointer.
  const onHover = useCallback((hit: CityHit | null, at?: { x: number; y: number }) => {
    setTip((prev) => (prev?.bracket === hit?.bracket && prev?.category === hit?.category ? prev : hit));
    const el = tipBox.current;
    const box = frame.current;
    if (!hit || !at || !el || !box) return;
    const r = box.getBoundingClientRect();
    const w = el.offsetWidth || 200;
    const h = el.offsetHeight || 64;
    let x = at.x - r.left + 16;
    let y = at.y - r.top + 18;
    if (x + w > r.width - 8) x = at.x - r.left - w - 16;
    if (y + h > r.height - 8) y = at.y - r.top - h - 18;
    el.style.transform = `translate(${Math.round(Math.max(8, x))}px, ${Math.round(Math.max(8, y))}px)`;
  }, []);

  // District labels: plain DOM text the scene moves with the camera.
  const labels = useMemo<CityLabelSink>(
    () => ({
      place(bracket, x, y, visible) {
        const el = labelEls.current[bracket];
        if (!el) return;
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, 0.6rem)`;
        el.style.opacity = visible ? '' : '0';
      },
    }),
    []
  );

  const tipDistrict = districtOf(tip?.bracket);
  const tipTower = tipDistrict?.towers.find((t) => t.category === tip?.category);

  return (
    <>
      <section aria-labelledby="city-heading" data-scene-section="explorer-city" className="relative overflow-x-clip">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* A figure's title line, kept to one row so the model rises into the first screen. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="font-mono-data text-meta uppercase tracking-[0.18em] text-muted">Fig. 1</p>
              <h2 id="city-heading" className="font-display text-[1.75rem] font-medium leading-tight text-ink sm:text-[2rem]">
                Brackets as a <em>city</em>
              </h2>
              <Badge variant="example">Illustrative</Badge>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-muted sm:text-right">
              Pick a bracket or a category. The model lights it; the readout gives the numbers.
            </p>
          </div>

          {/* The controls: glass, as controls are. */}
          <div className="glass mt-5 flex flex-col gap-4 rounded-pane p-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p id={bracketLabel} className="mb-1.5 px-1 font-mono-data text-meta uppercase tracking-[0.16em] text-muted">
                Income bracket
              </p>
              {/* Scrolls sideways on a phone rather than squeezing the labels,
                  its edges fading where more options wait (city.module.css). */}
              <div
                ref={bracketScroller}
                className={cn(styles.scroller, '-mx-4 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:px-0')}
                data-more-before={bracketEdges.before ? '' : undefined}
                data-more-after={bracketEdges.after ? '' : undefined}
              >
                <SegmentedControl
                  options={BRACKET_OPTIONS}
                  value={focus.bracket ?? 'all'}
                  onValueChange={pickBracket}
                  labelledBy={bracketLabel}
                  size="sm"
                  className="w-max max-w-none"
                />
              </div>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 px-1 font-mono-data text-meta uppercase tracking-[0.16em] text-muted" aria-hidden="true">
                Category
              </p>
              <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={!focus.category}
                  onClick={() => toggleCategory(null)}
                  className={cn(CHIP, !focus.category ? CHIP_ON : CHIP_OFF)}
                >
                  All categories
                </button>
                {CATEGORIES.map((cat) => {
                  const on = focus.category === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleCategory(cat.key)}
                      className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
                    >
                      {/* The colour of the band at the top of this category's towers. */}
                      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', CAT_DOT[cat.key])} />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-6 lg:grid-cols-12">
            <figure className="min-w-0 lg:col-span-8 xl:col-span-9">
              <div
                ref={frame}
                className={cn(styles.root, 'relative aspect-[3/2] touch-pan-y touch-pinch-zoom sm:aspect-[16/9] lg:aspect-[16/10] xl:aspect-[2/1]')}
                data-focus-bracket={focus.bracket ?? undefined}
                data-focus-category={focus.category ?? undefined}
              >
                <SceneView interactive className="absolute inset-0" poster={poster} label={cityDescription(CITY_DATA)}>
                  <BracketCity
                    data={CITY_DATA}
                    focus={focus}
                    compact={phone}
                    onHover={onHover}
                    onPick={onPick}
                    labels={phone ? undefined : labels}
                  />
                </SceneView>

                {/* Over the live model only (city.module.css): names under the districts, a tooltip, a hint. */}
                <div className={styles.labels} aria-hidden="true" data-decorative="">
                  {CITY_DATA.districts.map((d) => (
                    <span
                      key={d.bracket}
                      ref={(el) => {
                        labelEls.current[d.bracket] = el;
                      }}
                      className={cn(
                        styles.label,
                        'font-mono-data text-meta tracking-[0.04em]',
                        d.bracket === focus.bracket ? 'font-medium text-primary-300' : 'text-muted'
                      )}
                    >
                      {d.label}
                    </span>
                  ))}
                </div>
                <div
                  ref={tipBox}
                  className={cn(styles.tip, 'z-content min-w-44 rounded-tile border border-fg/10 bg-raised px-3 py-2.5 shadow-lift')}
                  data-shown={tip ? '' : undefined}
                  aria-hidden="true"
                  data-decorative=""
                >
                  {tipDistrict && tipTower && (
                    <>
                      <p className="flex items-center gap-1.5 text-meta text-muted">
                        <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', CAT_DOT[tipTower.category])} />
                        {tipTower.categoryLabel} · {tipDistrict.label}
                      </p>
                      <p className="mt-1">
                        <Figure amount={tipTower.amount} className="text-sm" />
                        <span className="font-mono-data text-meta text-muted">/yr</span>
                      </p>
                      <p className="mt-1 text-meta text-muted">Click to focus</p>
                    </>
                  )}
                </div>
                <p
                  className={cn(styles.hint, 'pointer-events-none absolute bottom-3 right-3 items-center gap-1.5 rounded-full bg-raised/80 px-3 py-1.5 text-meta text-muted')}
                  aria-hidden="true"
                  data-decorative=""
                >
                  <Move3d className="h-3.5 w-3.5" aria-hidden="true" />
                  Drag to turn the model
                </p>
              </div>

              {/* Phones: the compact model is too tight to label in place, so its districts are named here, left to right. */}
              <ol aria-hidden="true" data-decorative="" className="mt-2 grid grid-cols-5 gap-1 sm:hidden">
                {CITY_DATA.districts.map((d) => (
                  <li
                    key={d.bracket}
                    className={cn(
                      'text-center font-mono-data text-meta',
                      d.bracket === focus.bracket ? 'font-medium text-primary-300' : 'text-muted'
                    )}
                  >
                    {d.short}
                  </li>
                ))}
              </ol>
              <figcaption className="mt-4 text-meta text-muted">
                Fig. 1: the illustrative examples as a model city. Every figure is in the readout and in Fig. 2 below.
              </figcaption>
            </figure>

            <aside aria-label="In focus" className="min-w-0 lg:col-span-4 xl:col-span-3">
              <Readout focus={focus} onClear={() => choose(NO_FOCUS)} />
            </aside>
          </div>

          {legend && <div className="mt-10 border-t border-fg/10 pt-8">{legend}</div>}

          {/* Each change of focus, in words. */}
          <p role="status" aria-live="polite" className="sr-only">
            {said}
          </p>
        </div>
      </section>

      <Breakdown focus={focus} />
    </>
  );
}

const CHIP =
  'inline-flex min-h-9 flex-shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition-colors duration-200 ease-civic';
const CHIP_ON = 'border-primary bg-raised text-ink shadow-[0_6px_16px_-8px_rgb(var(--c-violet)/0.45)]';
const CHIP_OFF = 'border-fg/12 bg-fg/4 text-muted hover:border-primary/40 hover:text-ink';
