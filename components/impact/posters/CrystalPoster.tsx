import { CRYSTAL_VIEW, CRYSTAL_WORLD, crystalDirection, crystalFacets, crystalLayout, crystalViewBox, projectView, type CrystalAxis, type Vec3 } from '@/lib/transmission';
import { PlinthArt, PosterSvg, ShadowDef, line, path, projector, r1, S } from '@/components/impact/posters/draw';

/*
 * The vulnerability crystal as a server-rendered drawing (the
 * VulnerabilityCrystal scene's poster): the same world and angle
 * (lib/transmission CRYSTAL_WORLD, CRYSTAL_VIEW, crystalLayout,
 * crystalFacets), flattened. The plinth, the guide plane with its rings at
 * 25, 50, 75 and 100 and its six axes, the faceted violet gem drawn back to
 * front with its facets lit from the upper left, and a bead at each score.
 * Decorative (the page's caption names the axes and their scores).
 */

export interface CrystalPosterProps {
  axes: readonly CrystalAxis[];
  className?: string;
  /** Prefix for the drawing's gradient ids (only needed with two of these on one page). */
  id?: string;
}

const W = CRYSTAL_WORLD;
/** Where the poster's light comes from (upper left, in front). */
const LIGHT: Vec3 = [-0.42, 0.78, 0.46];

export default function CrystalPoster({ axes, className, id = 'crystal' }: CrystalPosterProps) {
  const { at, depth, width, height } = projector(crystalViewBox(), CRYSTAL_VIEW);
  const n = axes.length || 6;
  const layout = crystalLayout(axes);
  const ring = (r: number) => Array.from({ length: n }, (_, i) => {
    const [x, z] = crystalDirection(i, n);
    return at([x * r * W.radius, 0, z * r * W.radius]);
  });
  const facets = crystalFacets(layout)
    .map((f) => {
      const [a, b, c] = f.points;
      const centroid: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      // Facing the viewer: its normal points toward +z in view space.
      const facing = projectView(f.normal, CRYSTAL_VIEW)[2] > 0;
      const lit = Math.max(0, f.normal[0] * LIGHT[0] + f.normal[1] * LIGHT[1] + f.normal[2] * LIGHT[2]);
      return { d: path(f.points.map(at)), z: depth(centroid), opacity: facing ? 0.14 + lit * 0.32 : 0.07 };
    })
    .sort((x, y) => x.z - y.z);
  const [sx, sy] = at([0, W.plinth.y, 0]);

  return (
    <PosterSvg width={width} height={height} className={className}>
      <ShadowDef id={`${id}-shadow`} />
      <PlinthArt at={at} top={[0, W.plinth.y, 0]} radius={W.plinth.radius} height={W.plinth.height} pitch={CRYSTAL_VIEW.pitch} shadow={`${id}-shadow`} />
      {/* The crystal's shadow on the plinth. */}
      <ellipse cx={r1(sx)} cy={r1(sy)} rx={r1(0.7 * S)} ry={r1(0.7 * Math.sin(CRYSTAL_VIEW.pitch) * S)} fill={`url(#${id}-shadow)`} />

      {/* The guide plane: its paper, its rings and its axes. */}
      <path d={path(ring(1))} className="fill-raised/60" />
      <path d={path(ring(1))} className="fill-primary/[0.05]" />
      <g fill="none" className="stroke-primary/45" strokeWidth={1}>
        {W.rings.map((r) => (
          <path key={r} d={path(ring(r))} strokeDasharray={r === 1 ? undefined : '3 4'} />
        ))}
        {ring(1).map((p, i) => (
          <path key={i} d={line([at([0, 0, 0]), p])} />
        ))}
      </g>

      {/* The gem, back to front. */}
      <g className="fill-primary stroke-primary/50" strokeWidth={0.75} strokeLinejoin="round">
        {facets.map((f, i) => (
          <path key={i} d={f.d} fillOpacity={f.opacity} />
        ))}
      </g>
      {axes.length > 0 &&
        layout.girdle.map(([x, z], i) => {
          const [cx, cy] = at([x, 0, z]);
          return <circle key={i} cx={r1(cx)} cy={r1(cy)} r={r1(0.03 * S)} className="fill-primary stroke-raised" strokeWidth={1.5} />;
        })}
    </PosterSvg>
  );
}
