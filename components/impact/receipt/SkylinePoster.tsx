import {
  SKYLINE_WORLD,
  projectSkyline,
  reachOf,
  skylineFrame,
  skylineLayout,
  type SkylineLayout,
  type SkylineLot,
  type SkylineReach,
  type SkylineTower,
  type Vec3,
} from '@/lib/skyline';
import { cn } from '@/lib/utils';

/*
 * "The Skyline" as a server-rendered vector drawing: what its SceneView
 * shows before (and, without 3D, instead of) the glass model. Drawn from
 * the same layout (lib/skyline skylineLayout: one linear scale, the reach of
 * every horizon) and the same angle (projectSkyline, the scene's yaw and
 * pitch flattened), framed as the scene's camera frames it, so the hand-off
 * is a cross-fade between two pictures of one model: the porcelain foot
 * with its numbered plaques, amber costs hanging into the glass well, the
 * paper street with its violet $0 line, teal gains rising from it, $0
 * tiles and empty lots.
 *
 * No hooks and no handlers, so it renders on the server; the page passes
 * the focused tower and it lights that one and dims the rest, as the scene
 * does. Decorative (SceneView hides it from assistive tech; the receipt and
 * the readout state every figure).
 */

export interface SkylinePosterProps {
  towers: readonly SkylineTower[];
  /** The scale's reach over every horizon (lib/skyline skylineReach); default this horizon's own. */
  reach?: SkylineReach;
  focus?: string | null;
  className?: string;
}

const W = SKYLINE_WORLD;
/** Drawing units per world unit. */
const S = 200;

type Pt = [number, number];

const path = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
const line = (a: Pt, b: Pt) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

function projection(layout: SkylineLayout) {
  const f = skylineFrame(layout);
  const width = f.halfW * 2 * S;
  const height = f.halfH * 2 * S;
  const at = (v: Vec3): Pt => {
    const [x, y] = projectSkyline(v);
    return [(x - f.cx + f.halfW) * S, (f.cy - y + f.halfH) * S];
  };
  const depth = (v: Vec3) => projectSkyline(v)[2];
  return { at, depth, width, height };
}

type At = (v: Vec3) => Pt;

/** The faces the composed view sees of an axis-aligned box: front (+z), right (+x) and top. */
function faces(at: At, b: Box) {
  return {
    front: [at([b.x0, b.y0, b.z1]), at([b.x1, b.y0, b.z1]), at([b.x1, b.y1, b.z1]), at([b.x0, b.y1, b.z1])],
    right: [at([b.x1, b.y0, b.z1]), at([b.x1, b.y0, b.z0]), at([b.x1, b.y1, b.z0]), at([b.x1, b.y1, b.z1])],
    top: [at([b.x0, b.y1, b.z1]), at([b.x1, b.y1, b.z1]), at([b.x1, b.y1, b.z0]), at([b.x0, b.y1, b.z0])],
  };
}

function Solid({ at, box, fill, edge, top = true, shade = 0.16 }: { at: At; box: Box; fill: string; edge?: string; top?: boolean; shade?: number }) {
  const f = faces(at, box);
  return (
    <g>
      <path d={path(f.right)} className={fill} />
      <path d={path(f.right)} fill="#000" fillOpacity={shade} />
      {top && <path d={path(f.top)} className={fill} />}
      {top && <path d={path(f.top)} fill="#fff" fillOpacity={0.3} />}
      <path d={path(f.front)} className={fill} />
      {edge && (
        <>
          <path d={path(f.front)} className={cn('fill-none', edge)} strokeWidth={1} />
          <path d={path(f.right)} className={cn('fill-none', edge)} strokeWidth={0.75} strokeOpacity={0.6} />
        </>
      )}
    </g>
  );
}

const lotBox = (lot: SkylineLot, y0: number, y1: number): Box => ({
  x0: lot.x - W.width / 2,
  x1: lot.x + W.width / 2,
  y0,
  y1,
  z0: lot.z - W.width / 2,
  z1: lot.z + W.width / 2,
});

// Nearly solid, as the scene's glass is: the direction's own hue, never washed toward the night behind it.
const TONE = {
  gain: { fill: 'fill-gain-fill/85', lit: 'fill-gain-fill', edge: 'stroke-gain-fill', floor: 'stroke-gain' },
  loss: { fill: 'fill-loss-fill/85', lit: 'fill-loss-fill', edge: 'stroke-loss-fill', floor: 'stroke-loss' },
} as const;

function Tower({ at, lot, floor, focus }: { at: At; lot: SkylineLot; floor: number; focus: string | null }) {
  const on = focus === lot.id;
  const dim = focus !== null && !on;
  if (lot.dir === null) {
    // An empty lot: its footprint as a dashed violet hairline on the street.
    const b = lotBox(lot, 0.001, 0.001);
    return <path d={path(faces(at, b).top)} className="fill-none stroke-primary" strokeWidth={1.2} strokeDasharray="5 4" opacity={dim ? 0.35 : 0.75} />;
  }
  if (lot.dir === 0) {
    return (
      <g opacity={dim ? 0.45 : 1}>
        {/* $0: porcelain, a true neutral, as the scene draws it. */}
        <Solid at={at} box={lotBox(lot, 0, W.flat)} fill="fill-porcelain/70" edge={on ? 'stroke-primary' : 'stroke-fg/30'} />
      </g>
    );
  }
  const tone = TONE[lot.dir > 0 ? 'gain' : 'loss'];
  const b = lotBox(lot, lot.y0, lot.y1);
  // Floor lines on the two faces in view, counted from the street both ways.
  const floors: number[] = [];
  if (floor > 0) {
    for (let k = 1; k * floor < lot.height - 1e-6 && k < 400; k++) floors.push(lot.dir > 0 ? k * floor : -W.street - k * floor);
  }
  return (
    <g opacity={dim ? 0.45 : 1}>
      <Solid at={at} box={b} fill={on ? tone.lit : tone.fill} edge={on ? 'stroke-primary' : tone.edge} top={lot.dir > 0} />
      {floors.map((y) => (
        <g key={y} className={tone.floor} strokeOpacity={0.55} strokeWidth={0.8}>
          <path d={line(at([b.x0, y, b.z1]), at([b.x1, y, b.z1]))} />
          <path d={line(at([b.x1, y, b.z1]), at([b.x1, y, b.z0]))} />
        </g>
      ))}
    </g>
  );
}

function Tag({ at, lot, y, z }: { at: At; lot: SkylineLot; y: number; z: number }) {
  // The plaque's plane (z = const) mapped onto the drawing: an affine transform from plaque units (y down).
  const [ex, ey] = at([lot.x, y, z]);
  const [px, py] = at([lot.x + 1, y, z]);
  const [qx, qy] = at([lot.x, y - 1, z]);
  const m = [px - ex, py - ey, qx - ex, qy - ey, ex, ey].map((v) => v.toFixed(2)).join(' ');
  const w = W.tag.width;
  const h = W.tag.height;
  return (
    <g transform={`matrix(${m})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h * 0.28} className="fill-raised stroke-fg/25" strokeWidth={0.004} />
      <text
        x={0}
        y={0}
        dy="0.36em"
        textAnchor="middle"
        className="fill-ink font-mono-data"
        style={{ fontSize: h * 0.6, fontWeight: 600 }}
      >
        {String(lot.number).padStart(2, '0')}
      </text>
    </g>
  );
}

export default function SkylinePoster({ towers, reach, focus = null, className }: SkylinePosterProps) {
  const layout = skylineLayout(towers, reach ?? reachOf(towers));
  const { at, depth, width, height } = projection(layout);
  const floor = layout.floorDollars * layout.unitsPerDollar;
  const { halfX, halfZ, bottom, well } = layout;

  const foot: Box = { x0: -halfX - 0.015, x1: halfX + 0.015, y0: bottom, y1: bottom + W.foot, z0: -halfZ - 0.015, z1: halfZ + 0.015 };
  const street: Box = { x0: -halfX, x1: halfX, y0: -W.street, y1: 0, z0: -halfZ, z1: halfZ };
  const glass: Box | null = well ? { x0: -halfX + 0.01, x1: halfX - 0.01, y0: well.y1, y1: well.y0, z0: -halfZ + 0.01, z1: halfZ - 0.01 } : null;

  // Painter's order: far first.
  const byDepth = (a: SkylineLot, b: SkylineLot) => depth([a.x, 0, a.z]) - depth([b.x, 0, b.z]);
  const hanging = layout.lots.filter((l) => l.dir === -1).sort(byDepth);
  const onStreet = layout.lots.filter((l) => l.dir !== -1).sort(byDepth);
  const shadow = (k: number) => {
    const x = (halfX + 0.12) * k;
    const z = (halfZ + 0.16) * k;
    return [at([-x, bottom, z + 0.04]), at([x, bottom, z + 0.04]), at([x, bottom, -z]), at([-x, bottom, -z])];
  };
  const inlayL = at([-halfX + 0.05, 0.001, halfZ - 0.06]);
  const inlayR = at([halfX - 0.05, 0.001, halfZ - 0.06]);

  return (
    <svg
      viewBox={`0 0 ${width.toFixed(1)} ${height.toFixed(1)}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn('h-full w-full', className)}
      aria-hidden="true"
      focusable="false"
    >
      {/* A soft shadow on the page under the plinth: a few nested footprints, densest at the middle. */}
      <g className="fill-ink">
        {[1, 0.86, 0.72].map((k) => (
          <path key={k} d={path(shadow(k))} fillOpacity={0.045} />
        ))}
      </g>
      <Solid at={at} box={foot} fill="fill-raised" shade={0.12} />
      {layout.tags && (
        <g className="max-sm:hidden">
          {layout.lots.map((lot) => (
            <Tag key={lot.id} at={at} lot={lot} y={bottom + W.foot / 2} z={halfZ + 0.016} />
          ))}
        </g>
      )}
      {hanging.map((lot) => (
        <Tower key={lot.id} at={at} lot={lot} floor={floor} focus={focus} />
      ))}
      {glass && (
        <g>
          {/* Clear glass, untinted, so the amber in it keeps its hue (as in the scene). */}
          <path d={path(faces(at, glass).right)} className="fill-fg/[0.05] stroke-fg/25" strokeWidth={0.75} />
          <path d={path(faces(at, glass).front)} className="fill-fg/[0.03] stroke-fg/25" strokeWidth={0.75} />
        </g>
      )}
      <Solid at={at} box={street} fill="fill-surface" shade={0.08} edge="stroke-fg/15" />
      <path d={line(inlayL, inlayR)} className="stroke-primary" strokeWidth={1.4} strokeLinecap="round" />
      {onStreet.map((lot) => (
        <Tower key={lot.id} at={at} lot={lot} floor={floor} focus={focus} />
      ))}
    </svg>
  );
}
