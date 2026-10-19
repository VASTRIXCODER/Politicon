/**
 * "The Transmission", the policy detail page's 3D layer: how a bill's
 * estimated effect travels from the bill into one person's money. Five
 * scenes (components/three/scenes/{TransmissionHero, FlowSankey,
 * TimelineRibbon, VulnerabilityCrystal, SpendingTerrain}) and their server
 * posters (components/impact/posters/*) all read the mappers and layouts in
 * this file, so the picture, the poster and the page's own figures can't
 * drift apart.
 *
 * Pure and three-free (no React either): DOM code imports it directly.
 *
 * INPUT: the normalized analysis (lib/analysisSchema.ts coerceFullAnalysis),
 * or any object with the fields a mapper reads. Every dollar is signed from
 * the user's side: + saves them money (or pays them), − costs them.
 *
 * HONESTY RULES, kept by every mapper below:
 * - Only real fields. Nothing is projected, smoothed, extrapolated or
 *   filled in; the one derived number (the flows' "Other effects"
 *   rest) is plain arithmetic on two real fields.
 * - Linear scales. Heights and widths are proportional to dollars (or to a
 *   0..100 score), on one scale per picture, with round marks the page can
 *   name (`*ScaleNote`).
 * - Uncertainty is shown, never hidden: the timeline ribbon's width is
 *   1 − confidence, and an unrated confidence is drawn at the widest.
 * - Missing data gives an empty list, so the page shows its empty state
 *   rather than a picture of zeros.
 * - Words carry the meaning (`describe*`): the scenes are decoration
 *   (their canvas is aria-hidden), the SceneView label and the page's
 *   captions say what they show, with signs and "saves you" / "costs you".
 */
import type { CategoryImpacts, MonthPoint, SpendingVelocityItem, VulnerabilityScores } from '@/types';
import { formatUSD, impactWords } from '@/lib/format';
import { RADAR_LABELS } from '@/lib/simpleMode';

export type TransmissionTone = 'gain' | 'loss' | 'neutral';
export type Vec3 = readonly [number, number, number];

// ---------------------------------------------------------------------------
// Small shared helpers

const finite = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Whole dollars, never −0. */
const whole = (n: number): number => {
  const r = Math.round(finite(n));
  return Object.is(r, -0) ? 0 : r;
};

/** A 0..1 share to two decimals, never −0. */
const share = (n: number): number => {
  const r = Math.round(Math.min(1, Math.max(0, finite(n))) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

export const toneOf = (v: number): TransmissionTone => (v > 0 ? 'gain' : v < 0 ? 'loss' : 'neutral');

/** The smallest of 1, 2, 2.5, 5 × 10ⁿ that is ≥ x (0 for nothing). */
export function niceStep(x: number): number {
  if (!(x > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x * (1 - 1e-9)) return m * p;
  return 10 * p;
}

export interface TransmissionScale {
  /** Dollars the picture's full height (or width) spans: a whole number of steps. */
  max: number;
  /** Dollars between two marks. */
  step: number;
}

/** A linear scale for `span` dollars with about `marks` round steps, or null when there is nothing to scale. */
export function scaleFor(span: number, marks = 4): TransmissionScale | null {
  const s = Math.abs(finite(span));
  if (!(s >= 1)) return null;
  const step = Math.max(1, niceStep(s / marks));
  return { step, max: Math.ceil(s / step - 1e-9) * step };
}

const yearly = (n: number) => `${formatUSD(n, { signed: true })} a year`;
const monthly = (n: number) => `${formatUSD(n, { signed: true })} a month`;
const signed = (n: number, per: (n: number) => string) => `${per(n)} (${impactWords(n)})`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

// ---------------------------------------------------------------------------
// The composed views. Every scene is shot from one angle (yaw about y, then
// pitch down), and its poster draws the same world through the same angle,
// flattened, so the hand-off from poster to scene is a cross-fade between two
// pictures of one model.

export interface SceneAngle {
  /** Radians: turned about y (positive looks from the right). */
  yaw: number;
  /** Radians: looking down. */
  pitch: number;
  /** Vertical field of view of the scene's camera, in degrees. */
  fov: number;
}

/** A world point in view space: x right, y up, z toward the viewer. */
export function projectView([x, y, z]: Vec3, { yaw, pitch }: Pick<SceneAngle, 'yaw' | 'pitch'>): [number, number, number] {
  const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
  const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
  return [x1, y * Math.cos(pitch) - z1 * Math.sin(pitch), y * Math.sin(pitch) + z1 * Math.cos(pitch)];
}

/** The world point that projects to view (x, y) at depth z (the inverse of projectView). */
export function unprojectView([x1, y2, z2]: Vec3, { yaw, pitch }: Pick<SceneAngle, 'yaw' | 'pitch'>): [number, number, number] {
  const y = y2 * Math.cos(pitch) + z2 * Math.sin(pitch);
  const z1 = -y2 * Math.sin(pitch) + z2 * Math.cos(pitch);
  return [x1 * Math.cos(yaw) + z1 * Math.sin(yaw), y, -x1 * Math.sin(yaw) + z1 * Math.cos(yaw)];
}

/** What a frame must hold, in view space. */
export interface ViewBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** How far the nearest point comes toward the viewer from the frame's centre plane. */
  near: number;
}

export function viewBoxOf(points: readonly Vec3[], angle: Pick<SceneAngle, 'yaw' | 'pitch'>): ViewBox {
  const p = points.map((v) => projectView(v, angle));
  const xs = p.map((v) => v[0]);
  const ys = p.map((v) => v[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), near: Math.max(0, ...p.map((v) => v[2])) };
}

/**
 * The frame both pictures use: centred on the box, padded by FRAME_PAD, and
 * (for the flat poster) grown by how much the scene's perspective camera
 * has to stand back so the nearest point fits, so the scene and its poster
 * show their subject at the same size.
 */
export function frameOf(box: ViewBox, angle: SceneAngle): { cx: number; cy: number; halfW: number; halfH: number; grow: number } {
  const halfW = ((box.maxX - box.minX) / 2) * FRAME_PAD;
  const halfH = ((box.maxY - box.minY) / 2) * FRAME_PAD;
  const tan = Math.tan(((angle.fov * Math.PI) / 180) / 2);
  // The camera's distance for a box of the frame's own shape (where width and height fit at once).
  const fit = halfH / tan;
  return { cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2, halfW, halfH, grow: (fit + box.near) / fit };
}

/**
 * The width ÷ height a scene's frame has (for sizing its box: a box of this
 * shape is filled edge to edge; any other shape leaves air either side).
 */
export function frameAspect(box: ViewBox, angle: SceneAngle): number {
  const f = frameOf(box, angle);
  return f.halfW / f.halfH;
}

/** Points around a disc (a plinth's rim) at height y, for the frame. */
function ring(cx: number, y: number, cz: number, r: number, n = 24): Vec3[] {
  return Array.from({ length: n }, (_, i): Vec3 => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  });
}

/** Air the scene's camera and the poster both leave around the frame (a share of its half-size). */
export const FRAME_PAD = 1.1;

// ===========================================================================
// 1. The hero: the bill as a sheet of glass on a plinth, and the net as a
//    column of light beside it, its height linear in the dollars, measured
//    from a zero shelf fixed to the scale staff: teal standing on the shelf
//    and rising for a gain; for a cost the shelf is raised to the top of the
//    scale's reach and the amber hangs beneath it, clear of the plinth, so a
//    cost reads as below zero by its form, not only by its colour.
// ===========================================================================

export const HERO_WORLD = {
  /** Just wide enough for the sheet, the column and the staff, so the data, not the plinth, is the large thing. */
  plinth: { radius: 0.98, height: 0.18 },
  /** The kit's BillSheet (0.773 × 1 at scale 1, facing +z), standing on the plinth. */
  sheet: { position: [-0.38, 0.68, -0.08] as Vec3, rotationY: 0.4, scale: 1.08 },
  /**
   * The column, one slab, on a porcelain foot (`pedestal` tall). `region`:
   * the scale's full reach. `clearance`: the least air under a hanging cost
   * (at the scale's full reach), so it never touches the foot.
   */
  column: { x: 0.5, z: 0.14, width: 0.3, pedestal: 0.06, gap: 0.014, region: 1.24, clearance: 0.12 },
  /** The zero shelf: a glass plate across the column (wider by `overhang` each side), held by the staff. */
  shelf: { overhang: 0.05, thickness: 0.018 },
  /** The scale staff beside the column. */
  staff: { dx: 0.27, radius: 0.007, tick: 0.06 },
} as const;

/** World y of a cost's zero shelf: the top of the scale's reach above its clearance (so even a cost at the full reach hangs clear). */
export const HERO_COST_SHELF = HERO_WORLD.column.pedestal + HERO_WORLD.column.clearance + HERO_WORLD.column.gap / 2 + HERO_WORLD.column.region;

export const HERO_VIEW: SceneAngle = { yaw: 0.3, pitch: 0.16, fov: 26 };

export interface HeroLayout {
  net: number;
  tone: TransmissionTone;
  scale: TransmissionScale | null;
  /** World units per dollar (0 when there is no scale). */
  unitsPerDollar: number;
  /**
   * The zero line (world y): the zero shelf. A gain's sits on the column's
   * foot; a cost's is raised to HERO_COST_SHELF, whatever the amount, and the
   * amber hangs below it.
   */
  baseline: number;
  /** The light's far end: the top of a gain, the bottom of a cost (= baseline for $0). */
  end: number;
  /** World y of each staff mark, one per scale step out from the baseline. */
  ticks: number[];
  /** The column's top (for the frame). */
  top: number;
}

/**
 * The hero column for a net yearly amount: a gain stands on a zero shelf at
 * the column's foot and rises; a cost hangs below a zero shelf raised to
 * HERO_COST_SHELF, so the smaller the cost the more air under it (and never
 * less than the clearance).
 */
export function heroLayout(netAnnualImpact: number): HeroLayout {
  const C = HERO_WORLD.column;
  const net = whole(netAnnualImpact);
  const tone = toneOf(net);
  const scale = scaleFor(net);
  const unitsPerDollar = scale ? C.region / scale.max : 0;
  const h = Math.abs(net) * unitsPerDollar;
  const baseline = tone === 'loss' ? HERO_COST_SHELF : C.pedestal;
  const end = tone === 'gain' ? baseline + C.gap / 2 + h : tone === 'loss' ? baseline - C.gap / 2 - h : baseline;
  const ticks: number[] = [];
  if (scale) {
    const dir = tone === 'loss' ? -1 : 1;
    for (let k = 1; k * scale.step <= scale.max + 1e-6 && ticks.length < 8; k++) {
      const y = baseline + dir * k * scale.step * unitsPerDollar;
      if (y >= C.pedestal - 1e-6) ticks.push(y);
    }
  }
  return { net, tone, scale, unitsPerDollar, baseline, end, ticks, top: Math.max(baseline, end) };
}

/** A point on (or `out` in front of) the hero sheet's face: `du` across it and `dv` up it, in sheet heights. */
function onHeroSheet(du: number, dv: number, out: number): [number, number, number] {
  const S = HERO_WORLD.sheet;
  const [x, y, z] = S.position;
  const c = Math.cos(S.rotationY);
  const s = Math.sin(S.rotationY);
  return [x + du * S.scale * c + out * s, y + dv * S.scale, z - du * S.scale * s + out * c];
}

/**
 * The light's paths from the sheet into the column (the scene's particle
 * curves and the poster's strokes): for a gain they run low across the
 * plinth to the column's foot and rise up through the teal; for a cost they
 * climb from the sheet's top edge to its raised shelf and sink down through
 * the amber. None for $0 (no light travels).
 */
export function heroStreams(layout: HeroLayout): Vec3[][] {
  if (layout.tone === 'neutral') return [];
  const S = HERO_WORLD.sheet;
  const C = HERO_WORLD.column;
  const n = 6;
  const sheetTop = S.position[1] + S.scale / 2;
  const midX = (S.position[0] + C.x) / 2;
  const level = (p: [number, number, number], y: number): Vec3 => [p[0], y, p[2]];
  return Array.from({ length: n }, (_, i): Vec3[] => {
    const j = i / (n - 1) - 0.5;
    if (layout.tone === 'gain') {
      const rise = layout.end - layout.baseline;
      return [
        onHeroSheet(j * 0.5, -0.3, 0.05),
        level(onHeroSheet(j * 0.4, -0.4, 0.3), 0.13),
        [midX, 0.06, C.z + 0.26 + j * 0.1],
        [C.x + j * 0.12, 0.1, C.z + 0.05],
        [C.x + j * 0.1, layout.baseline + rise * 0.45, C.z + j * 0.05],
        [C.x + j * 0.07, layout.end - 0.015, C.z],
      ];
    }
    // Over the shelf and down through it (the frame holds HERO_COST_SHELF + 0.1).
    const crest = Math.max(layout.top, sheetTop) + 0.07;
    return [
      onHeroSheet(j * 0.5, 0.22, 0.05),
      level(onHeroSheet(j * 0.3, 0.38, 0.3), sheetTop + 0.04),
      [midX, crest, C.z + 0.08 + j * 0.06],
      [C.x + j * 0.1, layout.top + 0.05, C.z],
      [C.x + j * 0.1, (layout.baseline + layout.end) / 2, C.z + j * 0.05],
      [C.x + j * 0.07, layout.end + 0.015, C.z],
    ];
  });
}

/** The view-space box the hero's frame holds: the plinth, the sheet and the full column region. */
export function heroViewBox(): ViewBox {
  const { plinth, sheet, column: C } = HERO_WORLD;
  const s = sheet.scale;
  const hw = (0.773 / 2) * s;
  const [sx, sy, sz] = sheet.position;
  const c = Math.cos(sheet.rotationY);
  const n = Math.sin(sheet.rotationY);
  const pts: Vec3[] = [...ring(0, 0, 0, plinth.radius), ...ring(0, -plinth.height, 0, plinth.radius)];
  for (const dx of [-hw, hw]) for (const dy of [-s / 2, s / 2]) pts.push([sx + dx * c, sy + dy, sz - dx * n]);
  // The column's whole reach, up to a cost's raised shelf and the light over it (so a gain and a cost of any size sit in the same frame).
  const top = HERO_COST_SHELF + 0.1;
  pts.push([C.x, top, C.z], [C.x + HERO_WORLD.staff.dx, top, C.z]);
  return viewBoxOf(pts, HERO_VIEW);
}

/** The status words the hero uses: is the bill law, so is the amount in effect or what it would mean? */
export function heroInEffect(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'enacted';
}

/** What the hero picture shows (its SceneView label). */
export function describeTransmission({ netAnnualImpact, status, title }: { netAnnualImpact: number; status?: string | null; title?: string | null }): string {
  const net = whole(netAnnualImpact);
  const bill = title?.trim() ? `“${title.trim()}” as a sheet of glass` : 'The bill as a sheet of glass';
  const law = heroInEffect(status) ? '' : ' It isn’t law, so this is what it would mean if enacted.';
  if (!net) return `${bill} on a plinth beside an empty column of light resting on its zero shelf: no change to your budget a year.${law}`;
  const column =
    net > 0
      ? 'its light rising beside it into a teal column standing on a zero shelf'
      : 'its light sinking beside it into an amber column hanging below a raised zero shelf';
  return `${bill} on a plinth, ${column}: ${signed(net, yearly)}.${law}`;
}

/** The hero's scale in words (for its caption). */
export function heroScaleNote(netAnnualImpact: number): string {
  const { scale, tone } = heroLayout(netAnnualImpact);
  if (!scale) return 'No change a year, so the column is empty: its light rests on the zero shelf.';
  const way = tone === 'gain' ? 'teal column rises from' : 'amber column hangs below';
  return `The ${way} its zero shelf as far as the yearly amount, on a linear scale: each mark on the staff is ${formatUSD(scale.step)} a year.`;
}

// ===========================================================================
// 2. Overview: the flow. One channel per category, as wide as that
//    category's yearly dollars: a gain's light leaves the bill, passes
//    through its channel and pours into "your budget"; a cost's light drains
//    out of the budget's foot, back through its channel to the bill. The
//    direction is the meaning, in a still frame too.
// ===========================================================================

export interface TransmissionFlow {
  /** A category key ('taxes' … 'education'), or REST_FLOW_ID. */
  id: string;
  label: string;
  /** Signed whole dollars a year: + saves the user money, − costs them. Never 0. */
  value: number;
  tone: TransmissionTone;
  /**
   * The part of the net the analysis didn't assign to one of the six
   * categories (ripple effects such as the cost of living, and rounding):
   * the net minus the categories, arithmetic on real fields, not an
   * estimate of its own.
   */
  rest?: boolean;
}

/** The fields flowsFromAnalysis reads (a FullAnalysis has them all). */
export interface FlowSource {
  netAnnualImpact?: number;
  categoryImpacts?: Partial<CategoryImpacts> | null;
}

export const REST_FLOW_ID = 'other-effects';

/** The categories, in the order the analysis (and its schema) lists them. */
export const FLOW_CATEGORIES: readonly { key: keyof CategoryImpacts; label: string }[] = [
  { key: 'taxes', label: 'Taxes' },
  { key: 'housing', label: 'Housing' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'employment', label: 'Employment' },
  { key: 'retirement', label: 'Retirement' },
  { key: 'education', label: 'Education' },
];

const TONE_ORDER: Record<TransmissionTone, number> = { gain: 0, loss: 1, neutral: 2 };

/**
 * The analysis's yearly money flows: its six category impacts
 * (categoryImpacts, signed $/yr), plus, when the stated net
 * (netAnnualImpact) differs from their sum by a dollar or more, one more
 * flow for the difference, "Other effects" (`rest`): the analysis builds its
 * net from the categories plus ripple effects (lib/claude.ts), so this is
 * the part it didn't split by category. The flows always add up to the net
 * the page shows.
 *
 * Zero amounts are left out. Order: gains (largest first), then costs
 * (largest first), "Other effects" last on its side. No amounts and a $0
 * net → [] (the page's empty state).
 */
export function flowsFromAnalysis(a: FlowSource): TransmissionFlow[] {
  const ci = a.categoryImpacts ?? {};
  const flows: TransmissionFlow[] = [];
  for (const { key, label } of FLOW_CATEGORIES) {
    const value = whole(finite(ci[key]));
    if (value) flows.push({ id: key, label, value, tone: toneOf(value) });
  }
  const itemized = flows.reduce((s, f) => s + f.value, 0);
  const rest = whole(finite(a.netAnnualImpact) - itemized);
  if (rest) flows.push({ id: REST_FLOW_ID, label: 'Other effects', value: rest, tone: toneOf(rest), rest: true });
  return flows.sort(
    (x, y) =>
      TONE_ORDER[x.tone] - TONE_ORDER[y.tone] ||
      Number(!!x.rest) - Number(!!y.rest) ||
      Math.abs(y.value) - Math.abs(x.value) ||
      x.label.localeCompare(y.label)
  );
}

export interface FlowTotals {
  /** Sum of the gaining flows, ≥ 0. */
  gains: number;
  /** Sum of the costing flows as a magnitude, ≥ 0. */
  costs: number;
  /** gains + costs: what the channels share between them. */
  gross: number;
  /** gains − costs: the net (equal to the analysis's netAnnualImpact). */
  net: number;
}

export function flowTotals(flows: readonly TransmissionFlow[]): FlowTotals {
  const gains = flows.reduce((s, f) => s + Math.max(0, f.value), 0);
  const costs = flows.reduce((s, f) => s + Math.max(0, -f.value), 0);
  return { gains, costs, gross: gains + costs, net: gains - costs };
}

export const SANKEY_WORLD = {
  /** The kit's BillSheet, on the left, turned toward the channels. */
  bill: { position: [-1.32, 0.04, 0] as Vec3, rotationY: 0.5, scale: 0.74 },
  /** The channels: glass slats stacked at x = 0, the whole stack this tall (gaps included). */
  gates: { x: 0, span: 1.6, gap: 0.07, thickness: 0.05, depth: 0.36, minHeight: 0.014 },
  /** "Your budget": a glass vessel on the right. */
  basin: { x: 1.3, z: 0, radius: 0.34, height: 0.44 },
  /** The paper plinths the bill and the basin stand on (their tops at `top`). */
  stand: { top: -0.5, radius: 0.46, height: 0.12 },
  /** Light streams shared out between the flows by their dollars (each flow at least one). */
  streams: 20,
} as const;

export const SANKEY_VIEW: SceneAngle = { yaw: 0.2, pitch: 0.12, fov: 26 };

export interface SankeyGate {
  id: string;
  tone: TransmissionTone;
  /** The slat's bottom and top (world y). */
  y0: number;
  y1: number;
  /** How many light streams pass through it (∝ its dollars, at least 1). */
  streams: number;
}

export interface SankeyLayout {
  totals: FlowTotals;
  /** World units of slat height per dollar (one linear scale for every channel). */
  unitsPerDollar: number;
  gates: SankeyGate[];
}

/** The channels for a set of flows: top to bottom in the flows' order (gains above costs). */
export function sankeyLayout(flows: readonly TransmissionFlow[]): SankeyLayout {
  const G = SANKEY_WORLD.gates;
  const totals = flowTotals(flows);
  const n = flows.length;
  if (!n || !totals.gross) return { totals, unitsPerDollar: 0, gates: [] };
  const unitsPerDollar = (G.span - G.gap * (n - 1)) / totals.gross;
  // Streams by largest remainder, every flow keeping at least one.
  const base = flows.map((f) => (Math.abs(f.value) / totals.gross) * SANKEY_WORLD.streams);
  const streams = base.map((b) => Math.max(1, Math.floor(b)));
  let left = SANKEY_WORLD.streams - streams.reduce((s, x) => s + x, 0);
  const byRemainder = base.map((b, i) => [b - Math.floor(b), i] as const).sort((x, y) => y[0] - x[0] || x[1] - y[1]);
  for (const [, i] of byRemainder) {
    if (left <= 0) break;
    streams[i] += 1;
    left -= 1;
  }
  let y = G.span / 2;
  const gates = flows.map((f, i): SankeyGate => {
    const h = Math.abs(f.value) * unitsPerDollar;
    const y1 = y;
    const y0 = y - h;
    y = y0 - G.gap;
    // A sliver for a very small amount, centred on its interval.
    const mid = (y0 + y1) / 2;
    const half = Math.max(h, G.minHeight) / 2;
    return { id: f.id, tone: f.tone, y0: mid - half, y1: mid + half, streams: streams[i] };
  });
  return { totals, unitsPerDollar, gates };
}

export interface SankeyStream {
  /** The gate (flow id) it passes through. */
  gate: string;
  tone: TransmissionTone;
  /** A cost's stream: it runs out of the budget, back to the bill (its points start in the basin). */
  out: boolean;
  /**
   * Points a smooth curve passes through, in the light's direction: a gain's
   * from the bill's face, level through its gate, into the basin's mouth; a
   * cost's from the pool, out of the basin's foot, level back through its
   * gate, onto the bill's face.
   */
  points: Vec3[];
}

/**
 * The light's paths (the scene's particle curves and the poster's strokes):
 * each gate's streams pass level through the gate, spread across its height
 * (so a channel's band of light is as wide as its dollars). A gain's streams
 * leave the bill's face and pour into the basin's mouth; a cost's leave the
 * pool through the basin's foot and run back to the bill.
 */
export function sankeyStreams(layout: SankeyLayout): SankeyStream[] {
  const { bill, gates: G, basin: B, stand } = SANKEY_WORLD;
  const [bx, by, bz] = bill.position;
  const c = Math.cos(bill.rotationY);
  const s = Math.sin(bill.rotationY);
  const face = (du: number, dv: number, out: number): Vec3 => [bx + du * bill.scale * c + out * s, by + dv * bill.scale, bz - du * bill.scale * s + out * c];
  const mouth = stand.top + B.height;
  const pool = stand.top + 0.1;
  const foot = stand.top + 0.05;
  const half = G.span / 2;
  const streams: SankeyStream[] = [];
  for (const g of layout.gates) {
    const out = g.tone === 'loss';
    for (let j = 0; j < g.streams; j++) {
      const t = (j + 0.5) / g.streams;
      const y = g.y0 + t * (g.y1 - g.y0);
      // A little depth to each band, alternating front and back.
      const z = ((j % 3) - 1) * 0.07 + (t - 0.5) * 0.04;
      const k = y / half;
      const billSide: Vec3[] = [face(0.1 + t * 0.12, k * 0.3, 0.04), face(0.3, k * 0.34, 0.3), [-0.55, y * 0.82 + by * 0.18, z * 0.7], [G.x - 0.13, y, z]];
      const points: Vec3[] = out
        ? [
            // Out of the pool, through the basin's foot on the channels' side, and back to the bill.
            [B.x, pool, B.z],
            [B.x - B.radius * 0.55, foot, z * 0.2],
            [B.x - B.radius - 0.1, foot - 0.01, z * 0.35],
            [0.58, y * 0.55 + foot * 0.45, z * 0.5],
            [G.x + 0.13, y, z],
            ...billSide.reverse(),
          ]
        : [...billSide, [G.x + 0.13, y, z], [0.58, y * 0.55 + mouth * 0.45, z * 0.5], [B.x - 0.1, mouth + 0.18, z * 0.25], [B.x, mouth - 0.06, B.z], [B.x, pool, B.z]];
      streams.push({ gate: g.id, tone: g.tone, out, points });
    }
  }
  return streams;
}

export function sankeyViewBox(): ViewBox {
  const { bill, gates: G, basin: B, stand } = SANKEY_WORLD;
  const hw = (0.773 / 2) * bill.scale;
  const [bx, by, bz] = bill.position;
  const c = Math.cos(bill.rotationY);
  const s = Math.sin(bill.rotationY);
  const pts: Vec3[] = [];
  for (const dx of [-hw, hw]) for (const dy of [-bill.scale / 2, bill.scale / 2]) pts.push([bx + dx * c, by + dy, bz - dx * s]);
  for (const x of [-G.thickness, G.thickness]) for (const y of [-G.span / 2, G.span / 2]) for (const z of [-G.depth / 2, G.depth / 2]) pts.push([G.x + x, y, z]);
  for (const x of [bx, B.x]) pts.push(...ring(x, stand.top - stand.height, B.z, stand.radius), ...ring(x, stand.top, B.z, stand.radius));
  pts.push(...ring(B.x, stand.top + B.height, B.z, B.radius));
  return viewBoxOf(pts, SANKEY_VIEW);
}

/** The flow picture in words (its SceneView label). */
export function describeFlows(flows: readonly TransmissionFlow[]): string {
  if (!flows.length) return 'The bill beside an empty channel and your budget: this analysis has no yearly amounts by category.';
  const totals = flowTotals(flows);
  const items = flows.map((f, i) => `${i + 1}, ${f.label} ${formatUSD(f.value, { signed: true })}`);
  const gains = flows.filter((f) => f.value > 0).length;
  const costs = flows.length - gains;
  const how =
    gains && costs
      ? `Teal light flows from the bill into your budget through ${plural(gains, 'channel', 'channels')}, and amber light drains out of it, back to the bill, through ${plural(costs, 'channel', 'channels')}`
      : gains
        ? `Teal light flows from the bill into your budget through ${plural(gains, 'channel', 'channels')}`
        : `Amber light drains out of your budget, back to the bill, through ${plural(costs, 'channel', 'channels')}`;
  return `${how}, each as wide as its yearly amount and numbered: ${list(items)}. Together, ${signed(totals.net, yearly)}.`;
}

/** The flow picture's scale in words (for its caption). */
export function flowScaleNote(flows: readonly TransmissionFlow[]): string {
  if (!flows.length) return 'No category has a yearly amount in this analysis, so no light flows.';
  const rest = flows.some((f) => f.rest)
    ? ' “Other effects” is the part of the net the analysis didn’t assign to a category, such as ripple effects on the cost of living.'
    : '';
  return `Each channel is as wide as its yearly amount, on one linear scale, and numbered as in this list. Teal light pours into your budget (it saves you money); amber light drains out of it (it costs you).${rest}`;
}

/**
 * Where each channel's number sits (world points, in the gates' order):
 * just right of its slat, at its middle, but never closer to the next than
 * `minGap` (world y), so thin neighbouring channels keep readable labels;
 * `slat` is the point on the slat the label's leader line runs to.
 */
export function sankeyGateMarks(layout: SankeyLayout, minGap = 0.14): { id: string; tone: TransmissionTone; label: Vec3; slat: Vec3 }[] {
  const G = SANKEY_WORLD.gates;
  const x = G.x + G.thickness / 2;
  const z = G.depth / 2;
  const want = layout.gates.map((g) => (g.y0 + g.y1) / 2);
  // Top to bottom, pushed down where they would crowd, then back up as a block if they overrun the stack's foot.
  const at = [...want];
  for (let i = 1; i < at.length; i++) at[i] = Math.min(at[i], at[i - 1] - minGap);
  const overrun = -G.span / 2 - (at[at.length - 1] ?? 0);
  if (overrun > 0) for (let i = at.length - 1; i >= 0; i--) at[i] = i === at.length - 1 ? at[i] + overrun : Math.max(at[i], at[i + 1] + minGap);
  return layout.gates.map((g, i) => ({ id: g.id, tone: g.tone, label: [x + 0.15, at[i], z], slat: [x, want[i], z] }));
}

// ===========================================================================
// 3. Timeline: the first year as a glass ribbon, rising and falling with the
//    running total month by month. Its WIDTH is the uncertainty
//    (1 − confidence): wider = less certain. The ribbon stands upright,
//    facing the camera, so its width is seen at full size: a band around the
//    line of light, the same width all year (one confidence score), never a
//    range of dollars.
// ===========================================================================

export interface RibbonPoint {
  /** 1 … 12. */
  month: number;
  /** Signed whole dollars: the running total to the end of this month (timeline.monthly is cumulative). */
  value: number;
  /** This month's own change (value minus the month before; month 1's is its value). */
  delta: number;
  /** 0 (certain) … 1: 1 − confidenceScore/100, or 1 when the confidence wasn't rated. */
  uncertainty: number;
}

export interface RibbonSource {
  timeline?: { monthly?: readonly MonthPoint[] | null } | null;
  confidenceScore?: number | null;
}

/** 1 − confidence as a share, and whether the confidence was rated at all (0 means "not rated"). */
export function ribbonUncertainty(confidenceScore: number | null | undefined): { uncertainty: number; rated: boolean } {
  const score = Math.max(0, Math.min(100, Math.round(finite(confidenceScore))));
  if (!score) return { uncertainty: 1, rated: false };
  return { uncertainty: share(1 - score / 100), rated: true };
}

/**
 * The 12 months of timeline.monthly (cumulative signed dollars), in month
 * order, months outside 1 … 12 dropped and a repeated month kept once (its
 * last value). Every point carries the same uncertainty: the analysis has
 * one confidence score, and it is never spread out over the months. No
 * months → [].
 */
export function ribbonFromAnalysis(a: RibbonSource): RibbonPoint[] {
  const raw = a.timeline?.monthly ?? [];
  const byMonth = new Map<number, number>();
  for (const p of raw) {
    const month = Math.round(finite(p?.month));
    if (month >= 1 && month <= 12) byMonth.set(month, whole(finite(p?.impact)));
  }
  const { uncertainty } = ribbonUncertainty(a.confidenceScore);
  const months = [...byMonth.keys()].sort((x, y) => x - y);
  return months.map((month, i) => {
    const value = byMonth.get(month) ?? 0;
    const before = i ? (byMonth.get(months[i - 1]) ?? 0) : 0;
    return { month, value, delta: value - before, uncertainty };
  });
}

export const RIBBON_WORLD = {
  /** Month 1 at x0, month 12 at x1. */
  x0: -1.65,
  x1: 1.65,
  /** The height the scale's span takes (world units). */
  span: 1.3,
  /**
   * The ribbon's width (world y, centred on the running total, facing the
   * camera) at no uncertainty, and what full uncertainty adds: at the
   * widest it is about 40% of the scale's span, so 36% uncertainty is
   * plainly wider than a sure estimate's hairline.
   */
  width: { min: 0.035, range: 0.5 },
  /** The zero plate under the ribbon. */
  plate: { x0: -1.86, x1: 1.86, depth: 0.82, thickness: 0.012 },
  /** The scale staff at the left end. */
  staff: { x: -1.98, z: 0, tick: 0.06, radius: 0.006 },
  /** The glass's depth (z); the line of light and the beads sit just in front of it. */
  thickness: 0.024,
} as const;

/** World z of the line of light, the beads and the drop lines: just in front of the ribbon's glass. */
export const RIBBON_FRONT = RIBBON_WORLD.thickness / 2 + 0.012;

/** A ribbon's width for an uncertainty (0 … 1) as a share of the widest (1 = unrated): for the page's legend. */
export function ribbonBandShare(uncertainty: number): number {
  const W = RIBBON_WORLD.width;
  return (W.min + W.range * Math.min(1, Math.max(0, finite(uncertainty)))) / (W.min + W.range);
}

export const RIBBON_VIEW: SceneAngle = { yaw: 0.2, pitch: 0.42, fov: 26 };

export const RIBBON_LEGEND = {
  title: 'Ribbon width shows uncertainty',
  wider: 'wider = less certain',
} as const;

export interface RibbonLayout {
  scale: TransmissionScale | null;
  unitsPerDollar: number;
  /** World x of a month. */
  x: (month: number) => number;
  /** World y of a dollar amount (0 at the zero plate). */
  y: (value: number) => number;
  /** The ribbon's width (world y, centred on the running total) for its uncertainty. */
  width: number;
  /** World y of each staff mark (zero included). */
  ticks: number[];
  /** World y extent of the data (with zero). */
  minY: number;
  maxY: number;
}

export function ribbonLayout(points: readonly RibbonPoint[]): RibbonLayout {
  const R = RIBBON_WORLD;
  const values = points.map((p) => p.value);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const scale = scaleFor(hi - lo);
  const unitsPerDollar = scale ? R.span / scale.max : 0;
  const uncertainty = points.length ? Math.max(...points.map((p) => p.uncertainty)) : 1;
  const ticks: number[] = [0];
  if (scale) {
    // A mark per step out from zero, far enough to cover the data on each side.
    const up = Math.ceil(hi / scale.step - 1e-9);
    const down = Math.ceil(-lo / scale.step - 1e-9);
    for (let k = 1; k <= up; k++) ticks.push(k * scale.step * unitsPerDollar);
    for (let k = 1; k <= down; k++) ticks.push(-k * scale.step * unitsPerDollar);
    ticks.sort((a, b) => a - b);
  }
  return {
    scale,
    unitsPerDollar,
    x: (month: number) => R.x0 + ((Math.min(12, Math.max(1, month)) - 1) / 11) * (R.x1 - R.x0),
    y: (value: number) => value * unitsPerDollar,
    width: R.width.min + R.width.range * Math.min(1, Math.max(0, uncertainty)),
    ticks,
    minY: lo * unitsPerDollar,
    maxY: hi * unitsPerDollar,
  };
}

/**
 * The ribbon's spine as world (x, y) samples: a monotone cubic through the
 * monthly points (Fritsch–Carlson), so between two months it never rises
 * above or dips below them, and no month that wasn't in the data appears to
 * peak. `perMonth` samples between neighbouring months.
 */
export function ribbonPath(points: readonly RibbonPoint[], layout: RibbonLayout, perMonth = 8): [number, number][] {
  const xs = points.map((p) => layout.x(p.month));
  const ys = points.map((p) => layout.y(p.value));
  const n = xs.length;
  if (n === 0) return [];
  if (n === 1) return [[xs[0], ys[0]]];
  const d = xs.slice(0, -1).map((x, k) => (ys[k + 1] - ys[k]) / (xs[k + 1] - x || 1));
  const m = xs.map((_, k) => {
    if (k === 0) return d[0];
    if (k === n - 1) return d[n - 2];
    return d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
  });
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const r = a * a + b * b;
    if (r > 9) {
      const t = 3 / Math.sqrt(r);
      m[k] = t * a * d[k];
      m[k + 1] = t * b * d[k];
    }
  }
  const out: [number, number][] = [];
  for (let k = 0; k < n - 1; k++) {
    const h = xs[k + 1] - xs[k];
    for (let i = 0; i < perMonth; i++) {
      const t = i / perMonth;
      const t2 = t * t;
      const t3 = t2 * t;
      const y = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
      out.push([xs[k] + t * h, y]);
    }
  }
  out.push([xs[n - 1], ys[n - 1]]);
  return out;
}

export function ribbonViewBox(layout: RibbonLayout): ViewBox {
  const R = RIBBON_WORLD;
  const z = R.plate.depth / 2;
  // The band reaches half its width above and below the line.
  let top = Math.max(layout.maxY + layout.width / 2, ...layout.ticks) + 0.06;
  let bottom = Math.min(layout.minY - layout.width / 2, ...layout.ticks) - 0.06;
  // Never a sliver of a frame (a flat year): at least a third of the span, around the zero line.
  const short = R.span / 3 - (top - bottom);
  if (short > 0) {
    top += short / 2;
    bottom -= short / 2;
  }
  const pts: Vec3[] = [];
  for (const x of [R.staff.x - 0.06, R.plate.x1]) for (const y of [bottom, top]) for (const zz of [-z, z]) pts.push([x, y, zz]);
  return viewBoxOf(pts, RIBBON_VIEW);
}

/** The ribbon in words (its SceneView label). `focus` is a month the page has picked out. */
export function describeRibbon(points: readonly RibbonPoint[], confidenceScore?: number | null, focus?: number | null): string {
  if (!points.length) return 'An empty glass ribbon: this analysis has no month-by-month amounts.';
  const last = points[points.length - 1];
  const { uncertainty, rated } = ribbonUncertainty(confidenceScore);
  const width = rated
    ? `Its width shows the uncertainty, not a range of dollars: ${Math.round(uncertainty * 100)}% (confidence ${Math.round(finite(confidenceScore))} of 100); wider = less certain.`
    : 'Its confidence wasn’t rated, so it is drawn at its widest; wider = less certain.';
  const at = focus ? points.find((p) => p.month === focus) : undefined;
  const picked = at ? ` Month ${at.month} is lit: ${formatUSD(at.value, { signed: true })} so far.` : '';
  return `A glass ribbon over ${plural(points.length, 'month', 'months')}, the running total reaching ${formatUSD(last.value, { signed: true })} by month ${last.month} (${impactWords(last.value)}). ${width}${picked}`;
}

/** The ribbon's scale in words (for its caption). */
export function ribbonScaleNote(points: readonly RibbonPoint[]): string {
  const { scale } = ribbonLayout(points);
  if (!scale) return 'The running total stays at $0 all year, so the ribbon lies on the zero line.';
  return `The ribbon rises above the zero line for money saved and falls below it for money it costs you, on a linear scale: each mark on the staff is ${formatUSD(scale.step)}.`;
}

// ===========================================================================
// 4. Vulnerability: the six 0..100 exposure scores as a radar, extruded into
//    a faceted violet crystal (higher = more pressure).
// ===========================================================================

export type VulnerabilityAxis = keyof VulnerabilityScores;

export interface CrystalAxis {
  axis: VulnerabilityAxis;
  /** 0 … 1 (the score / 100): the crystal's radius along this axis. */
  value: number;
  /** The score as the analysis gives it, 0 … 100. */
  score: number;
  label: string;
}

/** The radar's order (lib/simpleMode RADAR_LABELS): the first axis points away from the viewer, the rest go clockwise. */
export const CRYSTAL_AXES: readonly VulnerabilityAxis[] = [
  'incomeStability',
  'housingSecurity',
  'employmentRisk',
  'costOfLivingPressure',
  'investmentExposure',
  'debtBurden',
];

/**
 * The six vulnerability scores as 0..1 radii, labelled as the radar labels
 * them (`simple` uses the plain-language wording). An analysis that scored
 * nothing (all six 0, which is what a missing vulnerability block becomes)
 * gives [] so the page shows its empty state, not a crystal of zeros.
 */
export function crystalFromAnalysis(a: { vulnerability?: Partial<VulnerabilityScores> | null }, options: { simple?: boolean } = {}): CrystalAxis[] {
  const v = a.vulnerability ?? {};
  const labels = options.simple ? RADAR_LABELS.simple : RADAR_LABELS.expert;
  const axes = CRYSTAL_AXES.map((axis): CrystalAxis => {
    const score = Math.max(0, Math.min(100, Math.round(finite(v[axis]))));
    return { axis, value: score / 100, score, label: labels[axis] };
  });
  return axes.some((x) => x.score > 0) ? axes : [];
}

export const CRYSTAL_WORLD = {
  /** Radius at a score of 100. */
  radius: 1,
  /** The flat top (table) of the crown: its height and its size as a share of the girdle. */
  crown: { height: 0.3, table: 0.42 },
  /** The point below. */
  pavilion: 0.78,
  /** No girdle point is drawn closer to the centre than this share (a zero score stays a visible point). */
  minRadius: 0.035,
  /** The guide rings on the girdle plane (scores of 25, 50, 75 and 100). */
  rings: [0.25, 0.5, 0.75, 1] as readonly number[],
  /** Smaller than the crystal's outer ring, so the gem, not its stand, is the large thing. */
  plinth: { y: -1, radius: 0.56, height: 0.14 },
} as const;

export const CRYSTAL_VIEW: SceneAngle = { yaw: 0, pitch: 0.56, fov: 28 };

/** Where axis `i` of `n` points on the girdle plane (unit length): the first away from the viewer (−z), then clockwise seen from above. */
export function crystalDirection(i: number, n = CRYSTAL_AXES.length): [number, number] {
  const a = (i / n) * Math.PI * 2;
  return [Math.sin(a), -Math.cos(a)];
}

export interface CrystalLayout {
  /** The girdle points (world x, z) per axis, at radius value × R (never inside minRadius). */
  girdle: [number, number][];
  /** The table's corners (world x, z), at the crown's height. */
  table: [number, number][];
  crownY: number;
  pavilionY: number;
}

export function crystalLayout(axes: readonly CrystalAxis[]): CrystalLayout {
  const W = CRYSTAL_WORLD;
  const girdle = axes.map((x, i): [number, number] => {
    const [dx, dz] = crystalDirection(i, axes.length);
    const r = Math.max(W.minRadius, x.value) * W.radius;
    return [dx * r, dz * r];
  });
  return {
    girdle,
    table: girdle.map(([x, z]): [number, number] => [x * W.crown.table, z * W.crown.table]),
    crownY: W.crown.height,
    pavilionY: -W.pavilion,
  };
}

export interface CrystalFacet {
  /** Three world points, wound so that their normal faces out of the gem. */
  points: [Vec3, Vec3, Vec3];
  /** The facet's outward unit normal. */
  normal: Vec3;
}

/** The gem cut from a crystal layout: the table, the crown's facets down to the girdle, and the pavilion's down to its point. */
export function crystalFacets(l: CrystalLayout): CrystalFacet[] {
  const n = l.girdle.length;
  if (!n) return [];
  const g = (i: number): Vec3 => [l.girdle[i % n][0], 0, l.girdle[i % n][1]];
  const t = (i: number): Vec3 => [l.table[i % n][0], l.crownY, l.table[i % n][1]];
  const top: Vec3 = [0, l.crownY, 0];
  const point: Vec3 = [0, l.pavilionY, 0];
  const tris: [Vec3, Vec3, Vec3][] = [];
  for (let i = 0; i < n; i++) {
    tris.push([top, t(i), t(i + 1)], [g(i), g(i + 1), t(i + 1)], [g(i), t(i + 1), t(i)], [g(i), g(i + 1), point]);
  }
  // The gem is star-shaped about a point on its axis, so "out" is away from it.
  const centre: Vec3 = [0, (l.crownY + l.pavilionY) * 0.25, 0];
  return tris.map(([a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = u[1] * v[2] - u[2] * v[1];
    let ny = u[2] * v[0] - u[0] * v[2];
    let nz = u[0] * v[1] - u[1] * v[0];
    const m = [(a[0] + b[0] + c[0]) / 3 - centre[0], (a[1] + b[1] + c[1]) / 3 - centre[1], (a[2] + b[2] + c[2]) / 3 - centre[2]];
    const out = nx * m[0] + ny * m[1] + nz * m[2] >= 0;
    if (!out) [nx, ny, nz] = [-nx, -ny, -nz];
    const len = Math.hypot(nx, ny, nz) || 1;
    return { points: out ? [a, b, c] : [a, c, b], normal: [nx / len, ny / len, nz / len] };
  });
}

export function crystalViewBox(): ViewBox {
  const W = CRYSTAL_WORLD;
  const pts: Vec3[] = [
    ...ring(0, 0, 0, W.radius + 0.08, 36),
    [0, W.crown.height + 0.06, 0],
    ...ring(0, W.plinth.y, 0, W.plinth.radius),
    ...ring(0, W.plinth.y - W.plinth.height, 0, W.plinth.radius),
  ];
  return viewBoxOf(pts, CRYSTAL_VIEW);
}

/** The crystal in words (its SceneView label). */
export function describeCrystal(axes: readonly CrystalAxis[]): string {
  if (!axes.length) return 'Empty guide rings: this analysis has no vulnerability scores.';
  const top = Math.max(...axes.map((x) => x.score));
  const highest = axes.filter((x) => x.score === top).map((x) => x.label);
  const items = axes.map((x) => `${x.label} ${x.score} of 100`);
  return `A violet crystal shaped by six vulnerability scores, reaching further out where the pressure is higher: ${list(items)}. Highest: ${list(highest)}.`;
}

/** The crystal's scale in words (for its caption). */
export function crystalScaleNote(): string {
  return 'Each point of the crystal reaches out along its axis as far as the score, on a linear scale from 0 at the centre to 100 at the outer ring; the guide rings mark 25, 50 and 75.';
}

// ===========================================================================
// 5. Spending: the monthly spending pressure per category as a terrain of
//    tiles, each as tall as its dollars, teal where it saves the user money,
//    amber where it costs more, neutral porcelain near $0.
// ===========================================================================

export interface TerrainCell {
  /** A stable key from the category's name. */
  id: string;
  label: string;
  /** Signed whole dollars a MONTH (spendingVelocity.dollarImpact): + saves, − costs more. */
  value: number;
  tone: TransmissionTone;
  /** Grid place, row-major in the analysis's order (row 0 is furthest from the viewer). */
  row: number;
  col: number;
}

/** How many columns a terrain of n tiles has (a compact, nearly square grid). */
export function terrainColumns(n: number): number {
  if (n <= 3) return Math.max(1, n);
  if (n === 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

const cellKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'category';

/**
 * spendingVelocity as grid cells, in the analysis's order (the same order
 * the page's heatmap lists them). A category named twice is one cell, its
 * amounts added up, in its first place. The sign of the amount sets the
 * tone (the amount is the authority; its `direction` only restates it).
 * No categories → [].
 */
export function terrainFromAnalysis(a: { spendingVelocity?: readonly Partial<SpendingVelocityItem>[] | null }): TerrainCell[] {
  const merged = new Map<string, { label: string; raw: number }>();
  for (const item of a.spendingVelocity ?? []) {
    const label = typeof item?.category === 'string' ? item.category.trim() : '';
    if (!label) continue;
    const id = cellKey(label);
    const cell = merged.get(id) ?? { label, raw: 0 };
    cell.raw += finite(item.dollarImpact);
    merged.set(id, cell);
  }
  const cols = terrainColumns(merged.size);
  return [...merged].map(([id, c], i) => {
    const value = whole(c.raw);
    return { id, label: c.label, value, tone: toneOf(value), row: Math.floor(i / cols), col: i % cols };
  });
}

export const TERRAIN_WORLD = {
  tile: 0.44,
  gap: 0.07,
  /** Every tile's porcelain foot (a $0 tile is just this). */
  foot: 0.035,
  /** The tallest a tile can be above its foot (the scale's max). */
  rise: 0.85,
  /** The slab the tiles stand on. */
  slab: { margin: 0.13, thickness: 0.09 },
} as const;

export const TERRAIN_VIEW: SceneAngle = { yaw: 0.55, pitch: 0.5, fov: 28 };

export interface TerrainTile {
  id: string;
  tone: TransmissionTone;
  /** Centre on the slab (world x, z). */
  x: number;
  z: number;
  /** Height above the slab's top: the foot plus |value| on the scale. */
  height: number;
  /** 0 … 1, |value| as a share of the largest (the colour's strength). */
  strength: number;
}

export interface TerrainLayout {
  scale: TransmissionScale | null;
  unitsPerDollar: number;
  cols: number;
  rows: number;
  /** The slab's half-size (world x, z). */
  halfX: number;
  halfZ: number;
  tiles: TerrainTile[];
}

export function terrainLayout(cells: readonly TerrainCell[]): TerrainLayout {
  const T = TERRAIN_WORLD;
  const cols = Math.max(1, ...cells.map((c) => c.col + 1));
  const rows = Math.max(1, ...cells.map((c) => c.row + 1));
  const largest = Math.max(0, ...cells.map((c) => Math.abs(c.value)));
  const scale = scaleFor(largest);
  const unitsPerDollar = scale ? T.rise / scale.max : 0;
  const pitch = T.tile + T.gap;
  const ox = ((cols - 1) * pitch) / 2;
  const oz = ((rows - 1) * pitch) / 2;
  return {
    scale,
    unitsPerDollar,
    cols,
    rows,
    halfX: ox + T.tile / 2 + T.slab.margin,
    halfZ: oz + T.tile / 2 + T.slab.margin,
    tiles: cells.map((c) => ({
      id: c.id,
      tone: c.tone,
      x: c.col * pitch - ox,
      z: c.row * pitch - oz,
      height: T.foot + Math.abs(c.value) * unitsPerDollar,
      strength: largest ? Math.abs(c.value) / largest : 0,
    })),
  };
}

export function terrainViewBox(layout: TerrainLayout): ViewBox {
  const T = TERRAIN_WORLD;
  const { halfX: x, halfZ: z } = layout;
  const pts: Vec3[] = [];
  for (const px of [-x, x]) for (const pz of [-z, z]) pts.push([px, -T.slab.thickness, pz], [px, T.foot + T.rise, pz]);
  return viewBoxOf(pts, TERRAIN_VIEW);
}

/** The terrain in words (its SceneView label). */
export function describeTerrain(cells: readonly TerrainCell[]): string {
  if (!cells.length) return 'An empty slab: this analysis has no spending categories.';
  const items = cells.map((c) => `${c.label} ${formatUSD(c.value, { signed: true })}`);
  const more = cells.filter((c) => c.tone === 'loss').length;
  const less = cells.filter((c) => c.tone === 'gain').length;
  const sides = [less && `${plural(less, 'teal tile', 'teal tiles')} where it saves you money`, more && `${plural(more, 'amber tile', 'amber tiles')} where it costs more`].filter(Boolean) as string[];
  const tone = sides.length ? `: ${list(sides)}` : '';
  return `A terrain of ${plural(cells.length, 'tile', 'tiles')}, one per spending category, each as tall as its monthly amount${tone}. ${list(items)} a month.`;
}

/** The terrain's scale in words (for its caption). */
export function terrainScaleNote(cells: readonly TerrainCell[]): string {
  const { scale } = terrainLayout(cells);
  if (!cells.length) return 'No spending categories in this analysis.';
  if (!scale) return 'Every category is $0 a month, so every tile lies flat.';
  return `Each tile rises as far as its monthly amount on one linear scale (the tallest possible is ${formatUSD(scale.max)} a month); teal saves you money, amber costs more, and flat porcelain is no change.`;
}

/** A cell's figure as the page prints it: "+$12 a month (saves you)". */
export function terrainCellText(cell: Pick<TerrainCell, 'value'>): string {
  return signed(cell.value, monthly);
}
