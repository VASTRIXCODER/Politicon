/**
 * The landing film's timeline, "From the Capitol to your kitchen table":
 * where the camera stands, where the bill is and what the light is doing at
 * every point of filmStore.progress (0 → 1, five equal shots). Plain numbers
 * with no three.js, so tests can hold the film to its script and the DOM
 * side can quote the same example figures.
 *
 *   1  0.0–0.2  The Capitol on its plinth in morning paper light; a slow dolly-in.
 *   2  0.2–0.4  A bill of glass lifts off the dome and glides toward the camera.
 *   3  0.4–0.6  It dissolves into light that streams into a household diorama.
 *   4  0.6–0.8  The light rises out of the house and settles into a ledger
 *               column: gains up from the baseline, costs down (an example).
 *   5  0.8–1.0  The camera pulls back, up and round into dusk, the house in
 *               front and the Capitol behind; the windows glow and some of
 *               the light comes back out as fireflies.
 *
 * World units: the Capitol stands at the origin (about 4.2 wide, 2.2 tall)
 * on a plinth whose top is y = 0; the household sits on its own plinth in
 * front of it and to the right (HOME).
 */
import { FILM_SHOTS, shotAt } from '@/lib/three/film';
import { DIORAMA, ledgerLayout, type Vec3 } from '@/components/three/kit/dioramaLayout';

export { FILM_SHOTS };
export type { Vec3 };
export type Mut3 = [number, number, number];

// ---------------------------------------------------------------------------
// Easing

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** How far p is through [start, end], clamped to 0..1. */
export function phase(p: number, start: number, end: number): number {
  return clamp01((p - start) / (end - start));
}

/** Rises from a to b, falls from b to c (smoothly), 0 outside. */
export function bump(p: number, a: number, b: number, c: number): number {
  return p <= b ? smoothstep(a, b, p) : 1 - smoothstep(b, c, p);
}

/** The shot a progress value is in, and how far through it (0..1). */
export function shotLocal(progress: number): { shot: number; t: number } {
  const shot = shotAt(progress);
  return { shot, t: clamp01(clamp01(progress) * FILM_SHOTS - shot) };
}

// ---------------------------------------------------------------------------
// Still frames: the composed moment of each shot (reduced motion, posters).

export const STILL_PROGRESS: readonly number[] = [0.12, 0.35, 0.5, 0.755, 0.985];
/** The animation clock a still frame is drawn at (fireflies, drift). */
export const STILL_TIME = 3.2;

export function stillProgress(shot: number): number {
  const i = Math.min(FILM_SHOTS - 1, Math.max(0, Math.round(Number.isFinite(shot) ? shot : 0)));
  return STILL_PROGRESS[i];
}

// ---------------------------------------------------------------------------
// The world

export const CAPITOL_PLINTH = { radius: 2.35, height: 0.24 } as const;
/** Where the household diorama stands, turned a little toward the Capitol and the camera. */
export const HOME = { position: [4.4, 0, 3.4] as Vec3, rotationY: -0.3 } as const;
/** The top of the Capitol's lantern, where the bill comes from. */
export const LANTERN: Vec3 = [0, 2.0, 0];

/** A point in the diorama's own units, in the world. */
export function homeToWorld([x, y, z]: Vec3): Mut3 {
  const c = Math.cos(HOME.rotationY);
  const s = Math.sin(HOME.rotationY);
  return [HOME.position[0] + x * c + z * s, HOME.position[1] + y, HOME.position[2] - x * s + z * c];
}

/**
 * The ledger the film resolves to. Illustrative figures, not a real
 * analysis: two gains and two costs netting +$1,240 a year (the page shows
 * the number, labelled as an example).
 */
export const FILM_LEDGER_EXAMPLE = [
  { label: 'Tax credit', amount: 1600 },
  { label: 'Lower premiums', amount: 420 },
  { label: 'Prices on goods', amount: -520 },
  { label: 'New fees', amount: -260 },
] as const;
export const FILM_LEDGER_AMOUNTS: readonly number[] = FILM_LEDGER_EXAMPLE.map((e) => e.amount);
/** Height per dollar in the film's ledger (linear, so the slabs compare honestly). */
export const FILM_LEDGER_SCALE = 1 / 2800;
export const FILM_LEDGER = ledgerLayout(FILM_LEDGER_AMOUNTS, { unitsPerDollar: FILM_LEDGER_SCALE });
export const LEDGER_WIDTH = 0.26;

const H = DIORAMA.house;
/** Inside the house: where the light gathers in shot 3. */
export const HOUSE_CORE: Mut3 = homeToWorld([H.center[0], H.wall * 0.5, H.center[2]]);
/** The foot of the ledger column. */
export const LEDGER_AT: Mut3 = homeToWorld(DIORAMA.ledger);

// ---------------------------------------------------------------------------
// Cues: what the light is doing at a point of the film.

export const TIMELINE = {
  /** The bill appears in the lantern, rises, glides toward the camera and settles facing it. */
  bill: { emerge: 0.19, arrive: 0.34 },
  /** Shot 3: the sheet dissolves (top first) and its light streams into the house. */
  stream: { start: 0.42, end: 0.585, stagger: 0.6 },
  /** Shot 4: the light rises out of the house and settles into the ledger, filling it from the baseline out. */
  settle: { start: 0.6, end: 0.735, stagger: 0.5 },
  /** The halo at the ledger's foot (the net is in), once the ledger is full. */
  net: { start: 0.735, end: 0.752 },
  /** Shot 5: day turns to dusk, briskly, so the page dips into night with it (filmMath duskProgress)… */
  dusk: { start: 0.79, end: 0.86 },
  /** …and some of the light comes back out as fireflies. */
  fireflies: { start: 0.83, end: 0.98, stagger: 0.5 },
} as const;

export interface FilmCues {
  /** 0 (day) … 1 (dusk). */
  dusk: number;
  /** The violet beam and glint at the lantern. */
  beam: number;
  /** Lamplight in the house's windows. */
  windows: number;
  /** How much of the bill has dissolved (0 whole … 1 gone). */
  cut: number;
  /** Shot 3's stream, 0..1 (particles read their own stagger from it). */
  stream: number;
  /** Shot 4's settle, 0..1. */
  settle: number;
  /** The ledger's fill front, 0..1 of its taller stack. */
  fill: number;
  /** The halo at the ledger's foot, 0..1. */
  mark: number;
  /** Shot 5's fireflies, 0..1. */
  fireflies: number;
}

export function cuesAt(progress: number): FilmCues {
  const p = clamp01(progress);
  const { stream: S, settle: T, net, dusk: D, fireflies: F } = TIMELINE;
  const stream = phase(p, S.start, S.end);
  const settle = phase(p, T.start, T.end);
  const dusk = smoothstep(D.start, D.end, p);
  // The light arriving warms the house; dusk lights it fully.
  const arrived = smoothstep(S.end - 0.07, S.end, p);
  return {
    dusk,
    beam: Math.max(0.4 * (1 - smoothstep(0.24, 0.34, p)), bump(p, 0.15, 0.2, 0.31)),
    windows: Math.max(0.5 * arrived, dusk),
    cut: clamp01(stream / S.stagger),
    stream,
    settle,
    fill: clamp01((settle - (1 - T.stagger)) / T.stagger),
    mark: smoothstep(net.start, net.end, p),
    fireflies: phase(p, F.start, F.end),
  };
}

// ---------------------------------------------------------------------------
// Paths: centripetal Catmull-Rom through key points (no cusps or loops).

function sub(a: Vec3, b: Vec3): Mut3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function knot(a: Vec3, b: Vec3): number {
  // The square root of the distance (centripetal), never zero.
  return Math.max(1e-4, Math.sqrt(Math.hypot(...sub(b, a))));
}

/** One centripetal Catmull-Rom segment from p1 to p2 (p0 and p3 shape it), at u in 0..1. */
export function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number, out: Mut3 = [0, 0, 0]): Mut3 {
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * clamp01(u);
  for (let i = 0; i < 3; i++) {
    const a1 = ((t1 - t) / t1) * p0[i] + (t / t1) * p1[i];
    const a2 = ((t2 - t) / (t2 - t1)) * p1[i] + ((t - t1) / (t2 - t1)) * p2[i];
    const a3 = ((t3 - t) / (t3 - t2)) * p2[i] + ((t - t2) / (t3 - t2)) * p3[i];
    const b1 = ((t2 - t) / t2) * a1 + (t / t2) * a2;
    const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
    out[i] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
  }
  return out;
}

/** The point before the first (or after the last), mirrored, so the path starts and ends on its keys. */
function mirror(a: Vec3, b: Vec3): Mut3 {
  return [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]];
}

/** Segment i of a path through `points` at u, out of the four points around it. */
function pathPoint(points: readonly Vec3[], i: number, u: number, out: Mut3): Mut3 {
  const n = points.length;
  const p1 = points[i];
  const p2 = points[Math.min(n - 1, i + 1)];
  const p0 = i > 0 ? points[i - 1] : mirror(p1, p2);
  const p3 = i + 2 < n ? points[i + 2] : mirror(p2, p1);
  return catmullRom(p0, p1, p2, p3, u, out);
}

/** The key segment progress falls in, and how far through it (eased). */
function segmentAt(keys: readonly { at: number }[], p: number, ease: (i: number, u: number) => number) {
  const last = keys.length - 1;
  if (p <= keys[0].at) return { i: 0, u: 0 };
  if (p >= keys[last].at) return { i: Math.max(0, last - 1), u: 1 };
  let i = 0;
  while (i < last - 1 && p >= keys[i + 1].at) i++;
  return { i, u: ease(i, (p - keys[i].at) / (keys[i + 1].at - keys[i].at)) };
}

// ---------------------------------------------------------------------------
// The camera: one path through two keys per shot. Within a shot it drifts
// (linearly, a slow dolly); between shots it moves, easing in and out.

export interface CameraKey {
  at: number;
  position: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
  /** How wide the shot's subject is at the target: a narrow view stands back until it fits. */
  span: number;
  /**
   * The pinned film on a wide screen (FILM_WIDE_PX and up) has its caption
   * column on the left and the rail on the right: the picture moves this
   * share of the view's width to the right (a lens shift, so perspective
   * holds), into the free band between them. Phones and still frames
   * compose as written.
   */
  shift: number;
}

/** From this view width the pinned film lays its captions out as a left column (the page's lg breakpoint). */
export const FILM_WIDE_PX = 1024;

/** A key with the camera stood back `k` times as far from its target, along the same line of sight. */
function back(key: CameraKey, k: number): CameraKey {
  const [px, py, pz] = key.position;
  const [tx, ty, tz] = key.target;
  return { ...key, position: [tx + (px - tx) * k, ty + (py - ty) * k, tz + (pz - tz) * k] };
}

export const CAMERA_KEYS: readonly CameraKey[] = [
  // 1: three-quarter view of the Capitol from the front left (the household is off to the right), dollying in.
  { at: 0, position: [-3.6, 1.95, 9.6], target: [-0.3, 1.12, 0], fov: 30, span: 5.4, shift: 0.07 },
  { at: 0.16, position: [-2.6, 1.62, 7.3], target: [-0.05, 1.15, 0], fov: 30, span: 5, shift: 0.07 },
  // 2: swung right and up to watch the bill rise, then the bill in the foreground with the dome behind.
  { at: 0.24, position: [-0.4, 2.5, 8.0], target: [0.1, 1.9, 1.4], fov: 30, span: 3, shift: 0.08 },
  { at: 0.36, position: [-0.75, 1.95, 7.7], target: [0.3, 1.55, 3.4], fov: 30, span: 3, shift: 0 },
  // 3: panning right along the stream of light to the house (its ledger post clear of the rail).
  { at: 0.44, position: [-0.6, 2.2, 9.2], target: [1.8, 1.1, 3.8], fov: 31, span: 4.6, shift: -0.08 },
  { at: 0.56, position: [1.6, 2.1, 9.1], target: [2.75, 0.8, 3.6], fov: 31, span: 5, shift: -0.1 },
  // 4: in close on the house and its ledger, both clear of the caption.
  back({ at: 0.64, position: [3.3, 1.6, 7.6], target: [4.4, 0.52, 3.3], fov: 30, span: 2.7, shift: 0.16 }, 1.14),
  back({ at: 0.76, position: [3.7, 1.38, 6.95], target: [4.6, 0.5, 3.3], fov: 30, span: 2.5, shift: 0.16 }, 1.14),
  // 5: back, up and round to the front right into dusk: the house and its
  // ledger in front, the Capitol standing behind them across the dark.
  { at: 0.84, position: [5.4, 2.6, 9.2], target: [3.9, 0.6, 2.6], fov: 32, span: 4.4, shift: 0.12 },
  { at: 1, position: [9.45, 5.27, 12.29], target: [2.0, 0.6, 1.4], fov: 33, span: 5.4, shift: 0.155 },
];

export interface CameraPose {
  position: Mut3;
  target: Mut3;
  fov: number;
  span: number;
  /** The wide-screen lens shift (CameraKey.shift). */
  shift: number;
}

const cameraPositions = CAMERA_KEYS.map((k) => k.position);
const cameraTargets = CAMERA_KEYS.map((k) => k.target);
// Even segments drift within a shot; odd ones move between shots.
const cameraEase = (i: number, u: number) => (i % 2 === 0 ? u : u * u * (3 - 2 * u));

export function cameraAt(progress: number, out: CameraPose = { position: [0, 0, 0], target: [0, 0, 0], fov: 30, span: 1, shift: 0 }): CameraPose {
  const { i, u } = segmentAt(CAMERA_KEYS, clamp01(progress), cameraEase);
  const next = CAMERA_KEYS[Math.min(CAMERA_KEYS.length - 1, i + 1)];
  pathPoint(cameraPositions, i, u, out.position);
  pathPoint(cameraTargets, i, u, out.target);
  out.fov = mix(CAMERA_KEYS[i].fov, next.fov, u);
  out.span = mix(CAMERA_KEYS[i].span, next.span, u);
  out.shift = mix(CAMERA_KEYS[i].shift, next.shift, u);
  return out;
}

/** Wider than this, every shot is composed as written. */
const WIDE = 1.5;

/**
 * Framing for the view's shape: a narrow (portrait) view takes a slightly
 * wider lens and stands further back along the same line of sight, just far
 * enough for the shot's subject (`span` units wide at `distance`) to fit
 * across it. `distance` is the factor to scale the camera's distance by.
 */
export function aspectFit(aspect: number, span = 0, distance = 1, fov = 30): { distance: number; fov: number } {
  if (!(aspect > 0) || aspect >= WIDE) return { distance: 1, fov: 0 };
  const extraFov = Math.min(6, (WIDE / aspect - 1) * 3);
  const halfWidth = Math.tan(((fov + extraFov) * Math.PI) / 360) * aspect * Math.max(1e-3, distance);
  return { distance: Math.min(3, Math.max(1, (span * 0.56) / halfWidth)), fov: extraFov };
}

/** How far the camera stands from what it looks at. */
export function poseDistance(pose: CameraPose): number {
  return Math.hypot(...sub(pose.position, pose.target));
}

// ---------------------------------------------------------------------------
// The bill

/** BillSheet's size at scale 1 (letter proportions, one unit tall). */
export const SHEET = { width: 0.773, height: 1 } as const;
/** Where the bill comes to rest in shot 2, and dissolves in shot 3. */
export const BILL_REST: Vec3 = [0.55, 1.62, 4.3];
export const BILL_REST_SCALE = 0.8;

/** Yaw and pitch (Euler YXZ) that turn a +z-facing sheet at `from` toward `to`. */
export function faceToward(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const [dx, dy, dz] = sub(to, from);
  return { yaw: Math.atan2(dx, dz), pitch: -Math.atan2(dy, Math.hypot(dx, dz)) };
}

const facing = faceToward(BILL_REST, CAMERA_KEYS[3].position);
/** At rest the sheet faces the camera, turned a little so its glass edge and seal catch the rim light. */
export const BILL_REST_ROTATION: Vec3 = [facing.pitch, facing.yaw + 0.42, 0.02];

interface BillKey {
  at: number;
  position: Vec3;
  /** Euler YXZ: [pitch, yaw, roll]. */
  rotation: Vec3;
  scale: number;
}

const BILL_KEYS: readonly BillKey[] = [
  // Lying in the lantern, tiny.
  { at: TIMELINE.bill.emerge, position: [0, LANTERN[1] + 0.02, 0], rotation: [-Math.PI / 2, 0, 0], scale: 0.08 },
  // Lifting off the dome, tilting up.
  { at: 0.225, position: [0, 2.5, 0.12], rotation: [-1.15, 0.35, 0.1], scale: 0.34 },
  // Gliding toward the camera, still turning.
  { at: 0.28, position: [0.2, 2.45, 1.7], rotation: [-0.5, 0.95, 0.06], scale: 0.6 },
  { at: TIMELINE.bill.arrive, position: BILL_REST, rotation: BILL_REST_ROTATION, scale: BILL_REST_SCALE },
];
const billPositions = BILL_KEYS.map((k) => k.position);
const billEase = (_: number, u: number) => u * u * (3 - 2 * u);

export interface BillPose {
  visible: boolean;
  position: Mut3;
  /** Euler YXZ: [pitch, yaw, roll]. */
  rotation: Mut3;
  scale: number;
  /** How much has dissolved, top first (0 whole … 1 gone). */
  cut: number;
}

export function billAt(progress: number, out: BillPose = { visible: false, position: [0, 0, 0], rotation: [0, 0, 0], scale: 0, cut: 0 }): BillPose {
  const p = clamp01(progress);
  const { i, u } = segmentAt(BILL_KEYS, p, billEase);
  pathPoint(billPositions, i, u, out.position);
  const a = BILL_KEYS[i];
  const b = BILL_KEYS[Math.min(BILL_KEYS.length - 1, i + 1)];
  for (let k = 0; k < 3; k++) out.rotation[k] = mix(a.rotation[k], b.rotation[k], u);
  out.scale = mix(a.scale, b.scale, u);
  out.cut = cuesAt(p).cut;
  out.visible = p >= TIMELINE.bill.emerge && out.cut < 1;
  return out;
}

// ---------------------------------------------------------------------------
// The bill's official record: real DOM type pinned onto the sheet's face
// while it rests in shot 2 (components/landing/film/BillRecord), placed
// every frame from the sheet's projected corners.

/** CSS px per sheet unit: the record is laid out on a SHEET.width × SHEET.height face at this size. */
export const RECORD_PX = 400;

/** How much of the record shows (0 … 1): in as the sheet settles, out as it starts to dissolve. */
export function recordShown(progress: number): number {
  const p = clamp01(progress);
  const { bill, stream } = TIMELINE;
  return smoothstep(bill.arrive - 0.035, bill.arrive + 0.004, p) * (1 - smoothstep(stream.start - 0.008, stream.start + 0.018, p));
}

export type Px = readonly [number, number];

/**
 * The CSS matrix3d() that maps a w × h box (transform-origin 0 0) onto a
 * quad on screen, corners given clockwise from the top left: an exact
 * projective (homography) mapping, so DOM type pinned to a plane in 3D keeps
 * its perspective. Null when the quad is degenerate (seen edge-on).
 */
export function quadMatrix3d(w: number, h: number, tl: Px, tr: Px, br: Px, bl: Px): string | null {
  // Heckbert's square-to-quad mapping: (0,0)→tl, (1,0)→tr, (1,1)→br, (0,1)→bl.
  const [x0, y0] = tl;
  const [x1, y1] = tr;
  const [x2, y2] = br;
  const [x3, y3] = bl;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sy = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  if (!(w > 0 && h > 0) || !Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const g = (sx * dy2 - dx2 * sy) / det;
  const k = (dx1 * sy - sx * dy1) / det;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  if (!m.every(Number.isFinite)) return null;
  return `matrix3d(${m.map((v) => +v.toPrecision(10)).join(',')})`;
}

// ---------------------------------------------------------------------------
// The light: particle counts by tier, the curves it flows along, and where
// each particle starts, gathers, settles and roams.

export const PARTICLE_COUNT: Record<1 | 2, number> = { 1: 3200, 2: 14000 };
/** One particle in this many comes back out as a firefly at dusk. */
export const FIREFLY_EVERY = 36;
const LEG1_ROWS = 14;
const LEG2_ROWS = 10;

function add(...vs: Vec3[]): Mut3 {
  return vs.reduce<Mut3>((o, v) => [o[0] + v[0], o[1] + v[1], o[2] + v[2]], [0, 0, 0]);
}
const scale3 = (v: Vec3, k: number): Mut3 => [v[0] * k, v[1] * k, v[2] * k];

/** Horizontal unit vectors along a→b and across it. */
function frame(a: Vec3, b: Vec3) {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz) || 1;
  const along: Mut3 = [dx / len, 0, dz / len];
  const across: Mut3 = [-along[2], 0, along[0]];
  return { along, across };
}

export interface FlowCurves {
  /** Shot 3: from the bill, arcing over, down through the roof into the house. */
  leg1: Mut3[][];
  /** Shot 4: up out of the house and into the top of the ledger column. */
  leg2: Mut3[][];
}

export function flowCurves(): FlowCurves {
  const up = (k: number): Mut3 => [0, k, 0];
  const b = BILL_REST;
  const h = HOUSE_CORE;
  const f1 = frame(b, h);
  const toward: Mut3 = [0, 0, 1];
  const leg1 = Array.from({ length: LEG1_ROWS }, (_, j) => {
    const t = j / (LEG1_ROWS - 1) - 0.5;
    return [
      add(b, scale3(f1.across, t * 0.5)),
      add(b, scale3(f1.along, 0.35), up(0.32 + 0.22 * Math.abs(t)), scale3(f1.across, t * 0.75), scale3(toward, 0.15)),
      add(scale3(add(b, h), 0.5), up(0.8 + 0.35 * t), scale3(f1.across, t * 0.95)),
      add(h, up(0.9), scale3(f1.across, t * 0.32), scale3(f1.along, -0.18)),
      add(h, up(0.4), scale3(f1.across, t * 0.08)),
      [...h] as Mut3,
    ];
  });

  const l = add(LEDGER_AT, up(FILM_LEDGER.baseline));
  const f2 = frame(h, l);
  const leg2 = Array.from({ length: LEG2_ROWS }, (_, j) => {
    const t = j / (LEG2_ROWS - 1) - 0.5;
    return [
      [...h] as Mut3,
      add(h, up(0.58), scale3(f2.across, t * 0.12)),
      add(scale3(add(h, l), 0.5), up(0.82 + 0.18 * t), scale3(f2.across, t * 0.3), scale3(toward, 0.08)),
      add(LEDGER_AT, up(FILM_LEDGER.top + 0.26), scale3(f2.across, t * 0.1)),
      add(l, up(0.05)),
    ];
  });
  return { leg1, leg2 };
}

/** A tiny deterministic random (mulberry32), so every load and every still frame looks the same. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ParticleLayout {
  count: number;
  /** Sheet-local [x, y] where each particle starts (BillSheet units, centred). */
  sheet: Float32Array;
  /** [release order in shot 3, order in shot 4, firefly order (-1: stays settled), random]. */
  order: Float32Array;
  /** World point inside the house where it gathers. */
  home: Float32Array;
  /** World point inside a ledger slab where it settles. */
  slot: Float32Array;
  /** World point it roams around as a firefly. */
  fly: Float32Array;
  /** [leg-1 curve row, leg-2 curve row]. */
  rows: Float32Array;
  /** +1 settles into a gain slab, -1 into a cost slab. */
  kind: Float32Array;
  rowCount: { leg1: number; leg2: number };
}

export function particleLayout(count: number, seed = 7): ParticleLayout {
  const n = Math.max(1, Math.floor(count));
  const rand = seeded(seed + n);
  const sheet = new Float32Array(n * 2);
  const order = new Float32Array(n * 4);
  const home = new Float32Array(n * 3);
  const slot = new Float32Array(n * 3);
  const fly = new Float32Array(n * 3);
  const rows = new Float32Array(n * 2);
  const kind = new Float32Array(n);

  const slabs = FILM_LEDGER.slabs;
  const weights = slabs.map((s) => s.outer - s.inner);
  const total = weights.reduce((a, b) => a + b, 0);
  const half = LEDGER_WIDTH / 2 - 0.03;
  const [cx, , cz] = H.center;

  for (let i = 0; i < n; i++) {
    // On the sheet; it dissolves top first, the left edge a touch ahead.
    const sx = (rand() - 0.5) * (SHEET.width - 0.02);
    const sy = (rand() - 0.5) * (SHEET.height - 0.02);
    sheet.set([sx, sy], i * 2);
    const r1 = clamp01((0.5 - sy / SHEET.height) * 0.88 + (sx / SHEET.width + 0.5) * 0.08 + rand() * 0.04);

    // Inside the house body.
    home.set(homeToWorld([cx + (rand() - 0.5) * (H.width - 0.1), 0.05 + rand() * (H.wall - 0.09), cz + (rand() - 0.5) * (H.depth - 0.1)]), i * 3);

    // In a slab, chosen by its height, so every slab fills evenly.
    let pick = rand() * total;
    let k = 0;
    while (k < slabs.length - 1 && pick > weights[k]) pick -= weights[k++];
    const s = slabs[k];
    const y = s.bottom + 0.012 + rand() * Math.max(0, s.top - s.bottom - 0.024);
    slot.set(homeToWorld([DIORAMA.ledger[0] + (rand() - 0.5) * 2 * half, y, DIORAMA.ledger[2] + (rand() - 0.5) * 2 * half]), i * 3);
    kind[i] = s.gain ? 1 : -1;
    const r2 = clamp01(Math.abs(y - FILM_LEDGER.baseline) / FILM_LEDGER.extent);

    // Fireflies roam around the household, and a few over the gap toward the Capitol.
    const firefly = i % FIREFLY_EVERY === 0;
    const a = rand() * Math.PI * 2;
    const far = rand() < 0.22;
    const radius = far ? 1.6 + rand() * 1.6 : 0.45 + rand() * 1.55;
    const centre = far ? homeToWorld([-1.8, 0, -1.2]) : homeToWorld([0, 0, 0]);
    fly.set([centre[0] + Math.cos(a) * radius, 0.14 + rand() ** 1.4 * 1.5, centre[2] + Math.sin(a) * radius * 0.8], i * 3);

    order.set([r1, r2, firefly ? rand() : -1, rand()], i * 4);
    rows.set([Math.min(LEG1_ROWS - 1, Math.floor((sx / SHEET.width + 0.5) * LEG1_ROWS)), Math.floor(rand() * LEG2_ROWS)], i * 2);
  }
  return { count: n, sheet, order, home, slot, fly, rows, kind, rowCount: { leg1: LEG1_ROWS, leg2: LEG2_ROWS } };
}
