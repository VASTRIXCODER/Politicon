import { HERO_VIEW, HERO_WORLD, heroInEffect, heroLayout, heroStreams, heroViewBox } from '@/lib/transmission';
import { PlinthArt, PosterSvg, ShadowDef, SheetArt, SolidBox, TONE_FILL, TONE_STROKE, boxFaces, line, projector, smooth, r1, S } from '@/components/impact/posters/draw';

/*
 * The detail hero ("The Transmission") as a server-rendered drawing: the
 * poster its SceneView shows before (and, without 3D, instead of) the WebGL
 * scene. The same world through the same angle (lib/transmission
 * HERO_WORLD, HERO_VIEW, heroLayout, heroStreams), flattened: the plinth,
 * the glass bill sheet (its gold seal only for a verified record), the
 * column beside it measured from its zero shelf (teal standing on the shelf
 * at the foot and rising; amber hanging below a shelf raised to the top of
 * the scale's reach, clear of the plinth; as tall as the dollars), the staff
 * that holds the shelf with its marks, and the light on its way as a trail of
 * motes. Decorative (SceneView hides it; the page states the amount).
 */

export interface TransmissionPosterProps {
  netAnnualImpact: number;
  status?: string;
  /** Verified against its official record: only then is the sheet's gold seal drawn. Default false. */
  verified?: boolean;
  className?: string;
  /** Prefix for the drawing's gradient ids (only needed with two of these on one page). */
  id?: string;
}

const C = HERO_WORLD.column;

export default function TransmissionPoster({ netAnnualImpact, status, verified = false, className, id = 'transmission' }: TransmissionPosterProps) {
  const { at, width, height } = projector(heroViewBox(), HERO_VIEW);
  const layout = heroLayout(netAnnualImpact);
  const lit = heroInEffect(status);
  const half = C.width / 2;
  const SH = HERO_WORLD.shelf;
  const th = SH.thickness / 2;
  const box = (x0: number, x1: number, y0: number, y1: number, zHalf: number) => boxFaces(at, x0, x1, y0, y1, C.z - zHalf, C.z + zHalf);
  const foot = Math.max(0.02, C.pedestal);
  const footR = C.width * 0.8;
  const ry = Math.sin(HERO_VIEW.pitch) * S;
  const [fx, fy] = at([C.x, 0, C.z]);
  const [, fty] = at([C.x, foot, C.z]);
  const h = Math.max(0, Math.abs(layout.end - layout.baseline) - C.gap / 2);
  const slab =
    h <= 0
      ? null
      : layout.tone === 'gain'
        ? box(C.x - half, C.x + half, layout.baseline + th, layout.baseline + th + h, half)
        : box(C.x - half, C.x + half, layout.baseline - th - h, layout.baseline - th, half);
  const staffX = C.x + HERO_WORLD.staff.dx;
  const staffTop = layout.tone === 'loss' ? layout.baseline + 0.05 : C.pedestal + C.region;
  const shelf = box(C.x - half - SH.overhang, staffX + 0.025, layout.baseline - th, layout.baseline + th, half + SH.overhang);
  const sheet = HERO_WORLD.sheet;
  const [sx, sy] = at([sheet.position[0], 0, sheet.position[2]]);

  return (
    <PosterSvg width={width} height={height} className={className}>
      <ShadowDef id={`${id}-shadow`} />
      <PlinthArt at={at} top={[0, 0, 0]} radius={HERO_WORLD.plinth.radius} height={HERO_WORLD.plinth.height} pitch={HERO_VIEW.pitch} shadow={`${id}-shadow`} />

      {/* The sheet's soft shadow on the plinth, then the sheet. */}
      <ellipse cx={r1(sx)} cy={r1(sy)} rx={r1(0.46 * S)} ry={r1(0.06 * S)} fill={`url(#${id}-shadow)`} />
      <SheetArt at={at} position={sheet.position} rotationY={sheet.rotationY} scale={sheet.scale} seal={verified} />

      {/* The light on its way, as motes. */}
      <g fill="none" strokeLinecap="round" className={TONE_STROKE[layout.tone]} strokeOpacity={lit ? 0.75 : 0.55}>
        {heroStreams(layout).map((pts, i) => (
          <path key={i} d={smooth(pts.map(at))} strokeWidth={3.2} strokeDasharray="0.1 10" />
        ))}
      </g>

      {/* The column's porcelain foot. */}
      <ellipse cx={r1(fx)} cy={r1(fy)} rx={r1(footR * S)} ry={r1(footR * ry)} className="fill-raised stroke-fg/10" strokeWidth={1} />
      <rect x={r1(fx - footR * S)} y={r1(fty)} width={r1(footR * 2 * S)} height={r1(Math.max(0, fy - fty))} className="fill-raised" />
      <ellipse cx={r1(fx)} cy={r1(fty)} rx={r1(footR * S)} ry={r1(footR * ry)} className="fill-raised stroke-fg/10" strokeWidth={1} />

      {slab && (
        <SolidBox faces={slab} fill={TONE_FILL[layout.tone]} opacity={lit ? 0.92 : 0.82} edge={layout.tone === 'gain' ? 'stroke-gain-fill' : 'stroke-loss-fill'} />
      )}
      {/* The zero shelf, reaching to the staff that holds it. */}
      <SolidBox faces={shelf} fill="fill-raised" edge="stroke-primary/50" />

      {/* The staff, its zero mark (the shelf) and a mark per step. */}
      <g fill="none" strokeLinecap="round">
        <path d={line([at([staffX, 0, C.z]), at([staffX, staffTop, C.z])])} className="stroke-muted/60" strokeWidth={2} />
        {[layout.baseline, ...layout.ticks].map((y, i) => {
          const t = HERO_WORLD.staff.tick * (i === 0 ? 0.8 : 0.5);
          return <path key={i} d={line([at([staffX - t, y, C.z]), at([staffX + t, y, C.z])])} className={i === 0 ? 'stroke-muted' : 'stroke-muted/80'} strokeWidth={i === 0 ? 2 : 1.5} />;
        })}
      </g>
    </PosterSvg>
  );
}
