/**
 * Where things stand on the household diorama, and how a ledger column is
 * stacked: plain numbers with no three.js, so the landing film's timeline
 * (components/three/scenes/filmShots.ts) can aim light at the house and the
 * ledger, the household posters can draw what the 3D scene shows (they ship
 * in pages' first load), and tests can check the arithmetic.
 *
 * Diorama units: the plinth's top is y = 0, its centre the origin, and the
 * house faces +z. A ledger column stands on y = 0 of its own position.
 */

import type { Dwelling, HouseholdModel, HouseholdProp } from '@/lib/household';

export type Vec3 = readonly [number, number, number];

export const DIORAMA = {
  plinth: { radius: 1.3, height: 0.2 },
  /** The house body (walls), centred on `center` at ground level; the gable rises above `wall`. */
  house: { center: [-0.24, 0, -0.1] as Vec3, width: 0.62, depth: 0.5, wall: 0.34, gable: 0.24 },
  /** Where a ledger column stands beside the house. */
  ledger: [0.56, 0, -0.16] as Vec3,
  car: { position: [-0.8, 0, 0.42] as Vec3, rotationY: 0.55 },
  tree: [-0.86, 0, -0.5] as Vec3,
  /** Two figures by the front path: a grown-up and a child. */
  figures: [
    { position: [-0.02, 0, 0.5] as Vec3, height: 0.19, rotationY: -0.5 },
    { position: [0.11, 0, 0.45] as Vec3, height: 0.14, rotationY: -0.9 },
  ],
} as const;

export interface LedgerSlab {
  /** Signed dollars: + a gain (teal, above the baseline), − a cost (amber, below it). */
  amount: number;
  gain: boolean;
  /** Distance from the baseline to the slab's near and far faces (units, always ≥ 0). */
  inner: number;
  outer: number;
  /** Absolute heights of the slab's bottom and top faces. */
  bottom: number;
  top: number;
}

export interface LedgerLayout {
  /** Height of the pedestal the column stands on. */
  pedestal: number;
  /** Height of the zero line. Gains stack up from it, costs hang down from it. */
  baseline: number;
  slabs: LedgerSlab[];
  /** The taller of the two stacks (normalises a fill that runs out from the baseline). */
  extent: number;
  /** Net dollars (gains minus costs), and the height that marks it. */
  net: number;
  netY: number;
  /** Top of the whole column. */
  top: number;
}

export interface LedgerOptions {
  /** Units of height per dollar (linear: an honest scale). */
  unitsPerDollar?: number;
  /** Height of the pedestal under the lowest cost. */
  pedestal?: number;
  /** Gap between neighbouring slabs. */
  gap?: number;
}

export const LEDGER_DEFAULTS: Required<LedgerOptions> = { unitsPerDollar: 1 / 2200, pedestal: 0.05, gap: 0.014 };

/**
 * Stacks signed amounts into a ledger column: gains upward from the
 * baseline and costs downward from it, each slab's height linear in its
 * dollars (gaps aside), largest nearest the baseline. The baseline sits just
 * high enough for the costs to hang above the pedestal.
 */
export function ledgerLayout(amounts: readonly number[], options: LedgerOptions = {}): LedgerLayout {
  const unitsPerDollar = options.unitsPerDollar ?? LEDGER_DEFAULTS.unitsPerDollar;
  const pedestal = options.pedestal ?? LEDGER_DEFAULTS.pedestal;
  const gap = options.gap ?? LEDGER_DEFAULTS.gap;
  const finite = amounts.filter((a) => Number.isFinite(a) && a !== 0);
  const gains = finite.filter((a) => a > 0).sort((a, b) => b - a);
  const costs = finite.filter((a) => a < 0).sort((a, b) => a - b);

  const stack = (list: number[]) => {
    let d = 0;
    return list.map((amount) => {
      const inner = d + gap / 2;
      const outer = inner + Math.abs(amount) * unitsPerDollar;
      d = outer + gap / 2;
      return { amount, gain: amount > 0, inner, outer };
    });
  };
  const up = stack(gains);
  const down = stack(costs);
  const costDepth = down.length ? down[down.length - 1].outer + gap / 2 : 0;
  const baseline = pedestal + costDepth;

  const slabs: LedgerSlab[] = [
    ...up.map((s) => ({ ...s, bottom: baseline + s.inner, top: baseline + s.outer })),
    ...down.map((s) => ({ ...s, bottom: baseline - s.outer, top: baseline - s.inner })),
  ];
  const upExtent = up.length ? up[up.length - 1].outer : 0;
  const extent = Math.max(upExtent, costDepth, 1e-6);
  const net = finite.reduce((sum, a) => sum + a, 0);
  return { pedestal, baseline, slabs, extent, net, netY: baseline + net * unitsPerDollar, top: baseline + upExtent };
}

/**
 * How much of a slab shows (0..1) when the fill front has run `front`
 * (0..1, a share of the layout's extent) out from the baseline.
 */
export function slabShown(slab: LedgerSlab, front: number, extent: number): number {
  const reach = Math.min(1, Math.max(0, front)) * extent;
  const h = slab.outer - slab.inner;
  return h <= 0 ? 0 : Math.min(1, Math.max(0, (reach - slab.inner) / h));
}

// ---------------------------------------------------------------------------
// A person's household (lib/household.ts) on the same plinth: the onboarding
// diorama, the avatar and the dashboard's ledger all place it from here, the
// 3D kit (HouseholdDiorama) and the CSS posters alike. Every piece has a
// fixed spot, so adding one never moves another, and the ledger's spot
// (DIORAMA.ledger) stays clear for a column or monolith beside the home.

/** How far from DIORAMA.ledger nothing of the household stands. */
export const LEDGER_CLEARANCE = 0.24;

/** A building's massing, standing on the house's spot (DIORAMA.house.center) and facing +z. */
export type DwellingSpec =
  /** Walls under a pitched roof; two storeys get a second row of windows. */
  | { kind: 'gabled'; width: number; depth: number; wall: number; gable: number; storeys: 1 | 2 }
  /** A flat-roofed block with stacked windows (floors × bays on the front). */
  | { kind: 'block'; width: number; depth: number; height: number; floors: number; bays: number }
  /** A long, low hall with a columned porch and a lantern on the roof. */
  | { kind: 'hall'; width: number; depth: number; height: number; bays: number };

/** The building for each kind of home. `house` is the landing film's house. */
export const DWELLINGS = {
  house: { kind: 'gabled', width: DIORAMA.house.width, depth: DIORAMA.house.depth, wall: DIORAMA.house.wall, gable: DIORAMA.house.gable, storeys: 1 },
  cottage: { kind: 'gabled', width: 0.46, depth: 0.4, wall: 0.22, gable: 0.3, storeys: 1 },
  'family-home': { kind: 'gabled', width: 0.72, depth: 0.52, wall: 0.5, gable: 0.27, storeys: 2 },
  apartment: { kind: 'block', width: 0.5, depth: 0.44, height: 0.84, floors: 4, bays: 3 },
  campus: { kind: 'hall', width: 0.88, depth: 0.4, height: 0.4, bays: 6 },
} as const satisfies Record<Dwelling, DwellingSpec>;

/** The building's footprint half-extents (x, z) around DIORAMA.house.center, porch included. */
export function dwellingFootprint(d: Dwelling): { halfWidth: number; front: number; back: number } {
  const s: DwellingSpec = DWELLINGS[d];
  return { halfWidth: s.width / 2, front: s.depth / 2 + (s.kind === 'hall' ? 0.14 : 0.03), back: s.depth / 2 };
}

/** The building's highest point (roof, parapet or lantern). */
export function dwellingTop(d: Dwelling): number {
  const s: DwellingSpec = DWELLINGS[d];
  if (s.kind === 'gabled') return s.wall + s.gable;
  if (s.kind === 'block') return s.height + 0.1;
  return s.height + 0.16;
}

/** Anything set on a wall (a window, a door) stands this far proud of it. */
export const WALL_FACE = 0.006;

/** A window: [x, y, z, rotationY, width, height] in building-local units (centre at ground). */
export type DwellingWindow = [number, number, number, number, number, number];

/** The film's house windows: two at the front either side of the door, two on the left, one on the right. */
const HOUSE_WINDOWS: DwellingWindow[] = [
  [-0.19, 0.2, DIORAMA.house.depth / 2 + WALL_FACE, 0, 0.1, 0.11],
  [0.19, 0.2, DIORAMA.house.depth / 2 + WALL_FACE, 0, 0.1, 0.11],
  [-DIORAMA.house.width / 2 - WALL_FACE, 0.2, 0.11, -Math.PI / 2, 0.11, 0.11],
  [-DIORAMA.house.width / 2 - WALL_FACE, 0.2, -0.11, -Math.PI / 2, 0.11, 0.11],
  [DIORAMA.house.width / 2 + WALL_FACE, 0.2, 0, Math.PI / 2, 0.13, 0.11],
];

/** Rows of windows across the front (`xs`) and down both sides (`zs`) of a flat-sided building. */
function gridWindows(width: number, depth: number, rows: number[], xs: number[], zs: number[], size: [number, number], skip?: (x: number, row: number) => boolean) {
  return rows.flatMap((y, row): DwellingWindow[] => [
    ...xs.filter((x) => !skip?.(x, row)).map((x): DwellingWindow => [x, y, depth / 2 + WALL_FACE, 0, size[0], size[1]]),
    ...zs.flatMap((z): DwellingWindow[] => [
      [-width / 2 - WALL_FACE, y, z, -Math.PI / 2, size[0], size[1]],
      [width / 2 + WALL_FACE, y, z, Math.PI / 2, size[0], size[1]],
    ]),
  ]);
}

/**
 * Every window of a building. Gabled homes follow the house (a second storey
 * adds a row of three); the block stacks floors × bays with the door's slot
 * left open; the hall has tall windows either side of its porch.
 */
export function dwellingWindows(d: Dwelling): DwellingWindow[] {
  const s: DwellingSpec = DWELLINGS[d];
  if (d === 'house') return HOUSE_WINDOWS;
  if (s.kind === 'gabled') {
    const fx = s.width * 0.306;
    const rows = s.storeys === 2 ? [s.wall * 0.3, s.wall * 0.72] : [s.wall * 0.59];
    return rows.flatMap((y, i): DwellingWindow[] => [
      ...(i === 0 ? [-fx, fx] : [-fx, 0, fx]).map((x): DwellingWindow => [x, y, s.depth / 2 + WALL_FACE, 0, 0.1, 0.11]),
      [-s.width / 2 - WALL_FACE, y, s.depth * 0.22, -Math.PI / 2, 0.11, 0.11],
      [-s.width / 2 - WALL_FACE, y, -s.depth * 0.22, -Math.PI / 2, 0.11, 0.11],
      [s.width / 2 + WALL_FACE, y, 0, Math.PI / 2, 0.13, 0.11],
    ]);
  }
  if (s.kind === 'block') {
    const rows = Array.from({ length: s.floors }, (_, f) => (f + 0.55) * (s.height / s.floors));
    const xs = Array.from({ length: s.bays }, (_, b) => (b - (s.bays - 1) / 2) * s.width * 0.3);
    return gridWindows(s.width, s.depth, rows, xs, [s.depth * 0.22, -s.depth * 0.22], [0.085, 0.1], (x, row) => row === 0 && Math.abs(x) < 0.01);
  }
  const side = s.bays / 2;
  const xs = Array.from({ length: s.bays }, (_, i) => (i < side ? -1 : 1) * (0.24 + (i < side ? i : i - side) * 0.08));
  return gridWindows(s.width, s.depth, [s.height * 0.47], xs, [s.depth * 0.2, -s.depth * 0.2], [0.05, 0.16]);
}

/** Where the grown-ups stand (by the front path), then the dependents, in front of them. */
const FIGURE_SLOTS: { position: Vec3; rotationY: number }[] = [
  { position: DIORAMA.figures[0].position, rotationY: DIORAMA.figures[0].rotationY },
  { position: [0.13, 0, 0.45], rotationY: -0.8 },
  { position: [0.06, 0, 0.64], rotationY: -0.55 },
  { position: [0.21, 0, 0.6], rotationY: -0.75 },
  { position: [0.14, 0, 0.77], rotationY: -0.45 },
  { position: [0.31, 0, 0.72], rotationY: -0.7 },
];

/** Heights: a grown-up, a grown-up dependent, a child. */
export const FIGURE_HEIGHTS = { adult: 0.19, partner: 0.18, adultDependent: 0.17, dependent: 0.15, child: 0.125 } as const;

/**
 * Where each debt stands. The key lies at the doorstep, the car keeps the
 * film's parking pad, and the rest stand around the plinth's right rim,
 * turned toward the camera.
 */
export const PROP_SPOTS: Record<HouseholdProp, { position: Vec3; rotationY: number }> = {
  'mortgage-key': { position: [-0.46, 0, 0.34], rotationY: 0.65 },
  car: { position: DIORAMA.car.position, rotationY: DIORAMA.car.rotationY },
  ledger: { position: [-0.42, 0, 0.78], rotationY: -0.25 },
  briefcase: { position: [0.36, 0, 0.88], rotationY: -0.45 },
  'grad-cap': { position: [0.71, 0, 0.55], rotationY: -0.6 },
  card: { position: [0.91, 0, 0.18], rotationY: -0.85 },
  medical: { position: [0.92, 0, -0.32], rotationY: -1.05 },
};

/** The debts' objects are drawn this much larger than life (next to the people), so they read at a glance. */
export const PROP_SCALE = 1.3;

export interface PlacedFigure {
  /** A piece id (see householdPieces). */
  id: string;
  position: Vec3;
  rotationY: number;
  height: number;
  /** A grown-up of the household, rather than a dependent. */
  adult: boolean;
}

export interface PlacedProp {
  id: string;
  kind: HouseholdProp;
  position: Vec3;
  rotationY: number;
}

export interface HouseholdLayout {
  dwelling: Dwelling | null;
  figures: PlacedFigure[];
  props: PlacedProp[];
  state: string | null;
}

/** Nothing answered yet that the plinth can show (lib/household.ts describes this as an empty plinth). */
export function isEmptyHousehold(m: HouseholdModel): boolean {
  return !m.dwelling && m.dependentsCount === 0 && m.props.length === 0 && !m.state;
}

/**
 * Where the model's pieces stand. The grown-ups appear with the first answer
 * the plinth can show (an empty plinth has nobody on it); dependents are
 * drawn up to MAX_FIGURES (the caption says the real count).
 */
export function householdLayout(m: HouseholdModel): HouseholdLayout {
  const figures: PlacedFigure[] = [];
  if (!isEmptyHousehold(m)) {
    for (let i = 0; i < m.adults; i++) {
      const slot = FIGURE_SLOTS[i];
      figures.push({ id: `adult-${i + 1}`, ...slot, height: i ? FIGURE_HEIGHTS.partner : FIGURE_HEIGHTS.adult, adult: true });
    }
    for (let i = 0; i < Math.min(m.figures, FIGURE_SLOTS.length - 2); i++) {
      const slot = FIGURE_SLOTS[i + 2];
      // Ages unknown: a figure between a child and a grown-up, so the drawing claims neither.
      const age = !m.agesKnown ? 'dependent' : m.youngDependents ? 'child' : 'adult';
      figures.push({
        id: `dependent-${i + 1}:${age}`,
        ...slot,
        height: age === 'child' ? FIGURE_HEIGHTS.child : age === 'adult' ? FIGURE_HEIGHTS.adultDependent : FIGURE_HEIGHTS.dependent,
        adult: false,
      });
    }
  }
  // Only pieces the kit can draw (a model built from untrusted input can't break the drawing).
  const own = (o: object, k: unknown) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  return {
    dwelling: own(DWELLINGS, m.dwelling) ? m.dwelling : null,
    figures,
    props: m.props.filter((kind) => own(PROP_SPOTS, kind)).map((kind) => ({ id: `prop:${kind}`, kind, ...PROP_SPOTS[kind] })),
    state: m.state,
  };
}

/** The ids of the model's pieces: the building, each figure, each debt and the state's plaque. */
export function householdPieces(m: HouseholdModel): string[] {
  const l = householdLayout(m);
  return [
    ...(l.dwelling ? [`dwelling:${l.dwelling}`] : []),
    ...l.figures.map((f) => f.id),
    ...l.props.map((p) => p.id),
    ...(l.state ? ['state'] : []),
  ];
}

/** The piece `next` has that `previous` didn't (the first, if several), or null when nothing was added. */
export function newestPiece(previous: HouseholdModel, next: HouseholdModel): string | null {
  const had = new Set(householdPieces(previous));
  return householdPieces(next).find((id) => !had.has(id)) ?? null;
}

/** Where the state's plaque sits: on the plinth's drum, facing the onboarding camera. */
export const PLAQUE: Vec3 = (() => {
  const r = DIORAMA.plinth.radius + 0.005;
  const a = Math.atan2(-0.5, 0.86);
  return [Math.sin(a) * r, -DIORAMA.plinth.height * 0.5, Math.cos(a) * r] as const;
})();

/** On the plinth's top, just inside its edge above the plaque. */
const STATE_SPOT: Vec3 = [PLAQUE[0] * 0.88, 0, PLAQUE[2] * 0.88];

/** The ground point a piece stands on (for a pulse of light under it), or null if the model has no such piece. */
export function piecePosition(layout: HouseholdLayout, id: string): Vec3 | null {
  if (id === 'state') return layout.state ? STATE_SPOT : null;
  if (id.startsWith('dwelling:')) return layout.dwelling ? DIORAMA.house.center : null;
  return layout.figures.find((f) => f.id === id)?.position ?? layout.props.find((p) => p.id === id)?.position ?? null;
}

// ---------------------------------------------------------------------------
// The household's camera, shared by the 3D scene and the posters so the two
// frame the model the same way in any box.

export interface HouseholdShot {
  position: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
}

const unit = (x: number, y: number, z: number): Vec3 => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

/**
 * From the front left and a little above (as the film's household is shot):
 * the door, the people on the path and the debts on the right rim all face
 * it. `frame` is what must fit in the box around the target, [width, height]
 * in diorama units.
 */
export const HOUSEHOLD_CAMERA = {
  fov: 30,
  build: { direction: unit(-0.5, 0.4, 0.86), target: [-0.03, 0.1, 0.04] as Vec3, frame: [2.95, 2.3] as const },
  // The avatar turns on its plinth, so it frames the whole drum from a little higher.
  avatar: { direction: unit(-0.5, 0.56, 0.86), target: [0, 0.16, 0] as Vec3, frame: [3.0, 2.6] as const },
} as const;

/** How far the reveal pulls back (a share of the distance) and swings round toward the front (radians). */
const REVEAL_PULL = 0.2;
const REVEAL_SWING = 0.22;

/**
 * The camera for a box of `aspect` (width / height). `reveal` 0..1 is the
 * finished profile's moment in the build view: the camera pulls back and
 * swings a little toward the front.
 */
export function householdShot(mode: 'build' | 'avatar', aspect: number, reveal = 0): HouseholdShot {
  const c = HOUSEHOLD_CAMERA[mode];
  const k = Math.min(1, Math.max(0, reveal));
  const half = Math.tan((HOUSEHOLD_CAMERA.fov * Math.PI) / 360);
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  // A wide, short band (the diorama above a phone's form) frames the household a little closer, the whole drum still in view.
  const band = mode === 'build' ? Math.min(1, Math.max(0, (a - 1.5) / 0.7)) : 0;
  const frameHeight = c.frame[1] - 0.15 * band;
  const distance = Math.max(frameHeight / (2 * half), c.frame[0] / (2 * half * a)) * (1 + REVEAL_PULL * k);
  const swing = REVEAL_SWING * k;
  const [dx, dy, dz] = c.direction;
  const [cs, sn] = [Math.cos(swing), Math.sin(swing)];
  const dir = unit(dx * cs + dz * sn, dy + 0.05 * k, -dx * sn + dz * cs);
  const [tx, ty, tz] = [c.target[0], c.target[1], c.target[2] - 0.04 * band];
  return { position: [tx + dir[0] * distance, ty + dir[1] * distance, tz + dir[2] * distance], target: [tx, ty, tz], fov: HOUSEHOLD_CAMERA.fov };
}

/**
 * Projects diorama points through a shot into a box of `aspect`: x and y in
 * 0..1 across the box (y down), and the depth in front of the camera. The
 * same pinhole as the 3D camera, so posters drawn from it match the scene.
 */
export function householdProjector(shot: HouseholdShot, aspect: number) {
  const [px, py, pz] = shot.position;
  const f = unit(shot.target[0] - px, shot.target[1] - py, shot.target[2] - pz);
  // right = forward × up(0,1,0); up' = right × forward.
  const r = unit(-f[2], 0, f[0]);
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const half = Math.tan((shot.fov * Math.PI) / 360);
  return (x: number, y: number, z: number) => {
    const d = [x - px, y - py, z - pz];
    const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    const sx = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (depth * half * aspect);
    const sy = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (depth * half);
    return { x: (sx + 1) / 2, y: (1 - sy) / 2, depth };
  };
}
