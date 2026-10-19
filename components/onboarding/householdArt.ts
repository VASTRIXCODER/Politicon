/**
 * The household diorama drawn flat, for its posters (HouseholdPoster): the
 * same model, the same spots and the same camera as the 3D scene
 * (components/three/kit/dioramaLayout.ts), projected through the same
 * pinhole into SVG paths and shaded face by face, like an architect's
 * drawing of the model. So the poster a page shows before (or without) WebGL
 * is the scene's own composition, in any box.
 *
 * Pure and three-free: it ships in the first load of the pages that show a
 * household, and runs on the server.
 */
import {
  DIORAMA,
  DWELLINGS,
  PLAQUE,
  PROP_SCALE,
  WALL_FACE,
  dwellingWindows,
  householdLayout,
  householdProjector,
  householdShot,
  piecePosition,
  type DwellingSpec,
  type Vec3,
} from '@/components/three/kit/dioramaLayout';
import type { Dwelling, HouseholdModel, HouseholdProp } from '@/lib/household';

/** What a face is made of; its tone also depends on how it faces the light. */
type Material = 'porcelain' | 'roof' | 'ink' | 'wheel' | 'violet' | 'pane' | 'crown' | 'person';

/** The tones a poster paints with (classes in householdPoster.module.css). */
export type Tone = 'p0' | 'p1' | 'p2' | 'p3' | 'r0' | 'r1' | 'ink0' | 'ink1' | 'wheel' | 'violet' | 'pane' | 'crown0' | 'crown1' | 'person' | 'shadow';

interface Face {
  pts: Vec3[];
  n: Vec3;
  mat: Material;
  /** Drawn in layer order (walls, then what's on them, the roof, what's on the roof), far to near within a layer. */
  layer: number;
}

/** A disc (a figure's head, a wheel, a tree's crown), drawn round whatever the view. */
interface Disc {
  at: Vec3;
  r: number;
  mat: Material;
  layer: number;
}

/** A figure's body: an upright pill from the ground to its shoulders. */
interface Pill {
  at: Vec3;
  r: number;
  h: number;
  layer: number;
}

interface Solid {
  faces: Face[];
  discs: Disc[];
  pills: Pill[];
  /** Soft contact shadow on the ground: [radius x, radius z] around the piece's spot. */
  shadow: [number, number];
}

export interface ArtShape {
  d: string;
  tone: Tone;
}

export interface ArtPiece {
  /** The piece id (dioramaLayout householdPieces), or a scenery id ('tree', 'path'). */
  id: string;
  shapes: ArtShape[];
}

export interface HouseholdArt {
  /** viewBox size: 1000 across, and the box's aspect. */
  width: number;
  height: number;
  plinth: { top: string; side: string; ring: string; shadow: Ellipse };
  halo: Ellipse;
  /** Back to front. */
  pieces: ArtPiece[];
  /** Where the state's plaque sits, as a share of the box (the 3D scene keeps it there too). */
  plaque: { x: number; y: number };
  /** A ground ellipse under the newest piece, for its pulse of light. */
  pulse: Ellipse | null;
}

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

const VIEW_WIDTH = 1000;

/** The poster's light: high, from the front right (the faces toward the camera's left fall into shade). */
const LIGHT: Vec3 = (() => {
  const v: Vec3 = [0.25, 0.85, 0.48];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function toneOf(mat: Material, n: Vec3): Tone {
  const k = dot(n, LIGHT);
  switch (mat) {
    case 'porcelain':
      return k >= 0.75 ? 'p0' : k >= 0.4 ? 'p1' : k >= 0.12 ? 'p2' : 'p3';
    case 'roof':
      return k >= 0.4 ? 'r0' : 'r1';
    case 'ink':
      return k >= 0.4 ? 'ink0' : 'ink1';
    case 'crown':
      return k >= 0.4 ? 'crown0' : 'crown1';
    default:
      return mat;
  }
}

// ---------------------------------------------------------------------------
// Solids, in the piece's own frame (origin on the ground, facing +z).

/** An axis-aligned box around `c` (its bottom face is never seen from above). */
function box(c: Vec3, size: Vec3, mat: Material, layer: number, top: Material = mat): Face[] {
  const [x, y, z] = c;
  const [w, h, d] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const p = (sx: number, sy: number, sz: number): Vec3 => [x + sx * w, y + sy * h, z + sz * d];
  return [
    { n: [0, 1, 0], pts: [p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1)], mat: top, layer },
    { n: [0, 0, 1], pts: [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], mat, layer },
    { n: [0, 0, -1], pts: [p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)], mat, layer },
    { n: [1, 0, 0], pts: [p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1)], mat, layer },
    { n: [-1, 0, 0], pts: [p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)], mat, layer },
  ];
}

/** A flat rectangle on a wall, turned by `ry` from facing +z (a window, a door). */
function plate(x: number, y: number, z: number, ry: number, w: number, h: number, mat: Material, layer: number): Face {
  const [c, s] = [Math.cos(ry), Math.sin(ry)];
  const at = (u: number, v: number): Vec3 => [x + u * c, y + v, z - u * s];
  return { n: [s, 0, c], pts: [at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)], mat, layer };
}

function windowsOf(d: Dwelling): Face[] {
  return dwellingWindows(d).map(([x, y, z, ry, w, h]) => plate(x, y, z, ry, w, h, 'pane', 1));
}

function gabled(d: Dwelling, s: Extract<DwellingSpec, { kind: 'gabled' }>): Face[] {
  const W = s.width / 2;
  const D = s.depth / 2;
  const ridge = s.wall + s.gable;
  const front: Vec3[] = [[-W, 0, D], [W, 0, D], [W, s.wall, D], [0, ridge, D], [-W, s.wall, D]];
  const faces: Face[] = [
    { n: [0, 0, 1], pts: front, mat: 'porcelain', layer: 0 },
    { n: [0, 0, -1], pts: front.map(([x, y]) => [x, y, -D] as Vec3), mat: 'porcelain', layer: 0 },
    { n: [-1, 0, 0], pts: [[-W, 0, -D], [-W, 0, D], [-W, s.wall, D], [-W, s.wall, -D]], mat: 'porcelain', layer: 0 },
    { n: [1, 0, 0], pts: [[W, 0, D], [W, 0, -D], [W, s.wall, -D], [W, s.wall, D]], mat: 'porcelain', layer: 0 },
    ...windowsOf(d),
    plate(0, 0.1, D + WALL_FACE, 0, 0.11, 0.2, 'violet', 1),
    oculus(0, s.wall + s.gable * 0.38, D + WALL_FACE, 0.042),
  ];
  // The roof: two slabs resting on the slopes, past the eaves and the gable ends, with their front edges.
  const a = Math.atan2(s.gable, W);
  const [c, sn] = [Math.cos(a), Math.sin(a)];
  const over = 0.06;
  const t = 0.03;
  const zz = D + 0.05;
  for (const side of [-1, 1]) {
    const n: Vec3 = [side * sn, c, 0];
    const lift = (x: number, y: number, z: number): Vec3 => [x + n[0] * t, y + n[1] * t, z];
    const eave = [side * (W + over * c), s.wall - over * sn];
    faces.push(
      { n, pts: [lift(0, ridge, zz), lift(eave[0], eave[1], zz), lift(eave[0], eave[1], -zz), lift(0, ridge, -zz)], mat: 'roof', layer: 2 },
      { n: [0, 0, 1], pts: [[0, ridge, zz], [eave[0], eave[1], zz], lift(eave[0], eave[1], zz), lift(0, ridge, zz)], mat: 'roof', layer: 2 }
    );
  }
  // The chimney, from the roof up.
  const cx = s.width * (0.16 / 0.62);
  const roofY = s.wall + s.gable * (1 - cx / W);
  const topY = s.wall + s.gable * 0.62 + 0.1;
  faces.push(...box([cx, (roofY + topY) / 2, -s.depth * 0.24], [0.06, topY - roofY + 0.02, 0.06], 'porcelain', 3));
  return faces;
}

/** A round window, as an octagon. */
function oculus(x: number, y: number, z: number, r: number): Face {
  const pts = Array.from({ length: 8 }, (_, i): Vec3 => {
    const a = (i / 8) * Math.PI * 2;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
  });
  return { n: [0, 0, 1], pts, mat: 'pane', layer: 1 };
}

function block(s: Extract<DwellingSpec, { kind: 'block' }>): Face[] {
  const { width: w, depth: d, height: h } = s;
  return [
    ...box([0, h / 2, 0], [w, h, d], 'porcelain', 0),
    ...windowsOf('apartment'),
    plate(0, 0.085, d / 2 + WALL_FACE, 0, 0.1, 0.17, 'violet', 1),
    ...box([0, 0.19, d / 2 + 0.03], [0.16, 0.012, 0.06], 'roof', 2),
    ...box([0, h + 0.015, 0], [w + 0.03, 0.03, d + 0.03], 'roof', 3),
    ...box([w * 0.18, h + 0.065, -d * 0.15], [0.14, 0.07, 0.12], 'porcelain', 4),
  ];
}

function hall(s: Extract<DwellingSpec, { kind: 'hall' }>): Face[] {
  const { width: w, depth: d, height: h } = s;
  const porch = d / 2 + 0.06;
  const zf = porch + 0.06;
  const zb = porch - 0.06;
  const slope = Math.hypot(0.2, 0.09);
  const cap = h + 0.095;
  const apex: Vec3 = [0, h + 0.175, -0.02];
  return [
    ...box([0, h / 2, 0], [w, h, d], 'porcelain', 0),
    ...windowsOf('campus'),
    plate(0, 0.12, d / 2 + WALL_FACE, 0, 0.1, 0.18, 'violet', 1),
    ...box([0, h + 0.0125, 0], [w + 0.03, 0.025, d + 0.03], 'roof', 2),
    ...box([0, 0.015, porch], [0.42, 0.03, 0.15], 'porcelain', 3),
    ...[-0.15, -0.06, 0.06, 0.15].flatMap((x) => box([x, 0.03 + (h - 0.06) / 2, porch + 0.03], [0.03, h - 0.06, 0.03], 'porcelain', 4)),
    ...box([0, h - 0.015, porch], [0.4, 0.03, 0.12], 'roof', 5),
    // The pediment: its front triangle and two sloping tops.
    { n: [0, 0, 1], pts: [[-0.2, h, zf], [0.2, h, zf], [0, h + 0.09, zf]], mat: 'roof', layer: 6 },
    { n: [-0.09 / slope, 0.2 / slope, 0], pts: [[-0.2, h, zf], [0, h + 0.09, zf], [0, h + 0.09, zb], [-0.2, h, zb]], mat: 'roof', layer: 6 },
    { n: [0.09 / slope, 0.2 / slope, 0], pts: [[0.2, h, zf], [0, h + 0.09, zf], [0, h + 0.09, zb], [0.2, h, zb]], mat: 'roof', layer: 6 },
    // The lantern on the roof.
    ...box([0, h + 0.06, -0.02], [0.08, 0.07, 0.08], 'porcelain', 7),
    ...[
      [[-1, 1], [1, 1], [0, 0, 1]],
      [[1, -1], [-1, -1], [0, 0, -1]],
      [[1, 1], [1, -1], [1, 0, 0]],
      [[-1, -1], [-1, 1], [-1, 0, 0]],
    ].map(([a, b, n]): Face => ({
      n: [n[0] * 0.8, 0.6, n[2] * 0.8],
      pts: [[a[0] * 0.056, cap, -0.02 + a[1] * 0.056], [b[0] * 0.056, cap, -0.02 + b[1] * 0.056], apex],
      mat: 'roof',
      layer: 8,
    })),
  ];
}

function dwellingSolid(d: Dwelling): Solid {
  const s: DwellingSpec = DWELLINGS[d];
  const faces = s.kind === 'gabled' ? gabled(d, s) : s.kind === 'block' ? block(s) : hall(s);
  return { faces, discs: [], pills: [], shadow: [s.width * 0.72, s.depth * 0.78] };
}

function propSolid(kind: HouseholdProp): Solid {
  const solid = (faces: Face[], shadow: [number, number], discs: Disc[] = []): Solid => ({ faces, discs, pills: [], shadow });
  switch (kind) {
    case 'car':
      return solid(
        [...box([0, 0.062, 0], [0.28, 0.07, 0.14], 'porcelain', 1), ...box([-0.02, 0.118, 0], [0.15, 0.065, 0.12], 'roof', 2)],
        [0.2, 0.12],
        [-0.085, 0.085].map((x): Disc => ({ at: [x, 0.032, 0.07], r: 0.032, mat: 'wheel', layer: 0 }))
      );
    case 'mortgage-key': {
      // Lying flat, as the 3D one does (HouseholdProps: a torus bow, a shaft, two teeth, at its 1.25 scale):
      // a round bow with the plinth showing through its hole.
      const ring = (r: number, y: number): Vec3[] =>
        Array.from({ length: 16 }, (_, i): Vec3 => [-0.0625 + Math.cos((i / 16) * Math.PI * 2) * r, y, Math.sin((i / 16) * Math.PI * 2) * r]);
      return solid(
        [
          { n: [0, 1, 0], pts: ring(0.046, 0.022), mat: 'violet', layer: 0 },
          { n: [0, 1, 0], pts: ring(0.024, 0.0221), mat: 'porcelain', layer: 1 },
          ...box([0.025, 0.0075, 0], [0.1125, 0.015, 0.0175], 'violet', 0),
          ...box([0.07, 0.0075, 0.02], [0.0175, 0.015, 0.0325], 'violet', 0),
          ...box([0.045, 0.0075, 0.015], [0.0125, 0.015, 0.0225], 'violet', 0),
        ],
        [0.11, 0.05]
      );
    }
    case 'grad-cap':
      return solid(
        [
          ...box([0, 0.014, 0], [0.15, 0.028, 0.1], 'ink', 0),
          ...box([0.006, 0.041, 0.002], [0.13, 0.026, 0.09], 'violet', 1),
          ...box([0, 0.071, 0], [0.084, 0.034, 0.084], 'ink', 2),
          { n: [0, 1, 0], pts: [[0.085, 0.095, 0], [0, 0.095, -0.085], [-0.085, 0.095, 0], [0, 0.095, 0.085]], mat: 'ink', layer: 3 },
        ],
        [0.1, 0.075]
      );
    case 'card':
      return solid(
        [...box([0, 0.048, -0.01], [0.15, 0.095, 0.01], 'violet', 0), plate(-0.042, 0.055, -0.004, 0, 0.026, 0.02, 'porcelain', 1)],
        [0.1, 0.05]
      );
    case 'medical':
      return solid(
        [
          ...box([0, 0.006, 0], [0.07, 0.012, 0.04], 'ink', 0),
          ...box([0, 0.067, 0], [0.11, 0.11, 0.022], 'porcelain', 1),
          plate(0, 0.067, 0.012, 0, 0.06, 0.018, 'violet', 2),
          plate(0, 0.067, 0.012, 0, 0.018, 0.06, 'violet', 2),
        ],
        [0.07, 0.04]
      );
    case 'ledger':
      return solid(
        [
          ...box([0, 0.015, 0], [0.15, 0.03, 0.105], 'ink', 0),
          plate(0.0755, 0.015, 0, Math.PI / 2, 0.095, 0.02, 'porcelain', 1),
          { n: [0, 1, 0], pts: [[-0.02, 0.0305, -0.016], [0.03, 0.0305, -0.016], [0.03, 0.0305, 0.016], [-0.02, 0.0305, 0.016]], mat: 'violet', layer: 1 },
        ],
        [0.1, 0.075]
      );
    case 'briefcase':
      return solid(
        [...box([0, 0.05, 0], [0.15, 0.1, 0.05], 'ink', 0), plate(0, 0.072, 0.026, 0, 0.15, 0.006, 'porcelain', 1), ...box([0, 0.111, 0], [0.05, 0.012, 0.012], 'violet', 1)],
        [0.1, 0.045]
      );
  }
}

function treeSolid(): Solid {
  return {
    faces: box([0, 0.08, 0], [0.026, 0.16, 0.026], 'porcelain', 0),
    discs: [
      { at: [0, 0.25, 0], r: 0.14, mat: 'crown', layer: 1 },
      { at: [0.02, 0.38, 0.01], r: 0.1, mat: 'crown', layer: 2 },
    ],
    pills: [],
    shadow: [0.17, 0.17],
  };
}

function figureSolid(height: number): Solid {
  const r = height * 0.15;
  // The people in the 3D scene's soft violet slate (HouseholdDiorama's person material).
  return { faces: [], discs: [{ at: [0, height - r, 0], r, mat: 'person', layer: 1 }], pills: [{ at: [0, 0, 0], r, h: height * 0.64, layer: 0 }], shadow: [0.05, 0.05] };
}

/** The stepping stones from a gabled home's door (in diorama coordinates). */
const STONES: [number, number, number][] = [
  [0.0, 0.3, 0.05],
  [0.03, 0.44, 0.045],
  [0.08, 0.58, 0.05],
  [0.14, 0.72, 0.042],
];

// ---------------------------------------------------------------------------

const f1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The poster's drawing of `model` for a box of `aspect`, from the build
 * camera (or, for `mode: 'avatar'`, the avatar's, at its resting turn).
 * `close` is the build camera's close framing (the phone's band).
 */
export function householdArt(model: HouseholdModel, mode: 'build' | 'avatar', aspect: number, lastAdded: string | null = null, close = false): HouseholdArt {
  const width = VIEW_WIDTH;
  const height = VIEW_WIDTH / aspect;
  const shot = householdShot(mode, aspect, 0, close);
  const project = householdProjector(shot, aspect);
  const half = Math.tan((shot.fov * Math.PI) / 360);
  const cam = shot.position;

  const px = (p: Vec3) => {
    const q = project(p[0], p[1], p[2]);
    return { x: q.x * width, y: q.y * height, depth: q.depth };
  };
  /** Viewbox units per diorama unit at a depth. */
  const scaleAt = (depth: number) => width / (2 * depth * half * aspect);
  const path = (pts: Vec3[]) => {
    const s = pts.map(px);
    return `M${s.map((q) => `${f1(q.x)} ${f1(q.y)}`).join('L')}Z`;
  };
  const ground = (x: number, z: number, rx: number, rz: number, y = 0): Ellipse => {
    const c = px([x, y, z]);
    const e = px([x + rx, y, z]);
    const f = px([x, y, z + rz]);
    return { cx: f1(c.x), cy: f1(c.y), rx: f1(Math.max(1, Math.hypot(e.x - c.x, e.y - c.y))), ry: f1(Math.max(1, Math.abs(f.y - c.y))) };
  };
  const ellipsePath = (e: Ellipse) => `M${f1(e.cx - e.rx)} ${e.cy}a${e.rx} ${e.ry} 0 1 0 ${f1(2 * e.rx)} 0a${e.rx} ${e.ry} 0 1 0 ${f1(-2 * e.rx)} 0Z`;

  /** Places a solid at `at`, turned by `ry`, and draws it: its shadow, then its faces and discs by layer, far to near. */
  const draw = (id: string, solid: Solid, at: Vec3, ry: number, scale = 1): ArtPiece & { depth: number } => {
    const [c, s] = [Math.cos(ry), Math.sin(ry)];
    const turn = (p: Vec3): Vec3 => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
    const world = (p: Vec3): Vec3 => {
      const q = turn(p);
      return [q[0] * scale + at[0], q[1] * scale + at[1], q[2] * scale + at[2]];
    };
    type Item = { layer: number; depth: number; shape: ArtShape };
    const items: Item[] = [];
    for (const face of solid.faces) {
      if (face.pts.length < 3) continue;
      const pts = face.pts.map(world);
      const n = turn(face.n);
      const p0 = pts[0];
      // Facing away from the camera: hidden.
      if (dot(n, [cam[0] - p0[0], cam[1] - p0[1], cam[2] - p0[2]]) <= 0) continue;
      const depth = pts.reduce((sum, p) => sum + px(p).depth, 0) / pts.length;
      items.push({ layer: face.layer, depth, shape: { d: path(pts), tone: toneOf(face.mat, n) } });
    }
    for (const disc of solid.discs) {
      const q = px(world(disc.at));
      const r = disc.r * scale * scaleAt(q.depth);
      items.push({ layer: disc.layer, depth: q.depth, shape: { d: ellipsePath({ cx: f1(q.x), cy: f1(q.y), rx: f1(r), ry: f1(r) }), tone: toneOf(disc.mat, [0.3, 0.7, 0.6]) } });
    }
    for (const pill of solid.pills) {
      const foot = px(world(pill.at));
      const top = px(world([pill.at[0], pill.at[1] + pill.h, pill.at[2]]));
      const r = pill.r * scale * scaleAt(foot.depth);
      const [x0, x1, y0, y1] = [f1(foot.x - r), f1(foot.x + r), f1(top.y + r), f1(foot.y - r * 0.4)];
      items.push({
        layer: pill.layer,
        depth: foot.depth,
        shape: { d: `M${x0} ${y1}V${y0}A${f1(r)} ${f1(r)} 0 0 1 ${x1} ${y0}V${y1}A${f1(r)} ${f1(r * 0.4)} 0 0 1 ${x0} ${y1}Z`, tone: 'person' },
      });
    }
    items.sort((a, b) => a.layer - b.layer || b.depth - a.depth);
    const shadow = ground(at[0], at[2], solid.shadow[0] * scale, solid.shadow[1] * scale);
    return { id, depth: px(at).depth, shapes: [{ d: ellipsePath(shadow), tone: 'shadow' }, ...items.map((i) => i.shape)] };
  };

  const layout = householdLayout(model);
  const pieces: (ArtPiece & { depth: number })[] = [];
  const [hx, , hz] = DIORAMA.house.center;
  if (layout.dwelling) {
    const kind = layout.dwelling;
    if (DWELLINGS[kind].kind === 'gabled') {
      // The stones lie flat, so they go down first, with the ground.
      const stones = STONES.map(([x, z, r]) => ({ d: ellipsePath(ground(hx + x, hz + z, r, r * 0.8)), tone: 'p1' as Tone }));
      pieces.push({ id: 'path', depth: Infinity, shapes: stones });
    }
    pieces.push(draw(`dwelling:${kind}`, dwellingSolid(kind), DIORAMA.house.center, 0));
    pieces.push(draw('tree', treeSolid(), DIORAMA.tree, 0));
  }
  for (const f of layout.figures) pieces.push(draw(f.id, figureSolid(f.height), f.position, f.rotationY));
  for (const p of layout.props) pieces.push(draw(p.id, propSolid(p.kind), p.position, p.rotationY, p.kind === 'car' ? 1 : PROP_SCALE));
  pieces.sort((a, b) => b.depth - a.depth);

  // The plinth: a lathe-turned drum. Its top, the band of side toward the camera, the inlay and the shadow under it.
  const R = DIORAMA.plinth.radius;
  const below = -DIORAMA.plinth.height;
  const steps = 72;
  const angles = Array.from({ length: steps }, (_, i) => (i / steps) * Math.PI * 2);
  const rim = (r: number, y: number) => angles.map((a): Vec3 => [Math.cos(a) * r, y, Math.sin(a) * r]);
  // The visible side: the run of angles whose outward normal faces the camera, from its first angle on.
  const facing = angles.map((a) => Math.cos(a) * (cam[0] - Math.cos(a) * R) + Math.sin(a) * (cam[2] - Math.sin(a) * R) > 0);
  const start = facing.findIndex((v, i) => v && !facing[(i - 1 + steps) % steps]);
  const run: number[] = [];
  for (let k = 0; k < steps && start >= 0; k++) {
    const i = (start + k) % steps;
    if (!facing[i]) break;
    run.push(i);
  }
  const top = rim(R, 0);
  const bottom = rim(R, below);
  const side = run.length ? path([...run.map((i) => top[i]), ...run.slice().reverse().map((i) => bottom[i])]) : '';
  const center = px([0, 0, 0]);
  const plaque = px(PLAQUE);

  const pulseAt = lastAdded ? piecePosition(layout, lastAdded) : null;
  const pulseR = lastAdded?.startsWith('dwelling:') ? 0.75 : lastAdded === 'state' ? 0.35 : 0.27;

  return {
    width,
    height: f1(height),
    plinth: {
      top: path(top),
      side,
      ring: path(rim(R - 0.105, 0.001)),
      shadow: ground(0, 0.1, R * 1.2, R * 1.05, below),
    },
    halo: { cx: f1(center.x), cy: f1(center.y - height * 0.08), rx: f1(width * 0.46), ry: f1(height * 0.42) },
    pieces: pieces.map(({ id, shapes }) => ({ id, shapes })),
    plaque: { x: Math.round((plaque.x / width) * 1000) / 10, y: Math.round((plaque.y / height) * 1000) / 10 },
    pulse: pulseAt ? ground(pulseAt[0], pulseAt[2], pulseR, pulseR) : null,
  };
}

/** Where the state's plaque sits in a build-view box of `aspect`, as a share of the box (0..100). */
export function plaqueSpot(aspect: number): { x: number; y: number } {
  const q = householdProjector(householdShot('build', aspect), aspect)(...PLAQUE);
  return { x: Math.round(q.x * 1000) / 10, y: Math.round(q.y * 1000) / 10 };
}
