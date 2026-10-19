import { Fragment, type ReactNode } from 'react';
import { CITY, CITY_DATA } from '@/components/three/scenes/bracketCityData';
import { CATEGORIES, formatAnnual } from '@/lib/explorerData';
import { cn } from '@/lib/utils';

/*
 * How to read the city, under the model: what's above and below the street,
 * the scale (a floor per $100 a year, every height linear), and the band
 * that names a tower's category. Small drawn keys, all decoration; the
 * words carry the meaning.
 */

const CAT_DOT = {
  taxes: 'bg-cat-taxes',
  healthcare: 'bg-cat-healthcare',
  housing: 'bg-cat-housing',
  employment: 'bg-cat-employment',
} as const;

/** A tiny tower over (or under) a street line, in CSS. */
function Swatch({ kind }: { kind: 'gain' | 'loss' | 'floors' | 'band' }) {
  return (
    <span aria-hidden="true" className="relative mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-tile border border-fg/10 bg-raised">
      <span className="absolute inset-x-1.5 top-1/2 h-px bg-fg/30" />
      {kind === 'gain' && <span className="absolute bottom-1/2 left-1/2 h-3.5 w-2 -translate-x-1/2 rounded-t-[2px] bg-gain-fill" />}
      {kind === 'loss' && <span className="absolute left-1/2 top-1/2 h-2.5 w-2 -translate-x-1/2 rounded-b-[2px] bg-loss-fill" />}
      {kind === 'floors' && (
        <span className="absolute bottom-1/2 left-1/2 h-4 w-2.5 -translate-x-1/2 rounded-t-[2px] bg-gain-fill bg-[repeating-linear-gradient(to_top,transparent_0_4px,rgb(255_255_255/0.7)_4px_5px)]" />
      )}
      {kind === 'band' && (
        <span className="absolute bottom-1/2 left-1/2 h-3.5 w-2 -translate-x-1/2 rounded-t-[2px] bg-gain-fill">
          <span className="absolute -inset-x-px top-0.5 h-1 bg-cat-healthcare" />
        </span>
      )}
    </span>
  );
}

export default function CityLegend() {
  const tallest = Math.max(...CITY_DATA.districts.flatMap((d) => d.towers.map((t) => t.amount)));
  const deepest = Math.min(...CITY_DATA.districts.flatMap((d) => d.towers.map((t) => t.amount)));
  const items: { kind: 'gain' | 'loss' | 'floors' | 'band'; title: string; body: ReactNode }[] = [
    {
      kind: 'gain',
      title: 'Above the street: gains',
      body: 'Towers in ledger teal rise from the paper street when the household comes out ahead.',
    },
    {
      kind: 'loss',
      title: 'Below it: costs',
      body: 'Towers in ember amber hang from the street into the glass when it pays more.',
    },
    {
      kind: 'floors',
      title: `One floor = $${CITY.floorDollars} a year`,
      body: (
        <>
          Every height is on one linear scale: the tallest tower is{' '}
          <span className="whitespace-nowrap font-mono-data">{formatAnnual(tallest)}</span>, the deepest{' '}
          <span className="whitespace-nowrap font-mono-data">{formatAnnual(deepest)}</span>.
        </>
      ),
    },
    {
      kind: 'band',
      title: 'The band: its category',
      body: (
        <>
          A thin band at each tower&rsquo;s far end, in the color of its category:{' '}
          {CATEGORIES.map((c, i) => (
            <Fragment key={c.key}>
              <span className="whitespace-nowrap">
                <span aria-hidden="true" className={cn('mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle', CAT_DOT[c.key])} />
                {c.label}
              </span>
              {i < CATEGORIES.length - 1 ? ', ' : '.'}
            </Fragment>
          ))}
        </>
      ),
    },
  ];

  return (
    <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <li key={item.title} className="flex gap-3">
          <Swatch kind={item.kind} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{item.title}</p>
            <p className="mt-1 text-meta leading-relaxed text-muted">{item.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
