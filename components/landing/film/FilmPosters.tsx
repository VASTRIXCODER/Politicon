import { useId, type CSSProperties, type ReactNode } from 'react';
import CapitolArt, { CapitolBuilding, CapitolDefs } from '@/components/landing/hero/CapitolArt';
import { cn } from '@/lib/utils';
import { BILL_RECORD, EXAMPLE_LEDGER, EXAMPLE_TOTAL_TEXT, type FilmShot } from './shots';

/*
 * The film's five stills, drawn in SVG: what the static five-panel version
 * shows (reduced motion, tier 0, before hydration) and what the pinned film
 * shows until the 3D scene draws. One drawing per shot of the 3D film:
 *
 *   01  the Capitol in morning light
 *   02  a bill sheet lifting off the dome: its official record (an example) and gold seal
 *   03  the sheet streaming as light into a small house
 *   04  a ledger column: teal slabs rising, an amber one sinking, the example number
 *   05  dusk: the Capitol on its plinth and the lit household with its
 *       ledger, under the violet hour (always a night pane)
 *
 * All decorative (aria-hidden); the captions carry the meaning. Colours are
 * tokens set through CSS, so each still follows the theme. Gold appears only
 * on the bill's seal (the official record).
 */

const VIEWBOX = '0 0 640 600';

interface ArtProps {
  children: ReactNode;
  className?: string;
  defs?: ReactNode;
  /** 'slice' fills the box edge to edge (a scene with a horizon); 'meet' keeps the whole drawing in view. */
  fit?: 'meet' | 'slice';
}

function Art({ children, className, defs, fit = 'meet' }: ArtProps) {
  return (
    <svg
      viewBox={VIEWBOX}
      preserveAspectRatio={fit === 'slice' ? 'xMidYMid slice' : 'xMidYMid meet'}
      // A fitted drawing's light runs on past its edges (its box clips it).
      overflow={fit === 'slice' ? 'hidden' : 'visible'}
      aria-hidden="true"
      focusable="false"
      className={cn('h-full w-full', className)}
    >
      {defs && <defs>{defs}</defs>}
      {children}
    </svg>
  );
}

/** Unique gradient ids per drawing (several stills share the page). */
function useIds() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return {
    id: (name: string) => `${uid}-${name}`,
    url: (name: string) => `url(#${uid}-${name})`,
  };
}

/** A soft round pool of violet light (the halo every still stands in). */
function haloStops() {
  return (
    <>
      <stop offset="0" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0.38] dark:[stop-opacity:0.42]" />
      <stop offset="0.5" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0.12]" />
      <stop offset="1" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0]" />
    </>
  );
}

// ---------------------------------------------------------------------------
// 02 · The bill sheet, lifting off the dome.

/** A short title in two lines for SVG text (which doesn't wrap): words up to `max` characters, then the rest. */
function twoLines(text: string, max: number): string[] {
  const words = text.split(' ');
  let first = '';
  let i = 0;
  while (i < words.length && `${first} ${words[i]}`.trim().length <= max) first = `${first} ${words[i++]}`.trim();
  return [first, words.slice(i).join(' ')].filter(Boolean);
}

/** The sheet's flat 240 × 320 face, mapped (affinely) onto a tilted page. */
const SHEET = 'matrix(1 0.11 -0.08 0.98 214 96)';

function BillArt() {
  const { id, url } = useIds();
  return (
    <Art
      defs={
        <>
          <radialGradient id={id('halo')} cx="0.5" cy="0.5" r="0.5">{haloStops()}</radialGradient>
          <linearGradient id={id('beam')} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0.45]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0]" />
          </linearGradient>
          <linearGradient id={id('paper')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="[stop-color:rgb(var(--c-raised))]" />
            <stop offset="0.7" className="[stop-color:rgb(var(--c-raised))]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-surface))]" />
          </linearGradient>
          <radialGradient id={id('seal')} cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" className="[stop-color:rgb(var(--c-gold))] [stop-opacity:0.55]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-gold))] [stop-opacity:0.95]" />
          </radialGradient>
          <radialGradient id={id('shadow')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.26]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0]" />
          </radialGradient>
        </>
      }
    >
      <ellipse cx="330" cy="300" rx="300" ry="270" fill={url('halo')} />
      {/* The dome far below, the sheet's beam of light rising from it. */}
      <path d="M262 600 C262 548 292 522 320 520 C348 522 378 548 378 600 Z" className="fill-surface stroke-fg/15" />
      <path d="M296 540 L344 540 L520 300 L150 262 Z" fill={url('beam')} opacity="0.45" />
      {/* The sheet's shadow, then the sheet. */}
      <ellipse cx="350" cy="520" rx="150" ry="18" fill={url('shadow')} />
      <g transform={SHEET}>
        <rect width="240" height="320" rx="10" fill={url('paper')} className="stroke-fg/15" strokeWidth="1" />
        {/* The official record (an example, labelled), as the 3D film prints it on its glass sheet (BillRecord). */}
        <circle cx="25" cy="25" r="2.6" className="fill-gold" />
        <text x="33" y="28" className="fill-ink/70 font-mono-data text-[8px] uppercase tracking-[0.2em]">
          {BILL_RECORD.kicker}
        </text>
        <rect x="170" y="16" width="50" height="16" rx="8" fill="none" strokeDasharray="3 2" className="stroke-ink/40" strokeWidth="1" />
        <text x="195" y="27.5" textAnchor="middle" className="fill-ink/75 font-mono-data text-[8px] tracking-wide">
          Example
        </text>
        <text x="22" y="54" className="fill-ink/75 font-mono-data text-[10px] tracking-wide">
          {BILL_RECORD.number} · {BILL_RECORD.chamber}
        </text>
        <text className="fill-ink font-display text-[17px] font-medium">
          {twoLines(BILL_RECORD.title, 24).map((line, i) => (
            <tspan key={i} x="22" y={76 + i * 20}>
              {line}
            </tspan>
          ))}
        </text>
        <rect x="22" y="108" width="74" height="16" rx="8" className="fill-violet/10 stroke-violet/40" strokeWidth="1" />
        <circle cx="32" cy="116" r="1.8" className="fill-violet" />
        <text x="38" y="119" className="fill-violet-text font-mono-data text-[8px]">
          {BILL_RECORD.status}
        </text>
        <text x="104" y="119" className="fill-ink/70 font-mono-data text-[8px]">
          {BILL_RECORD.introduced}
        </text>
        <path d="M22 136 H218" className="stroke-fg/10" strokeWidth="1" />
        {[150, 162, 174, 186, 198, 210, 222].map((y, i) => (
          <rect key={y} x="22" y={y} width={i % 4 === 3 ? 120 : 196} height="4" rx="2" className="fill-ink/[0.14]" />
        ))}
        {/* The seal of the official record. */}
        <g transform="translate(184 272)">
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            return (
              <path
                key={i}
                d={`M${(Math.cos(a) * 25).toFixed(2)} ${(Math.sin(a) * 25).toFixed(2)} L${(Math.cos(a) * 30).toFixed(2)} ${(Math.sin(a) * 30).toFixed(2)}`}
                strokeWidth="2.4"
                strokeLinecap="round"
                className="stroke-gold/70"
              />
            );
          })}
          <circle r="24" fill={url('seal')} />
          <circle r="16" fill="none" strokeWidth="1.4" className="stroke-raised/80" />
          <path d="M-7 4 C-7 -4 -3 -8 0 -8 C3 -8 7 -4 7 4 Z M-9 4 H9 V7 H-9 Z" className="fill-raised/90" />
        </g>
        {/* Rim light along the sheet's far edge. */}
        <path d="M240 10 V310" strokeWidth="2" strokeLinecap="round" className="stroke-violet/50 dark:stroke-violet-glow/70" />
      </g>
      {/* Light motes around the rising sheet. */}
      <g className="fill-violet dark:fill-violet-glow">
        {[
          [196, 210, 2, 0.5],
          [480, 240, 2.4, 0.55],
          [500, 300, 1.4, 0.4],
          [176, 330, 1.6, 0.35],
          [460, 120, 1.2, 0.4],
          [520, 180, 1.6, 0.3],
          [170, 140, 1.2, 0.3],
        ].map(([cx, cy, r, o]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity={o} />
        ))}
      </g>
    </Art>
  );
}

// ---------------------------------------------------------------------------
// 03 · The sheet streams as light into a household.

/**
 * The household's house in 2.5D (front, side, gable, roof, door, windows),
 * standing on y 448 between x 392 and 564: drawn in shot 3 and again, on its
 * disc, at dusk.
 */
const HOUSE = {
  front: 'M400 330 H500 V448 H400 Z',
  side: 'M500 330 L556 306 V420 L500 448 Z',
  gable: 'M392 334 L450 276 L508 334 Z',
  roof: 'M450 276 L508 252 L564 306 L508 334 Z',
  door: 'M440 390 H462 Q464 390 464 392 V448 H438 V392 Q438 390 440 390 Z',
  windows: ['M412 352 H438 V376 H412 Z', 'M462 352 H488 V376 H462 Z'],
  sideWindow: 'M516 352 L540 342 V364 L516 374 Z',
  gableRim: 'M450 276 L392 334',
  roofRim: 'M508 252 L564 306',
} as const;

/** Points along a cubic Bézier, for a stream of dots that grow toward the house. */
function stream(p0: number[], p1: number[], p2: number[], p3: number[], count: number) {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    return { x, y, t };
  });
}

function HouseholdArt() {
  const { id, url } = useIds();
  const streams = [-2, -1, 0, 1, 2].map((k) =>
    stream([96, 190 + k * 26], [230, 120 + k * 40], [330, 380 - k * 18], [432, 336 + k * 4], 22)
  );
  return (
    <Art
      defs={
        <>
          <radialGradient id={id('halo')} cx="0.5" cy="0.5" r="0.5">{haloStops()}</radialGradient>
          <linearGradient id={id('front')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="[stop-color:rgb(var(--c-raised))]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-surface))]" />
          </linearGradient>
          <linearGradient id={id('side')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.16]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.3]" />
          </linearGradient>
          <radialGradient id={id('window')} cx="0.5" cy="0.5" r="0.6">
            <stop offset="0" className="[stop-color:rgb(var(--c-raised))]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0.85]" />
          </radialGradient>
          <radialGradient id={id('shadow')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.24]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0]" />
          </radialGradient>
        </>
      }
    >
      <ellipse cx="420" cy="330" rx="250" ry="230" fill={url('halo')} />
      {/* Fragments of the sheet coming apart on the left. */}
      <g className="fill-raised stroke-fg/15" strokeWidth="1">
        <path d="M58 150 L104 156 L100 212 L54 206 Z" />
        <path d="M86 236 L112 240 L110 268 L84 264 Z" opacity="0.8" />
        <path d="M118 182 L136 185 L134 205 L116 202 Z" opacity="0.6" />
      </g>
      {/* Streams of light, each dot a little brighter as it nears the house. */}
      <g className="fill-violet dark:fill-violet-glow">
        {streams.flatMap((points, s) =>
          points.map(({ x, y, t }, i) => (
            <circle key={`${s}-${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r={(0.9 + t * 1.9).toFixed(2)} opacity={(0.18 + t * 0.7).toFixed(2)} />
          ))
        )}
      </g>
      {/* The house: front, side and roof in 2.5D, its windows lit. */}
      <ellipse cx="470" cy="452" rx="150" ry="20" fill={url('shadow')} />
      <g className="stroke-fg/15" strokeWidth="1" strokeLinejoin="round">
        <path d={HOUSE.front} fill={url('front')} />
        <path d={HOUSE.side} fill={url('side')} />
        <path d={HOUSE.gable} className="fill-raised" />
        <path d={HOUSE.roof} className="fill-surface" />
        <path d={HOUSE.door} className="fill-surface" />
        {HOUSE.windows.map((d) => (
          <path key={d} d={d} fill={url('window')} />
        ))}
        <path d={HOUSE.sideWindow} fill={url('window')} opacity="0.8" />
      </g>
      <path d={HOUSE.gableRim} fill="none" strokeWidth="1.6" strokeLinecap="round" className="stroke-white/90 dark:stroke-violet-glow/40" />
      <path d={HOUSE.roofRim} fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-violet/50 dark:stroke-violet-glow/70" />
      {/* A tree, for scale. */}
      <g className="stroke-fg/15" strokeWidth="1">
        <rect x="583" y="400" width="5" height="40" className="fill-surface" />
        <circle cx="585" cy="388" r="22" className="fill-raised" />
        <path d="M585 366 A22 22 0 0 1 585 410" fill="none" className="stroke-violet/40" strokeWidth="1.6" />
      </g>
      <path d="M330 452 H620" className="stroke-fg/10" strokeWidth="1" />
    </Art>
  );
}

// ---------------------------------------------------------------------------
// 04 · The ledger: teal slabs rise for what saves, amber sinks for what costs.

/** An isometric slab: front, side and top faces. */
function Slab({ x, y, w, h, tone }: { x: number; y: number; w: number; h: number; tone: 'gain' | 'loss' }) {
  const d = 22; // depth offset (right, up)
  const fill = tone === 'gain' ? 'fill-gain-fill' : 'fill-loss-fill';
  return (
    <g className="stroke-fg/10" strokeWidth="1" strokeLinejoin="round">
      <path d={`M${x} ${y} H${x + w} V${y + h} H${x} Z`} className={cn(fill, 'opacity-[0.88]')} />
      <path d={`M${x + w} ${y} L${x + w + d} ${y - d * 0.55} V${y + h - d * 0.55} L${x + w} ${y + h} Z`} className={cn(fill, 'opacity-60')} />
      <path d={`M${x} ${y} L${x + d} ${y - d * 0.55} H${x + w + d} L${x + w} ${y} Z`} className={cn(fill, 'opacity-40')} />
    </g>
  );
}

/** Slabs for the example ledger: gains rise from the zero line (y 322), costs sink below it (y 352). */
function ledgerSlabs() {
  const scale = 0.06; // px per dollar
  const gap = 5;
  let up = 322;
  let down = 352;
  return EXAMPLE_LEDGER.map(({ amount }) => {
    const h = Math.max(8, Math.abs(amount) * scale);
    if (amount >= 0) {
      up -= h;
      const slab = { x: 170, y: up, w: 120, h, tone: 'gain' as const };
      up -= gap;
      return slab;
    }
    const slab = { x: 312, y: down, w: 92, h, tone: 'loss' as const };
    down += h + gap;
    return slab;
  });
}

function LedgerArt() {
  const { id, url } = useIds();
  return (
    <Art
      defs={
        <>
          <radialGradient id={id('halo')} cx="0.5" cy="0.5" r="0.5">{haloStops()}</radialGradient>
          <linearGradient id={id('plane')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" className="[stop-color:rgb(var(--c-fg))] [stop-opacity:0]" />
            <stop offset="0.5" className="[stop-color:rgb(var(--c-fg))] [stop-opacity:0.22]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-fg))] [stop-opacity:0]" />
          </linearGradient>
        </>
      }
    >
      <ellipse cx="300" cy="300" rx="290" ry="260" fill={url('halo')} />
      {/* The ledger's zero line, a plane seen edge-on. */}
      <path d="M60 352 L120 322 H560 L500 352 Z" className="fill-raised/70 stroke-fg/10" strokeWidth="1" />
      <path d="M40 352 H560" stroke={url('plane')} strokeWidth="1.5" />
      {/* The example's lines (EXAMPLE_LEDGER): savings stack up from the line,
          costs hang below it, each slab as tall as its amount. */}
      {ledgerSlabs().map((slab) => (
        <Slab key={`${slab.tone}-${slab.y}`} {...slab} />
      ))}
      {/* The example figure, labelled as one. */}
      <g className="font-mono-data">
        <rect x="370" y="185" width="80" height="24" rx="12" fill="none" strokeDasharray="4 3" className="stroke-fg/40" strokeWidth="1" />
        <text x="410" y="201" textAnchor="middle" className="fill-muted text-[11px] tracking-[0.14em]">
          EXAMPLE
        </text>
        <text x="372" y="250" className="fill-gain text-[38px] font-semibold">
          {EXAMPLE_TOTAL_TEXT}
        </text>
        <text x="374" y="276" className="fill-muted text-[13px]">
          could save you
        </text>
      </g>
      <g className="fill-violet dark:fill-violet-glow">
        {[
          [150, 170, 1.6, 0.4],
          [310, 150, 2, 0.45],
          [250, 128, 1.3, 0.35],
          [140, 250, 1.2, 0.3],
        ].map(([cx, cy, r, o]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity={o} />
        ))}
      </g>
    </Art>
  );
}

// ---------------------------------------------------------------------------
// 05 · Dusk: the camera pulls back over the whole story, the Capitol on its
// plinth and the household on its disc with the ledger beside it, under the
// violet hour. Always a night pane.

/** A deterministic scatter (no Math.random: server and client must agree). */
const scatter = (n: number, seed: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    const b = Math.sin((i + 1) * 39.3468 + seed * 11.135) * 24634.6345;
    return [a - Math.floor(a), b - Math.floor(b)];
  });

/**
 * Moonlit porcelain: the night pane's paper tokens lifted to the lavender the
 * 3D dusk lights its models with, for the models only (set on their group, so
 * their own gradients resolve against it). Channels, as styles/tokens.css
 * writes them.
 */
const MOONLIT = { '--c-raised': '176 165 228', '--c-surface': '124 112 190' } as CSSProperties;

/** A disc (a plinth seen from above and in front): its rim band, then its top. */
function Disc({ cx, cy, rx, ry, depth, top, side }: { cx: number; cy: number; rx: number; ry: number; depth: number; top: string; side: string }) {
  return (
    <g>
      <path d={`M${cx - rx} ${cy} V${cy + depth} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy + depth} V${cy} Z`} fill={side} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={top} />
      {/* The moonlit far rim, and a hairline inlay. */}
      <path d={`M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`} fill="none" strokeWidth="1.4" className="stroke-violet-glow/70" />
      <ellipse cx={cx} cy={cy} rx={rx * 0.86} ry={ry * 0.86} fill="none" strokeWidth="0.8" className="stroke-violet/50" />
    </g>
  );
}

/** The example ledger as a small column: savings in teal over the zero plate, costs in amber under it. */
function DuskLedger({ x, base }: { x: number; base: number }) {
  const scale = 0.042; // px per dollar
  const w = 24;
  const d = 9;
  const gains = EXAMPLE_LEDGER.filter((l) => l.amount >= 0);
  const costs = EXAMPLE_LEDGER.filter((l) => l.amount < 0);
  const down = costs.reduce((sum, l) => sum + Math.abs(l.amount) * scale + 2, 0);
  const zero = base - 6 - down;
  const faces = (y: number, h: number, fill: string) => (
    <g key={`${fill}-${y}`} strokeWidth="0.8" strokeLinejoin="round" className="stroke-fg/15">
      <path d={`M${x} ${y} H${x + w} V${y + h} H${x} Z`} className={cn(fill, 'opacity-90')} />
      <path d={`M${x + w} ${y} L${x + w + d} ${y - d * 0.55} V${y + h - d * 0.55} L${x + w} ${y + h} Z`} className={cn(fill, 'opacity-60')} />
      <path d={`M${x} ${y} L${x + d} ${y - d * 0.55} H${x + w + d} L${x + w} ${y} Z`} className={cn(fill, 'opacity-40')} />
    </g>
  );
  let up = zero;
  let below = zero + 3;
  return (
    <g>
      <ellipse cx={x + w / 2 + d / 2} cy={base} rx={w} ry={6} className="fill-violet/40" />
      <path d={`M${x + w / 2 - 2} ${base} V${zero}`} strokeWidth="3" className="stroke-violet-glow/40" />
      {costs.map((l) => {
        const h = Math.abs(l.amount) * scale;
        const slab = faces(below, h, 'fill-loss-fill');
        below += h + 2;
        return slab;
      })}
      <path d={`M${x - 3} ${zero + 1.5} H${x + w + 3} L${x + w + d + 3} ${zero + 1.5 - d * 0.55} H${x + d - 3} Z`} className="fill-raised" />
      {gains.map((l) => {
        const h = Math.abs(l.amount) * scale;
        up -= h;
        const slab = faces(up, h, 'fill-gain-fill');
        up -= 2;
        return slab;
      })}
    </g>
  );
}

function DuskArt() {
  const { id, url } = useIds();
  const capitol = { cx: 214, cy: 384, rx: 184, ry: 46 };
  const home = { cx: 462, cy: 470, rx: 146, ry: 36 };
  // The building's steps (y 436 in its own frame) on the plinth's centre.
  const building = 0.54;
  // The house (base y 448, centre x 478 in its frame) on the left of its disc.
  const house = 0.6;
  return (
    <Art
      defs={
        <>
          <radialGradient id={id('horizon')} cx="0.5" cy="0.92" r="0.8">
            <stop offset="0" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.5]" />
            <stop offset="0.45" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.16]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0]" />
          </radialGradient>
          <linearGradient id={id('discTop')} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0.62]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0.38]" />
          </linearGradient>
          <linearGradient id={id('discSide')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.42]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-violet))] [stop-opacity:0.22]" />
          </linearGradient>
          <radialGradient id={id('window')} cx="0.5" cy="0.5" r="0.6">
            <stop offset="0" className="[stop-color:rgb(var(--c-ink))]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-glow))]" />
          </radialGradient>
          <radialGradient id={id('lamp')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0.55]" />
            <stop offset="1" className="[stop-color:rgb(var(--c-glow))] [stop-opacity:0]" />
          </radialGradient>
        </>
      }
    >
      {/* The violet hour, and a few stars thinning toward the horizon. */}
      <rect x="-400" y="0" width="1440" height="600" fill={url('horizon')} />
      <g className="fill-ink">
        {scatter(44, 3).map(([u, v], i) => (
          <circle key={i} cx={(u * 1440 - 400).toFixed(1)} cy={(v * v * 300).toFixed(1)} r={i % 6 === 0 ? 1.3 : 0.75} opacity={(0.2 + (1 - v) * 0.45).toFixed(2)} />
        ))}
      </g>

      {/* The Capitol on its plinth, set back on the left. */}
      <Disc {...capitol} depth={24} top={url('discTop')} side={url('discSide')} />
      <g style={MOONLIT}>
        <defs>
          <CapitolDefs id={id} />
        </defs>
        <g transform={`translate(${capitol.cx - 320 * building} ${capitol.cy + 6 - 436 * building}) scale(${building})`}>
          <CapitolBuilding url={url} />
        </g>
      </g>

      {/* The household on its disc in front, its windows lamplit, the ledger beside it. */}
      <Disc {...home} depth={20} top={url('discTop')} side={url('discSide')} />
      <ellipse cx={home.cx - 60} cy={home.cy + 4} rx="70" ry="16" fill={url('lamp')} />
      <g style={MOONLIT} transform={`translate(${home.cx - 52 - 478 * house} ${home.cy + 4 - 448 * house}) scale(${house})`}>
        <g className="stroke-fg/15" strokeWidth="1.4" strokeLinejoin="round">
          <path d={HOUSE.front} className="fill-raised" />
          <path d={HOUSE.side} className="fill-surface" />
          <path d={HOUSE.gable} className="fill-raised" />
          <path d={HOUSE.roof} className="fill-surface" />
          <path d={HOUSE.door} className="fill-violet" />
          {HOUSE.windows.map((d) => (
            <path key={d} d={d} fill={url('window')} />
          ))}
          <path d={HOUSE.sideWindow} fill={url('window')} opacity="0.85" />
        </g>
        <path d={HOUSE.roofRim} fill="none" strokeWidth="2.4" strokeLinecap="round" className="stroke-violet-glow/80" />
      </g>
      <DuskLedger x={home.cx + 50} base={home.cy + 6} />

      {/* Some of the light out again, as fireflies. */}
      <g className="fill-violet-glow">
        {scatter(14, 21).map(([u, v], i) => (
          <circle key={i} cx={(u * 520 + 60).toFixed(1)} cy={(250 + v * 230).toFixed(1)} r={1 + v * 1.3} opacity={(0.35 + v * 0.45).toFixed(2)} />
        ))}
      </g>
    </Art>
  );
}

// ---------------------------------------------------------------------------

const ART: Record<FilmShot['id'], () => ReactNode> = {
  record: () => <CapitolArt />,
  'plain-english': () => <BillArt />,
  household: () => <HouseholdArt />,
  number: () => <LedgerArt />,
  decide: () => <DuskArt />,
};

/** Whether a shot's still is a night pane (dusk), whatever the page theme. */
export const isNightShot = (id: FilmShot['id']) => id === 'decide';

/**
 * One shot's still, filling its (positioned) parent. The dusk still brings
 * its own night: a [data-night] pane with the night canvas behind it.
 */
export default function FilmPoster({ shot, className }: { shot: FilmShot['id']; className?: string }) {
  const Drawing = ART[shot];
  return (
    <div
      aria-hidden="true"
      data-decorative=""
      {...(isNightShot(shot) ? { 'data-night': '' } : {})}
      className={cn('absolute inset-0', isNightShot(shot) && 'bg-canvas', className)}
    >
      <Drawing />
    </div>
  );
}
