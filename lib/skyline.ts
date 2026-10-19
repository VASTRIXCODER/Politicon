/**
 * "The Skyline" (/impact): every analyzed policy as a glass tower on a paper
 * street, its height the policy's cumulative estimate after 1, 3 or 5 years
 * (the analysis's own timeline.year1 / year3 / year5, never the yearly
 * figure multiplied up), on one linear scale shared by all three horizons,
 * so switching the horizon shows the real growth. Gains rise from the
 * street in ledger teal; costs hang from its underside into a glass well in
 * ember amber, as in the explorer's city (bracketCityData.ts). A non-zero
 * amount never draws thinner than a sliver, $0 draws a flat tile, and a
 * policy with no projection at the horizon (an earlier, short analysis)
 * draws only an empty lot: nothing is invented.
 *
 * Three-free on purpose. The 3D scene (components/three/scenes/Skyline),
 * its server-rendered poster (components/impact/receipt/SkylinePoster), the
 * readout that states every figure, and tests/skyline.test.ts all build on
 * these functions, so the model, its poster and its words show the same
 * numbers in the same places.
 */
import { formatUSD, impactSign, impactWords, type ImpactSign } from '@/lib/format';

export type SkylineHorizon = 1 | 3 | 5;
export const SKYLINE_HORIZONS: readonly SkylineHorizon[] = [1, 3, 5];

/** The parts of a saved analysis the skyline reads (a row of analyzed_policies). */
export interface SkylineSource {
  id: string;
  policy_title: string;
  /** The stored analysis's timeline: cumulative dollars after 1, 3 and 5 years. Absent on earlier, short analyses. */
  timeline?: { year1?: unknown; year3?: unknown; year5?: unknown } | null;
}

/** One tower, at one horizon. */
export interface SkylineTower {
  id: string;
  label: string;
  /** Signed cumulative dollars after the horizon; null when the analysis has no projection for it. */
  value: number | null;
  /** The direction, for colour (always agrees with the sign of `value`; neutral when null or $0). */
  tone: ImpactSign;
}

/** The largest gain and the largest cost (both as positive dollars) the skyline has to hold. */
export interface SkylineReach {
  up: number;
  down: number;
}

/** "after 1 year", "after 3 years". */
export function horizonWords(h: SkylineHorizon): string {
  return h === 1 ? 'after 1 year' : `after ${h} years`;
}

/** The analysis's cumulative estimate after `h` years, or null when it has none (never derived from the yearly figure). */
export function projectionAt(timeline: SkylineSource['timeline'], h: SkylineHorizon): number | null {
  const v = timeline ? timeline[`year${h}` as const] : undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return Object.is(r, -0) ? 0 : r;
}

/** One tower per row, in the rows' order, at horizon `h`. */
export function skylineTowers(rows: readonly SkylineSource[], h: SkylineHorizon): SkylineTower[] {
  return rows.map((r) => {
    const value = projectionAt(r.timeline, h);
    return { id: r.id, label: r.policy_title, value, tone: value === null ? 'neutral' : impactSign(value) };
  });
}

/** The reach over every horizon, so the scale (and the frame) hold still while the horizon changes. */
export function skylineReach(rows: readonly SkylineSource[]): SkylineReach {
  let up = 0;
  let down = 0;
  for (const r of rows) {
    for (const h of SKYLINE_HORIZONS) {
      const v = projectionAt(r.timeline, h);
      if (v === null) continue;
      if (v > up) up = v;
      if (-v > down) down = -v;
    }
  }
  return { up, down };
}

/** The reach of one horizon's towers alone (a default for callers that show one horizon). */
export function reachOf(towers: readonly SkylineTower[]): SkylineReach {
  let up = 0;
  let down = 0;
  for (const t of towers) {
    if (t.value === null) continue;
    if (t.value > up) up = t.value;
    if (-t.value > down) down = -t.value;
  }
  return { up, down };
}

export interface SkylineTotals {
  /** Sum of every projected amount (signed). */
  net: number;
  /** Sum of the gains (positive). */
  gains: number;
  /** Sum of the costs (positive). */
  costs: number;
  gainCount: number;
  costCount: number;
  /** Projected at exactly $0. */
  flatCount: number;
  /** No projection at this horizon (left out of every sum). */
  missing: SkylineTower[];
}

export function skylineTotals(towers: readonly SkylineTower[]): SkylineTotals {
  const t: SkylineTotals = { net: 0, gains: 0, costs: 0, gainCount: 0, costCount: 0, flatCount: 0, missing: [] };
  for (const tower of towers) {
    const v = tower.value;
    if (v === null) {
      t.missing.push(tower);
      continue;
    }
    t.net += v;
    if (v > 0) {
      t.gains += v;
      t.gainCount += 1;
    } else if (v < 0) {
      t.costs -= v;
      t.costCount += 1;
    } else {
      t.flatCount += 1;
    }
  }
  return t;
}

/** The smallest of 1, 2, 2.5 or 5 × 10^k at or above x (at least 1). */
export function niceStep(x: number): number {
  if (!Number.isFinite(x) || x <= 1) return 1;
  const k = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * k >= x - 1e-9) return m * k;
  return 10 * k;
}

// ---------------------------------------------------------------------------
// The model: world units, for the scene and its poster alike

export const SKYLINE_WORLD = {
  /** A tower's square footprint. */
  width: 0.34,
  /** Between towers in a row. */
  gap: 0.2,
  /** Between rows (room for a row's tags). */
  rowGap: 0.36,
  /** The height of the reach's largest amount. */
  maxHeight: 1.9,
  /** The thinnest a non-zero amount draws. */
  sliver: 0.022,
  /** A $0 tile's thickness. */
  flat: 0.014,
  /** The paper street's thickness (its top is y = 0, the $0 line). */
  street: 0.05,
  /** Street around the towers. */
  margin: 0.3,
  /** Glass under the deepest cost. */
  well: 0.09,
  /** The porcelain foot under it all (its front edge carries the number tags). */
  foot: 0.17,
  /** A tower's number tag: a small plaque on the foot's front edge, straight below the tower. */
  tag: { width: 0.3, height: 0.118 },
  /** Up to this many policies stand in one row (and wear number tags); more make a block of rows. */
  rowMax: 8,
} as const;

/** The composed view: a three-quarter angle from the front right, a little above, on a long lens. */
export const SKYLINE_VIEW = { yaw: 0.42, pitch: 0.2, fov: 24 } as const;

export interface SkylineLot {
  id: string;
  /** 1-based, in the rows' order: the receipt's line number. */
  number: number;
  x: number;
  z: number;
  /** +1 rises (gain), −1 hangs (cost), 0 a flat $0 tile, null nothing projected (an empty lot). */
  dir: 1 | -1 | 0 | null;
  /** World height of the tower (0 for flat and empty lots). */
  height: number;
  /** Bottom and top, world y. */
  y0: number;
  y1: number;
  value: number | null;
  tone: ImpactSign;
}

export interface SkylineLayout {
  lots: SkylineLot[];
  cols: number;
  rows: number;
  /** The street's half extents. */
  halfX: number;
  halfZ: number;
  /** The reach's tallest gain and deepest cost, world y (0 when there is none). */
  top: number;
  depth: number;
  /** World y of the bottom of the foot. */
  bottom: number;
  /** World y where the glass well starts (the street's underside) and ends; null when no cost is in reach. */
  well: { y0: number; y1: number } | null;
  unitsPerDollar: number;
  /** Dollars in reach of the scale (the larger of up and down). */
  scale: number;
  /** Dollars per floor line etched in the glass. */
  floorDollars: number;
  /** Whether the lots wear number tags (one row of up to rowMax). */
  tags: boolean;
}

/** Lays out one horizon's towers, on the scale `reach` sets (default: their own). */
export function skylineLayout(towers: readonly SkylineTower[], reach: SkylineReach = reachOf(towers)): SkylineLayout {
  const W = SKYLINE_WORLD;
  const n = towers.length;
  const cols = n <= W.rowMax ? Math.max(1, n) : Math.min(12, Math.ceil(Math.sqrt(n * 2)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const pitchX = W.width + W.gap;
  const pitchZ = W.width + W.rowGap;
  const scale = Math.max(Math.abs(reach.up), Math.abs(reach.down));
  const unitsPerDollar = scale > 0 ? W.maxHeight / scale : 0;

  const lots: SkylineLot[] = towers.map((t, i) => {
    // Row 0 is the back row: the first (by the receipt's order, the largest) stand behind, the rest come forward.
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const col = i - row * cols;
    const x = (col - (inRow - 1) / 2) * pitchX;
    const z = (row - (rows - 1) / 2) * pitchZ;
    const v = t.value;
    if (v === null) return { id: t.id, number: i + 1, x, z, dir: null, height: 0, y0: 0, y1: 0, value: null, tone: 'neutral' };
    if (v === 0 || unitsPerDollar === 0) return { id: t.id, number: i + 1, x, z, dir: 0, height: 0, y0: 0, y1: W.flat, value: v, tone: 'neutral' };
    const height = Math.max(W.sliver, Math.abs(v) * unitsPerDollar);
    const dir = v > 0 ? 1 : -1;
    return { id: t.id, number: i + 1, x, z, dir, height, y0: dir > 0 ? 0 : -W.street - height, y1: dir > 0 ? height : -W.street, value: v, tone: dir > 0 ? 'gain' : 'loss' };
  });

  const halfX = (Math.max(1, cols) * pitchX - W.gap) / 2 + W.margin;
  const halfZ = (rows * pitchZ - W.rowGap) / 2 + W.margin;
  const top = Math.abs(reach.up) * unitsPerDollar;
  const depth = Math.abs(reach.down) * unitsPerDollar;
  const well = depth > 0 ? { y0: -W.street, y1: -W.street - depth - W.well } : null;
  const bottom = (well ? well.y1 : -W.street) - W.foot;
  return {
    lots,
    cols,
    rows,
    halfX,
    halfZ,
    top,
    depth,
    bottom,
    well,
    unitsPerDollar,
    scale,
    floorDollars: niceStep(scale / 5),
    tags: n > 0 && n <= W.rowMax,
  };
}

export type Vec3 = readonly [number, number, number];

/** World to view space for the composed angle: x across the frame, y up it, z toward the camera. */
export function projectSkyline([x, y, z]: Vec3, yaw: number = SKYLINE_VIEW.yaw, pitch: number = SKYLINE_VIEW.pitch): [number, number, number] {
  const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
  const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
  return [x1, y * Math.cos(pitch) - z1 * Math.sin(pitch), y * Math.sin(pitch) + z1 * Math.cos(pitch)];
}

/** The world point that projects to view (x, y) at depth z (the inverse of projectSkyline). */
export function unprojectSkyline([x1, y2, z2]: Vec3, yaw: number = SKYLINE_VIEW.yaw, pitch: number = SKYLINE_VIEW.pitch): [number, number, number] {
  const y = y2 * Math.cos(pitch) + z2 * Math.sin(pitch);
  const z1 = -y2 * Math.sin(pitch) + z2 * Math.cos(pitch);
  return [x1 * Math.cos(yaw) + z1 * Math.sin(yaw), y, -x1 * Math.sin(yaw) + z1 * Math.cos(yaw)];
}

export interface SkylineFrame {
  /** View-space centre and half extents of what the frame holds (with air). */
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  /** How far the view-space box reaches toward the camera from its centre plane. */
  near: number;
}

/**
 * The view-space box the frame must hold: the street, its foot, and the reach
 * of the scale up and down (not this horizon's towers), so the camera stands
 * still while the towers grow.
 */
export function skylineFrame(layout: SkylineLayout, yaw: number = SKYLINE_VIEW.yaw, pitch: number = SKYLINE_VIEW.pitch): SkylineFrame {
  const pts: Vec3[] = [];
  const top = Math.max(layout.top, 0.35);
  for (const x of [-layout.halfX, layout.halfX]) {
    for (const z of [-layout.halfZ, layout.halfZ]) {
      pts.push([x, top, z], [x, 0, z], [x, layout.bottom, z]);
    }
  }
  const p = pts.map((v) => projectSkyline(v, yaw, pitch));
  const xs = p.map((v) => v[0]);
  const ys = p.map((v) => v[1]);
  const zs = p.map((v) => v[2]);
  const air = 0.14;
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    halfW: (Math.max(...xs) - Math.min(...xs)) / 2 + air,
    halfH: (Math.max(...ys) - Math.min(...ys)) / 2 + air,
    near: Math.max(...zs),
  };
}

// ---------------------------------------------------------------------------
// Words

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const money = (n: number) => formatUSD(n, { signed: true });

/** What the picture shows (the SceneView's label for screen readers). */
export function describeSkyline(towers: readonly SkylineTower[], h: SkylineHorizon): string {
  if (towers.length === 0) return 'An empty paper street: no policies analyzed yet.';
  const t = skylineTotals(towers);
  const shown = towers.length - t.missing.length;
  if (shown === 0) {
    return `Your skyline ${horizonWords(h)}: ${plural(towers.length, 'empty lot', 'empty lots')}, because ${towers.length === 1 ? 'this analysis has' : 'these analyses have'} no projection that far yet.`;
  }
  const byValue = (sign: number) =>
    towers.filter((x) => x.value !== null && Math.sign(x.value) === sign).sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0))[0];
  const parts: string[] = [];
  const tall = byValue(1);
  const deep = byValue(-1);
  if (t.gainCount && tall) {
    parts.push(
      `${plural(t.gainCount, 'teal tower rises', 'teal towers rise')} for what could save you money, the tallest ${money(tall.value ?? 0)} (${tall.label})`
    );
  }
  if (t.costCount && deep) {
    parts.push(
      `${plural(t.costCount, 'amber tower hangs', 'amber towers hang')} below the street for what could cost you, the deepest ${money(deep.value ?? 0)} (${deep.label})`
    );
  }
  if (t.flatCount) parts.push(`${plural(t.flatCount, 'flat tile marks', 'flat tiles mark')} no change`);
  const missing = t.missing.length ? ` ${plural(t.missing.length, 'empty lot has', 'empty lots have')} no projection yet.` : '';
  return `Your skyline ${horizonWords(h)}, one glass tower per policy on one linear scale: ${parts.join('; ')}. Together, ${money(t.net)} (${impactWords(t.net)}).${missing}`;
}

/** The scale in words, for the caption under the picture. */
export function skylineScaleNote(layout: SkylineLayout, h: SkylineHorizon): string {
  if (layout.scale === 0) return `Height is the cumulative estimate ${horizonWords(h)}; nothing projected here is above or below $0.`;
  return `Height is the cumulative estimate ${horizonWords(h)}, on one linear scale for all three horizons. Each etched floor is ${formatUSD(layout.floorDollars)}.`;
}
