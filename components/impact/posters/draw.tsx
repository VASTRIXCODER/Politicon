import type { ReactNode } from 'react';
import { frameOf, projectView, type SceneAngle, type Vec3, type ViewBox } from '@/lib/transmission';
import { cn } from '@/lib/utils';

/*
 * Drawing helpers shared by the Transmission's server posters: the scene's
 * composed angle flattened into an SVG (the same frame as the scene's camera,
 * lib/transmission frameOf), and the few pieces several posters draw (the
 * paper plinth, the glass bill sheet). No hooks and no handlers: everything
 * here renders on the server, the same way every time.
 */

/** Drawing units per world unit. */
export const S = 200;

export type Pt = [number, number];

/** A drawing coordinate to a tenth of a unit (compact markup, the same on every render). */
export const r1 = (v: number) => Math.round(v * 10) / 10;
export type At = (v: Vec3) => Pt;

export interface Projector {
  at: At;
  /** View-space depth of a world point (larger is nearer the viewer), for drawing back to front. */
  depth: (v: Vec3) => number;
  width: number;
  height: number;
}

export function projector(box: ViewBox, view: SceneAngle): Projector {
  const f = frameOf(box, view);
  const halfW = f.halfW * f.grow;
  const halfH = f.halfH * f.grow;
  return {
    at: (v) => {
      const [x, y] = projectView(v, view);
      return [r1((x - f.cx + halfW) * S), r1((f.cy - y + halfH) * S)];
    },
    depth: (v) => projectView(v, view)[2],
    width: halfW * 2 * S,
    height: halfH * 2 * S,
  };
}

const xy = ([x, y]: Pt) => `${x.toFixed(1)} ${y.toFixed(1)}`;

/** A closed polygon. */
export const path = (pts: readonly Pt[]) => `M${pts.map(xy).join('L')}Z`;
/** An open polyline. */
export const line = (pts: readonly Pt[]) => `M${pts.map(xy).join('L')}`;

/** A smooth open curve through the points (Catmull-Rom as cubic Béziers). */
export function smooth(pts: readonly Pt[]): string {
  if (pts.length < 3) return line(pts);
  let d = `M${xy(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${xy(c1)} ${xy(c2)} ${xy(p2)}`;
  }
  return d;
}

/** The poster's root: a decorative SVG that fills its SceneView box. */
export function PosterSvg({ width, height, className, children }: { width: number; height: number; className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${width.toFixed(0)} ${height.toFixed(0)}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn('absolute inset-0 h-full w-full', className)}
      aria-hidden="true"
      focusable="false"
      data-decorative=""
    >
      {children}
    </svg>
  );
}

/** A soft round shadow gradient (one per poster, by id). */
export function ShadowDef({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={id}>
        <stop offset="0" stopColor="#000" stopOpacity="0.2" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/**
 * The kit's paper plinth (components/three/kit/Plinth): its soft shadow, its
 * drum, its top and the violet inlay. `top` is the centre of its top face.
 */
export function PlinthArt({ at, top, radius, height, pitch, shadow }: { at: At; top: Vec3; radius: number; height: number; pitch: number; shadow: string }) {
  const t = at(top);
  const f = at([top[0], top[1] - height, top[2]]);
  const rx = radius * S;
  const ry = radius * Math.sin(pitch) * S;
  const inlay = radius - 0.105;
  return (
    <g>
      <ellipse cx={r1(f[0])} cy={r1(f[1] + ry * 0.35)} rx={r1(rx * 1.4)} ry={r1(ry * 2)} fill={`url(#${shadow})`} />
      <ellipse cx={r1(f[0])} cy={r1(f[1])} rx={r1(rx)} ry={r1(ry)} className="fill-surface" />
      <ellipse cx={r1(f[0])} cy={r1(f[1])} rx={r1(rx)} ry={r1(ry)} fill="#000" fillOpacity={0.07} />
      <rect x={r1(t[0] - rx)} y={r1(t[1])} width={r1(rx * 2)} height={r1(Math.max(0, f[1] - t[1]))} className="fill-surface" />
      <rect x={r1(t[0] - rx)} y={r1(t[1])} width={r1(rx * 2)} height={r1(Math.max(0, f[1] - t[1]))} fill="#000" fillOpacity={0.07} />
      <ellipse cx={r1(t[0])} cy={r1(t[1])} rx={r1(rx)} ry={r1(ry)} className="fill-surface stroke-fg/10" strokeWidth={1} />
      <ellipse cx={r1(t[0])} cy={r1(t[1])} rx={r1(inlay * S)} ry={r1(inlay * Math.sin(pitch) * S)} fill="none" className="stroke-primary/35" strokeWidth={1} />
    </g>
  );
}

/** The kit BillSheet's proportions and its embossed lines ([x, y, width, height] from its top-left). */
const SHEET_W = 0.773;
const SHEET_LINES: [number, number, number, number][] = [
  [0.07, 0.1, 0.46, 0.034],
  [0.07, 0.16, 0.3, 0.018],
  ...Array.from({ length: 9 }, (_, i): [number, number, number, number] => [0.07, 0.25 + i * 0.05, i % 4 === 3 ? 0.42 : 0.63, 0.011]),
];

/**
 * The kit's glass BillSheet, standing, facing +z turned by `rotationY`: a
 * pane of violet glass with its embossed title and text lines and its
 * archive-gold seal (the official record).
 */
export interface SheetArtProps {
  at: At;
  position: Vec3;
  rotationY: number;
  scale: number;
  /** Draw the archive-gold seal: only for a record verified against Congress.gov or Open States. Default true. */
  seal?: boolean;
}

export function SheetArt({ at, position, rotationY, scale, seal: stamped = true }: SheetArtProps) {
  const [px, py, pz] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  // A point on the sheet, from its top-left corner, in sheet units.
  const on = (u: number, v: number): Pt => {
    const du = (u - SHEET_W / 2) * scale;
    const dv = (0.5 - v) * scale;
    return at([px + du * c, py + dv, pz - du * s]);
  };
  const corners = [on(0, 0), on(SHEET_W, 0), on(SHEET_W, 1), on(0, 1)];
  const seal = Array.from({ length: 24 }, (_, i): Pt => {
    const a = (i / 24) * Math.PI * 2;
    return on(SHEET_W - 0.16 + Math.cos(a) * 0.1, 1 - 0.16 + Math.sin(a) * 0.1);
  });
  // The seal's inner ridge.
  const [cx, cy] = on(SHEET_W - 0.16, 1 - 0.16);
  const inner = seal.map(([x, y]): Pt => [cx + (x - cx) * 0.62, cy + (y - cy) * 0.62]);
  return (
    <g>
      <path d={path(corners)} className="fill-raised/60" />
      <path d={path(corners)} className="fill-primary/[0.07] stroke-primary/40" strokeWidth={1.25} strokeLinejoin="round" />
      {/* A sheen down the near edge. */}
      <path d={line([corners[0], corners[3]])} className="stroke-raised" strokeWidth={2} strokeOpacity={0.8} />
      {SHEET_LINES.map(([x, y, w, h], i) => (
        <path key={i} d={path([on(x, y), on(x + w, y), on(x + w, y + h), on(x, y + h)])} className="fill-primary/30" />
      ))}
      {stamped && (
        <>
          <path d={path(seal)} className="fill-gold" />
          <path d={path(inner)} fill="none" className="stroke-raised/70" strokeWidth={1} />
        </>
      )}
    </g>
  );
}

/** The three faces of an axis-aligned box a view from the front right sees: front (+z), right (+x), top. */
export function boxFaces(at: At, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  return {
    front: [at([x0, y0, z1]), at([x1, y0, z1]), at([x1, y1, z1]), at([x0, y1, z1])],
    right: [at([x1, y0, z1]), at([x1, y0, z0]), at([x1, y1, z0]), at([x1, y1, z1])],
    top: [at([x0, y1, z1]), at([x1, y1, z1]), at([x1, y1, z0]), at([x0, y1, z0])],
  };
}

/** Fill classes per tone (static strings, so Tailwind keeps them). */
export const TONE_FILL = { gain: 'fill-gain-fill', loss: 'fill-loss-fill', neutral: 'fill-raised' } as const;
export const TONE_STROKE = { gain: 'stroke-gain-fill', loss: 'stroke-loss-fill', neutral: 'stroke-primary' } as const;

/** A box drawn as its three visible faces in one fill: the right one shaded, the top one lit. */
export function SolidBox({ faces, fill, opacity = 1, edge }: { faces: ReturnType<typeof boxFaces>; fill: string; opacity?: number; edge?: string }) {
  return (
    <g>
      <path d={path(faces.right)} className={fill} fillOpacity={opacity} />
      <path d={path(faces.right)} fill="#000" fillOpacity={0.14} />
      <path d={path(faces.top)} className={fill} fillOpacity={opacity} />
      <path d={path(faces.top)} fill="#fff" fillOpacity={0.3} />
      <path d={path(faces.front)} className={cn(fill, edge)} fillOpacity={opacity} strokeWidth={edge ? 1 : undefined} />
    </g>
  );
}
