import { TERRAIN_VIEW, TERRAIN_WORLD, terrainLayout, terrainViewBox, type TerrainCell } from '@/lib/transmission';
import { PosterSvg, ShadowDef, SolidBox, TONE_FILL, TONE_STROKE, boxFaces, projector, r1, S } from '@/components/impact/posters/draw';

/*
 * The spending terrain as a server-rendered drawing (the SpendingTerrain
 * scene's poster): the same world and angle (lib/transmission TERRAIN_WORLD,
 * TERRAIN_VIEW, terrainLayout), flattened. The slab and one tile per
 * spending category, drawn back to front, each as tall as its monthly
 * amount, teal where it saves the user money and amber where it costs more
 * (the same hue whatever the size: height carries the size), porcelain at
 * $0. Decorative (the page's heatmap prints every figure).
 */

export interface TerrainPosterProps {
  cells: readonly TerrainCell[];
  className?: string;
  /** Prefix for the drawing's gradient ids (only needed with two of these on one page). */
  id?: string;
}

const T = TERRAIN_WORLD;

export default function TerrainPoster({ cells, className, id = 'terrain' }: TerrainPosterProps) {
  const layout = terrainLayout(cells);
  const { at, depth, width, height } = projector(terrainViewBox(layout), TERRAIN_VIEW);
  const half = T.tile / 2;
  const tiles = [...layout.tiles].sort((a, b) => depth([a.x, 0, a.z]) - depth([b.x, 0, b.z]));
  const [cx, cy] = at([0, -T.slab.thickness, 0]);

  return (
    <PosterSvg width={width} height={height} className={className}>
      <ShadowDef id={`${id}-shadow`} />
      <ellipse cx={r1(cx)} cy={r1(cy + 0.05 * S)} rx={r1((layout.halfX + layout.halfZ) * 0.95 * S)} ry={r1((layout.halfX + layout.halfZ) * 0.42 * S)} fill={`url(#${id}-shadow)`} />
      <SolidBox faces={boxFaces(at, -layout.halfX, layout.halfX, -T.slab.thickness, 0, -layout.halfZ, layout.halfZ)} fill="fill-raised" edge="stroke-fg/10" />
      {tiles.map((t) => (
        <SolidBox
          key={t.id}
          faces={boxFaces(at, t.x - half, t.x + half, 0, t.height, t.z - half, t.z + half)}
          fill={t.tone === 'neutral' ? 'fill-porcelain' : TONE_FILL[t.tone]}
          // One hue per direction, as the scene draws it; porcelain dimmed by night, as the scene's is.
          opacity={t.tone === 'neutral' ? 0.72 : 0.9}
          edge={t.tone === 'neutral' ? 'stroke-fg/15' : TONE_STROKE[t.tone]}
        />
      ))}
    </PosterSvg>
  );
}
