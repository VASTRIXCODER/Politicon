/**
 * The poster of the explorer's city (CityPoster.tsx) as plain shapes: the
 * same layout (cityLayout) seen through the same camera (frameCity) the 3D
 * scene opens on, projected to SVG coordinates and ordered back to front.
 * So the poster, which every visitor sees first (and the only picture on
 * devices without 3D), is the scene's first frame drawn in vector.
 *
 * Pure (no React, no DOM, no three.js): tests/bracketCity.test.ts checks it.
 */
import {
  CITY,
  CITY_VIEW,
  cityLayout,
  frameCity,
  labelAnchor,
  plinthOutline,
  projectPoint,
  turn,
  type CityCamera,
  type CityLayout,
  type CityTowerPlacement,
  type ExplorerCityData,
} from '@/components/three/scenes/bracketCityData';
import type { BracketKey, CategoryKey } from '@/lib/explorerData';

type V3 = [number, number, number];

/** The category band at a tower's far end, as in the scene. */
const CAP = 0.024;
const CAP_INSET = 0.008;

export interface PosterFace {
  /** SVG path data. */
  d: string;
  /** Which way the side looks, for shading: toward the light, or away. */
  tone: 'lit' | 'shade';
}

export interface PosterTower {
  bracket: BracketKey;
  category: CategoryKey;
  gain: boolean;
  faces: PosterFace[];
  /** The category band: its visible faces. */
  band: string;
  /** A gain's roof (glass), drawn over the band's ring. */
  roof?: string;
  /** Floor lines across the visible sides. */
  floors: string;
  /** Soft shadow on the street (gains only). */
  shadow?: { cx: number; cy: number; rx: number; ry: number };
}

export interface PosterDistrict {
  bracket: BracketKey;
  /** Left to right (BRACKETS order). */
  index: number;
  label: string;
  short: string;
  /** The lot's outline on the street. */
  lot: string;
  /** The violet pool of the lamp, when this bracket is picked. */
  pool: { cx: number; cy: number; rx: number; ry: number };
  label_at: { x: number; y: number };
  gains: PosterTower[];
  costs: PosterTower[];
  /** Back to front: districts further from the camera draw first. */
  depth: number;
}

export interface PosterShapes {
  width: number;
  height: number;
  /** Plinth parts, each a closed path. */
  shadow: { cx: number; cy: number; rx: number; ry: number };
  foot: string;
  acrylic: string;
  /** The acrylic's lit top edge along the front. */
  acrylicEdge: string;
  paperEdge: string;
  paperTop: string;
  inlay: string;
  districts: PosterDistrict[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function projector(cam: CityCamera, width: number, height: number) {
  return (p: V3): [number, number, number] => {
    const [x, y, z] = projectPoint(cam, p);
    return [((x + 1) / 2) * width, ((1 - y) / 2) * height, z];
  };
}

const path = (pts: [number, number][]) =>
  pts.length ? `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z` : '';
const line = (a: [number, number], b: [number, number]) => `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`;

/** Whether a vertical face with outward normal (nx, nz) at (x, z) faces the camera. */
const facing = (cam: CityCamera, x: number, z: number, nx: number, nz: number) =>
  nx * (cam.position[0] - x) + nz * (cam.position[2] - z) > 0;

/** The key light's direction across the ground (from the scene's key, over the right shoulder). */
const KEY: [number, number] = [4 / Math.hypot(4, 5), 5 / Math.hypot(4, 5)];

function towerShapes(t: CityTowerPlacement, cam: CityCamera, at: ReturnType<typeof projector>, unitsPerDollar: number): PosterTower {
  const half = t.width / 2;
  const sides = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ] as const;
  const corner = (lx: number, lz: number, y: number, grow = 0): [number, number] => {
    const [ox, oz] = turn(lx * (half + grow), lz * (half + grow), t.yaw);
    const [sx, sy] = at([t.x + ox, y, t.z + oz]);
    return [sx, sy];
  };
  // Each side as its two corners (local unit coordinates), outward normal.
  const visible = sides
    .map(([nx, nz]) => {
      const [wx, wz] = turn(nx, nz, t.yaw);
      const a: [number, number] = nx !== 0 ? [nx, -nx] : [nz, nz];
      const b: [number, number] = nx !== 0 ? [nx, nx] : [-nz, nz];
      return { a, b, wx, wz, light: wx * KEY[0] + wz * KEY[1] };
    })
    .filter((s) => facing(cam, t.x + s.wx * half, t.z + s.wz * half, s.wx, s.wz));
  const brightest = Math.max(...visible.map((s) => s.light));

  const faces: PosterFace[] = visible.map((s) => ({
    d: path([corner(...s.a, t.y0), corner(...s.b, t.y0), corner(...s.b, t.y1), corner(...s.a, t.y1)]),
    tone: s.light === brightest ? 'lit' : 'shade',
  }));
  const gain = t.dir > 0;
  // A gain's roof, drawn after its band (the glass stands just proud of the band's ring).
  const roof = gain ? path([corner(-1, -1, t.y1), corner(1, -1, t.y1), corner(1, 1, t.y1), corner(-1, 1, t.y1)]) : undefined;

  // The band: slightly proud of the glass, at the far end.
  const capH = Math.min(CAP, t.height * 0.4);
  const [b0, b1] = gain ? [t.y1 - CAP_INSET - capH, t.y1 - CAP_INSET] : [t.y0 + CAP_INSET, t.y0 + CAP_INSET + capH];
  const g = 0.006;
  let band = visible.map((s) => path([corner(...s.a, b0, g), corner(...s.b, b0, g), corner(...s.b, b1, g), corner(...s.a, b1, g)])).join('');
  if (gain) band = path([corner(-1, -1, b1, g), corner(1, -1, b1, g), corner(1, 1, b1, g), corner(-1, 1, b1, g)]) + band;

  // A floor line every CITY.floorDollars, measured from the street, across each visible side.
  const floor = CITY.floorDollars * unitsPerDollar;
  const floors: string[] = [];
  for (let k = 1; k * floor < t.height + CITY.paper; k++) {
    const y = gain ? k * floor : -k * floor;
    if (y <= t.y0 + 0.004 || y >= t.y1 - 0.004) continue;
    for (const s of visible) floors.push(line(corner(...s.a, y), corner(...s.b, y)));
  }

  let shadow: PosterTower['shadow'];
  if (gain) {
    const [cx, cy] = at([t.x - 0.03, 0, t.z - 0.025]);
    const [ex] = at([t.x - 0.03 + t.width * 1.15, 0, t.z - 0.025]);
    const rx = Math.abs(ex - cx);
    shadow = { cx: r1(cx), cy: r1(cy), rx: r1(rx), ry: r1(rx * 0.42) };
  }
  return { bracket: t.bracket, category: t.category, gain, faces, band, roof, floors: floors.join(''), shadow };
}

/** The longest run of outline edges that face the camera (the plinth's visible front), as point indices. */
function frontChain(cam: CityCamera, outline: [number, number][]): number[] {
  const n = outline.length;
  // Signed area: which side of each edge is outside.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = outline[i];
    const [x1, z1] = outline[(i + 1) % n];
    area += x0 * z1 - x1 * z0;
  }
  // Counter-clockwise (positive area): the outward normal of edge (ex, ez) is (ez, −ex).
  const out = area > 0 ? 1 : -1;
  const seen = outline.map((p, i) => {
    const q = outline[(i + 1) % n];
    const ex = q[0] - p[0];
    const ez = q[1] - p[1];
    // Outward normal of the edge.
    const nx = out * ez;
    const nz = out * -ex;
    return facing(cam, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, nx, nz);
  });
  // Start just after a hidden edge so the run doesn't wrap.
  const start = Math.max(0, seen.findIndex((v) => !v));
  let best: number[] = [];
  let run: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (seen[i]) {
      if (!run.length) run.push(i);
      run.push((i + 1) % n);
    } else {
      if (run.length > best.length) best = run;
      run = [];
    }
  }
  return run.length > best.length ? run : best;
}

export interface PosterOptions {
  compact?: boolean;
  /** Width over height of the poster's box. */
  aspect: number;
  /** The SVG's width in user units (its height follows the aspect). */
  width?: number;
}

export function posterShapes(data: ExplorerCityData, { compact = false, aspect, width = 1000 }: PosterOptions): PosterShapes {
  const layout: CityLayout = cityLayout(data, { compact });
  const view = compact ? CITY_VIEW.compact : CITY_VIEW.full;
  const cam = frameCity(layout, view, aspect);
  const height = width / aspect;
  const at = projector(cam, width, height);
  const flat = (p: V3): [number, number] => {
    const [x, y] = at(p);
    return [x, y];
  };
  const pl = layout.plinth;
  const outline = plinthOutline(pl, 64);
  const chain = frontChain(cam, outline).map((i) => outline[i]);
  const wall = (yTop: number, yBottom: number) =>
    path([...chain.map(([x, z]) => flat([x, yTop, z])), ...[...chain].reverse().map(([x, z]) => flat([x, yBottom, z]))]);

  const [scx, scy] = flat([0, pl.bottom, 0.1]);
  const [sex] = flat([layout.footprint.halfWidth * 1.15, pl.bottom, 0.1]);

  const districts: PosterDistrict[] = layout.districts.map((d, i) => {
    const source = data.districts[i];
    const lotCorners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([cx, cz]) => {
      const [ox, oz] = turn((cx * (d.width - 0.04)) / 2, (cz * (d.depth - 0.04)) / 2, d.yaw);
      return flat([d.x + ox, 0, d.z + oz]);
    });
    const [pcx, pcy] = flat([d.x, 0, d.z]);
    const [pex] = flat([d.x + d.width * 0.95, 0, d.z]);
    const prx = Math.abs(pex - pcx);
    const [lx, ly] = flat(labelAnchor(layout, d));
    const mine = layout.towers.filter((t) => t.districtIndex === i && t.dir !== 0);
    const depthOf = (t: CityTowerPlacement) => at([t.x, 0, t.z])[2];
    const shapes = (list: CityTowerPlacement[]) =>
      [...list].sort((a, b) => depthOf(b) - depthOf(a)).map((t) => towerShapes(t, cam, at, layout.unitsPerDollar));
    return {
      bracket: d.bracket,
      index: i,
      label: source?.label ?? d.bracket,
      short: source?.short ?? d.bracket,
      lot: path(lotCorners),
      pool: { cx: r1(pcx), cy: r1(pcy), rx: r1(prx), ry: r1(prx * 0.4) },
      label_at: { x: r1(lx), y: r1(ly) },
      gains: shapes(mine.filter((t) => t.dir > 0)),
      costs: shapes(mine.filter((t) => t.dir < 0)),
      depth: at([d.x, 0, d.z])[2],
    };
  });
  districts.sort((a, b) => b.depth - a.depth);

  // The violet hairline set into the paper along its front edge.
  const inlay: [number, number][] = [];
  for (let k = 0; k <= 48; k++) {
    const a = -pl.span + (2 * pl.span * k) / 48;
    const r = pl.inner + 0.045;
    inlay.push(flat([pl.cx + r * Math.sin(a), 0, pl.cz - r * Math.cos(a)]));
  }

  return {
    width,
    height: r1(height),
    shadow: { cx: r1(scx), cy: r1(scy), rx: r1(Math.abs(sex - scx)), ry: r1(Math.abs(sex - scx) * 0.16) },
    foot: wall(pl.floor, pl.bottom),
    acrylic: wall(-CITY.paper, pl.floor),
    acrylicEdge: chain.length ? `M${chain.map(([x, z]) => flat([x, -CITY.paper - 0.004, z]).map(r1).join(' ')).join('L')}` : '',
    paperEdge: wall(0, -CITY.paper),
    paperTop: path(outline.map(([x, z]) => flat([x, 0, z]))),
    inlay: `M${inlay.map((p) => p.map(r1).join(' ')).join('L')}`,
    districts,
  };
}
