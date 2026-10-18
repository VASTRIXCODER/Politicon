import type { HouseholdModel } from '@/lib/household';
import {
  LEDGER_VIEW,
  LEDGER_WORLD,
  ledgerGeometry,
  ledgerViewBounds,
  projectLedger,
  type LedgerGeometry,
  type LedgerModel,
  type Vec3,
} from '@/lib/ledger';
import { cn } from '@/lib/utils';

/*
 * "Your Ledger" as a server-rendered vector drawing: the poster its SceneView
 * shows before (and, without 3D, instead of) the WebGL monolith. Drawn from
 * the same geometry (lib/ledger.ts ledgerGeometry) and the same view
 * (projectLedger: the scene's yaw and pitch, flattened), so the hand-off is a
 * cross-fade between two pictures of one model: the paper plinth, the
 * porcelain foot, amber costs hanging from the lit violet baseline, teal
 * gains stacked on it, clear glass above, the ring of light at the net, the
 * staff's marks, and the household at the foot when it's known.
 *
 * No hooks and no handlers, so it renders on the server; the page passes the
 * focused slab (the readout's or the scene's) and it lights that slab and
 * slides it out, as the scene does, through props alone. Decorative
 * (SceneView hides it from assistive tech; the readout states every figure).
 */

export interface LedgerPosterProps {
  model: LedgerModel;
  focus?: string | null;
  household?: HouseholdModel | null;
  className?: string;
  /** Prefix for the drawing's gradient ids (only needed with two posters on one page). */
  id?: string;
}

const W = LEDGER_WORLD;
/** Drawing units per world unit. */
const S = 200;

type Pt = [number, number];
type Faces = { front: Pt[]; right: Pt[]; top: Pt[] };

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

const path = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
const line = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}`;

function projection(withHousehold: boolean) {
  const b = ledgerViewBounds(withHousehold);
  // The same air the scene's camera leaves (its pad, and its pull-back for perspective).
  const air = 0.24;
  const halfW = ((b.maxX - b.minX) / 2) * 1.1 + air;
  const halfH = ((b.maxY - b.minY) / 2) * 1.1 + air;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const width = halfW * 2 * S;
  const height = halfH * 2 * S;
  const at = (v: Vec3): Pt => {
    const [x, y] = projectLedger(v);
    return [(x - cx + halfW) * S, (cy - y + halfH) * S];
  };
  return { at, width, height };
}

type At = (v: Vec3) => Pt;

/** The three faces the composed view sees of an axis-aligned box: front (+z), right (+x) and top. */
function boxFaces(at: At, b: Box): Faces {
  return {
    front: [at([b.x0, b.y0, b.z1]), at([b.x1, b.y0, b.z1]), at([b.x1, b.y1, b.z1]), at([b.x0, b.y1, b.z1])],
    right: [at([b.x1, b.y0, b.z1]), at([b.x1, b.y0, b.z0]), at([b.x1, b.y1, b.z0]), at([b.x1, b.y1, b.z1])],
    top: [at([b.x0, b.y1, b.z1]), at([b.x1, b.y1, b.z1]), at([b.x1, b.y1, b.z0]), at([b.x0, b.y1, b.z0])],
  };
}

const column = (y0: number, y1: number, grow = 0, slide = 0): Box => ({
  x0: -W.width / 2 - grow,
  x1: W.width / 2 + grow,
  y0,
  y1,
  z0: -W.depth / 2 - grow + slide,
  z1: W.depth / 2 + grow + slide,
});

/** A box drawn as faces: its fill on every face (and a tint over it), the right one shaded, the top one lit. */
function Solid({ faces, fill, tint, edge }: { faces: Faces; fill: string; tint?: string; edge?: string }) {
  return (
    <g>
      <path d={path(faces.right)} className={fill} />
      {tint && <path d={path(faces.right)} className={tint} />}
      <path d={path(faces.right)} fill="#000" fillOpacity={0.16} />
      <path d={path(faces.top)} className={fill} />
      {tint && <path d={path(faces.top)} className={tint} />}
      <path d={path(faces.top)} fill="#fff" fillOpacity={0.32} />
      <path d={path(faces.front)} className={fill} />
      <path d={path(faces.front)} className={cn(tint ?? 'fill-none', edge)} strokeWidth={edge ? 1 : undefined} />
    </g>
  );
}

/** The rectangle around the column at height y, split into its far edges and its near ones. */
function loop(at: At, y: number, grow: number): { back: Pt[]; front: Pt[] } {
  const x0 = -W.width / 2 - grow;
  const x1 = W.width / 2 + grow;
  const z0 = -W.depth / 2 - grow;
  const z1 = W.depth / 2 + grow;
  return {
    back: [at([x1, y, z0]), at([x0, y, z0]), at([x0, y, z1])],
    front: [at([x0, y, z1]), at([x1, y, z1]), at([x1, y, z0])],
  };
}

const TONE_FILL = { gain: 'fill-gain-fill/60', loss: 'fill-loss-fill/60' } as const;
const TONE_EDGE = { gain: 'stroke-gain-fill', loss: 'stroke-loss-fill' } as const;

function Column({ at, geo, focus }: { at: At; geo: LedgerGeometry; focus: string | null }) {
  const active = geo.slabs.some((s) => s.id === focus) ? focus : null;
  const order = [...geo.slabs].sort((a, b) => a.y0 - b.y0);
  const below = order.filter((s) => s.tone === 'loss');
  const above = order.filter((s) => s.tone === 'gain');
  const slab = (s: (typeof order)[number]) => {
    const on = s.id === active;
    return (
      <g key={s.id} opacity={active && !on ? 0.45 : 1}>
        <Solid faces={boxFaces(at, column(s.y0, s.y1, 0, on ? W.slideOut : 0))} fill={on ? s.tone === 'gain' ? 'fill-gain-fill/80' : 'fill-loss-fill/80' : TONE_FILL[s.tone]} edge={on ? 'stroke-primary' : TONE_EDGE[s.tone]} />
      </g>
    );
  };
  const glass = boxFaces(at, column(geo.glass.y0, geo.glass.y1));
  const plate = W.plate.thickness / 2;
  const ring = geo.net === null ? null : loop(at, geo.net, 0.012);
  const dashed = geo.empty ? loop(at, geo.baseline, W.plate.overhang) : null;

  return (
    <>
      {/* The far half of the net's ring and of the empty baseline, behind the column. */}
      {ring && <path d={line(ring.back)} fill="none" className="stroke-violet-glow/25" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />}
      {dashed && <path d={line(dashed.back)} fill="none" className="stroke-muted/50" strokeWidth={2} strokeDasharray="9 7" />}

      <Solid faces={boxFaces(at, column(0, geo.footTop, 0.006))} fill="fill-raised" edge="stroke-fg/10" />
      {below.map(slab)}
      {!geo.empty && (
        // The baseline: porcelain lit violet from within, its front edge glowing.
        <>
          <Solid faces={boxFaces(at, column(geo.baseline - plate, geo.baseline + plate, W.plate.overhang))} fill="fill-raised" tint="fill-primary/25" edge="stroke-primary/70" />
          <path d={line(loop(at, geo.baseline - plate, W.plate.overhang).front)} fill="none" className="stroke-primary/60" strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}
      {above.map(slab)}
      {/* The clear glass above. */}
      <g>
        <path d={path(glass.right)} className="fill-primary/[0.09]" />
        <path d={path(glass.top)} className="fill-primary/[0.05] stroke-primary/25" strokeWidth={1} />
        <path d={path(glass.front)} className="fill-primary/[0.05] stroke-primary/30" strokeWidth={1} />
        {/* A sheen down the glass. */}
        <path d={line([glass.front[0], glass.front[3]])} className="stroke-raised/70" strokeWidth={2} />
      </g>

      {ring && (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={line(ring.front)} className="stroke-violet-glow/15" strokeWidth={16} />
          <path d={line(ring.front)} className="stroke-violet-glow/30" strokeWidth={7} />
          <path d={line(ring.front)} className="stroke-violet-glow" strokeWidth={2.5} />
        </g>
      )}
      {dashed && <path d={line(dashed.front)} fill="none" className="stroke-muted/70" strokeWidth={2} strokeDasharray="9 7" />}
    </>
  );
}

function Staff({ at, geo }: { at: At; geo: LedgerGeometry }) {
  if (!geo.scale) return null;
  const { x, z, tick } = W.staff;
  const top = (1 - W.head) * W.height;
  const mark = (y: number, long: boolean) => {
    const half = (long ? tick * 1.6 : tick) / 2;
    return line([at([x - half, y, z]), at([x + half, y, z])]);
  };
  return (
    <g fill="none" strokeLinecap="round">
      <path d={line([at([x, 0, z]), at([x, top, z])])} className="stroke-muted/60" strokeWidth={2} />
      {geo.ticks.map((y) => (
        <path key={y.toFixed(4)} d={mark(y, false)} className="stroke-muted/80" strokeWidth={1.5} />
      ))}
      <path d={mark(geo.baseline, true)} className="stroke-muted" strokeWidth={2} />
    </g>
  );
}

/** Buildings in the diorama's own units (after DWELLINGS in components/three/kit/dioramaLayout.ts). */
const BUILDINGS: Record<NonNullable<HouseholdModel['dwelling']>, { w: number; d: number; wall: number; gable: number }> = {
  house: { w: 0.62, d: 0.5, wall: 0.34, gable: 0.24 },
  cottage: { w: 0.46, d: 0.4, wall: 0.25, gable: 0.25 },
  'family-home': { w: 0.72, d: 0.52, wall: 0.5, gable: 0.27 },
  apartment: { w: 0.5, d: 0.44, wall: 0.84, gable: 0 },
  campus: { w: 0.88, d: 0.4, wall: 0.4, gable: 0 },
};

/**
 * The household at the foot: the user's diorama in miniature on its paper
 * disc (the scene stands the kit's HouseholdDiorama there), drawn as its
 * building and its people.
 */
function Household({ at, model }: { at: At; model: HouseholdModel }) {
  const { position, rotationY: r, scale: k, plinth, house } = W.household;
  const [hx, , hz] = position;
  const lift = plinth.height * k;
  // A point in the diorama's own units, on top of its disc.
  const local: At = ([lx, ly, lz]) => {
    const x = (house[0] + lx) * k;
    const z = (house[2] + lz) * k;
    return at([hx + x * Math.cos(r) + z * Math.sin(r), lift + ly * k, hz - x * Math.sin(r) + z * Math.cos(r)]);
  };
  const b = BUILDINGS[model.dwelling ?? 'house'];
  const w = b.w / 2;
  const d = b.d / 2;

  const front: Pt[] = [local([-w, 0, d]), local([w, 0, d]), local([w, b.wall, d])];
  if (b.gable) front.push(local([0, b.wall + b.gable, d]));
  front.push(local([-w, b.wall, d]));
  const right: Pt[] = [local([w, 0, d]), local([w, 0, -d]), local([w, b.wall, -d]), local([w, b.wall, d])];
  const roofs: Pt[][] = b.gable
    ? [
        [local([-w, b.wall, d]), local([0, b.wall + b.gable, d]), local([0, b.wall + b.gable, -d]), local([-w, b.wall, -d])],
        [local([0, b.wall + b.gable, d]), local([w, b.wall, d]), local([w, b.wall, -d]), local([0, b.wall + b.gable, -d])],
      ]
    : [[local([-w, b.wall, d]), local([w, b.wall, d]), local([w, b.wall, -d]), local([-w, b.wall, -d])]];
  const door: Pt[] = [local([-0.055, 0, d]), local([0.055, 0, d]), local([0.055, 0.2, d]), local([-0.055, 0.2, d])];

  // Grown-ups, then dependents (children shorter), in a row by the front path.
  const heights: number[] = [];
  for (let i = 0; i < model.adults; i++) heights.push(0.19);
  for (let i = 0; i < model.figures; i++) heights.push(!model.agesKnown ? 0.16 : model.youngDependents ? 0.14 : 0.18);

  const disc = at([hx, lift, hz]);
  const foot = at([hx, 0, hz]);
  const rx = plinth.radius * k * S;
  const ry = rx * Math.sin(LEDGER_VIEW.pitch);
  return (
    <g>
      <ellipse cx={foot[0]} cy={foot[1]} rx={rx} ry={ry} className="fill-surface" />
      <ellipse cx={foot[0]} cy={foot[1]} rx={rx} ry={ry} fill="#000" fillOpacity={0.08} />
      <rect x={disc[0] - rx} y={disc[1]} width={rx * 2} height={foot[1] - disc[1]} className="fill-surface" />
      <rect x={disc[0] - rx} y={disc[1]} width={rx * 2} height={foot[1] - disc[1]} fill="#000" fillOpacity={0.08} />
      <ellipse cx={disc[0]} cy={disc[1]} rx={rx} ry={ry} className="fill-surface stroke-fg/10" strokeWidth={1} />
      <path d={path(right)} className="fill-raised" />
      <path d={path(right)} fill="#000" fillOpacity={0.1} />
      {roofs.map((roof, i) => (
        <g key={i}>
          <path d={path(roof)} className="fill-raised" />
          <path d={path(roof)} fill="#000" fillOpacity={i ? 0.04 : 0.08} />
        </g>
      ))}
      <path d={path(front)} className="fill-raised stroke-fg/25" strokeWidth={1} />
      <path d={path(door)} className="fill-primary" />
      {heights.map((h, i) => {
        const x = (i - (heights.length - 1) / 2) * 0.13;
        const rr = h * 0.15;
        const [fx, fy] = local([x, 0, d + 0.26]);
        const [, hy] = local([x, h - rr, d + 0.26]);
        const body = h * 0.64 * k * S;
        return (
          <g key={i} className="fill-raised stroke-fg/30" strokeWidth={0.75}>
            <rect x={fx - rr * k * S} y={fy - body} width={rr * 2 * k * S} height={body} rx={rr * 0.8 * k * S} />
            <circle cx={fx} cy={hy} r={rr * k * S} />
          </g>
        );
      })}
    </g>
  );
}

export default function LedgerPoster({ model, focus = null, household, className, id = 'ledger' }: LedgerPosterProps) {
  const home = household?.dwelling ? household : null;
  const { at, width, height } = projection(!!home);
  const geo = ledgerGeometry(model);
  const R = W.plinth.radius;
  const top = at([0, 0, 0]);
  const foot = at([0, -W.plinth.height, 0]);
  const ry = R * Math.sin(LEDGER_VIEW.pitch) * S;
  const rx = R * S;
  const inlay = R - 0.105;

  return (
    <svg
      viewBox={`0 0 ${width.toFixed(0)} ${height.toFixed(0)}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn('absolute inset-0 h-full w-full', className)}
      aria-hidden="true"
      focusable="false"
      data-decorative=""
    >
      <defs>
        <radialGradient id={`${id}-shadow`}>
          <stop offset="0" stopColor="#000" stopOpacity="0.18" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* The paper plinth: its shadow, its side, its top and the violet inlay. */}
      <ellipse cx={foot[0]} cy={foot[1] + ry * 0.4} rx={rx * 1.45} ry={ry * 2.2} fill={`url(#${id}-shadow)`} />
      <ellipse cx={foot[0]} cy={foot[1]} rx={rx} ry={ry} className="fill-surface" />
      <ellipse cx={foot[0]} cy={foot[1]} rx={rx} ry={ry} fill="#000" fillOpacity={0.07} />
      <rect x={top[0] - rx} y={top[1]} width={rx * 2} height={foot[1] - top[1]} className="fill-surface" />
      <rect x={top[0] - rx} y={top[1]} width={rx * 2} height={foot[1] - top[1]} fill="#000" fillOpacity={0.07} />
      <ellipse cx={top[0]} cy={top[1]} rx={rx} ry={ry} className="fill-surface stroke-fg/10" strokeWidth={1} />
      <ellipse cx={top[0]} cy={top[1]} rx={inlay * S} ry={inlay * Math.sin(LEDGER_VIEW.pitch) * S} fill="none" className="stroke-primary/35" strokeWidth={1} />
      <ellipse cx={top[0]} cy={top[1]} rx={W.width * 1.3 * S} ry={W.depth * 1.7 * Math.sin(LEDGER_VIEW.pitch) * S} className="fill-fg/[0.06]" />

      {home && <Household at={at} model={home} />}
      <Column at={at} geo={geo} focus={focus} />
      <Staff at={at} geo={geo} />
    </svg>
  );
}
