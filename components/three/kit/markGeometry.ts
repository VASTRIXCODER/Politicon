import { BufferGeometry, ExtrudeGeometry, type Shape } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MARK_BOUNDS, MARK_PATHS, MARK_VIEWBOX } from '@/lib/brand/mark';

/*
 * The Aperture Dome mark as solid geometry, built from the same SVG paths as
 * the logo (lib/brand/mark.ts): SVGLoader reads the path data, ShapePath
 * turns it into shapes, and ExtrudeGeometry gives them depth and a bevel
 * that catches the rim light.
 *
 * The result is one unit wide, centred on the origin (in depth too) and
 * facing +z.
 */

export interface MarkGeometryOptions {
  /** Extrusion depth, in mark units (the mark is 50 units wide). */
  depth?: number;
  bevel?: number;
  curveSegments?: number;
  bevelSegments?: number;
}

export interface MarkGeometry {
  /** Dome blades, lantern, colonnade and plinth, merged into one solid. */
  shell: BufferGeometry;
  /** The lens of light at the iris centre. */
  aperture: BufferGeometry;
  /** Where the lens sits, in the returned geometry's space. */
  apertureCenter: [number, number];
}

function shapesFrom(d: string): Shape[] {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}"><path d="${d}"/></svg>`;
  return new SVGLoader().parse(svg).paths.flatMap((p) => p.toShapes());
}

function extrude(shapes: Shape[], depth: number, bevel: number, curveSegments: number, bevelSegments: number) {
  return new ExtrudeGeometry(shapes, {
    depth,
    curveSegments,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel * 1.6,
    bevelSize: bevel,
    // Bevel inward, so the silhouette (and its 2.2-unit gaps) stays true to the logo.
    bevelOffset: -bevel,
    bevelSegments,
  });
}

/** Builds the mark's geometry. The caller owns (and disposes) what it returns. */
export function buildMarkGeometry({ depth = 5, bevel = 0.4, curveSegments = 24, bevelSegments = 4 }: MarkGeometryOptions = {}): MarkGeometry {
  const pieces = [
    extrude(shapesFrom(MARK_PATHS.dome), depth, bevel, curveSegments, bevelSegments),
    extrude(shapesFrom(MARK_PATHS.base), depth, bevel, Math.max(4, curveSegments / 4), bevelSegments),
  ];
  const merged = mergeGeometries(pieces) ?? pieces[0].clone();
  pieces.forEach((p) => p.dispose());
  // The lens is thinner and set back inside the iris.
  const lens = extrude(shapesFrom(MARK_PATHS.aperture), depth * 0.45, bevel * 0.75, curveSegments, bevelSegments);

  const cx = MARK_BOUNDS.x + MARK_BOUNDS.width / 2;
  const cy = MARK_BOUNDS.y + MARK_BOUNDS.height / 2;
  const scale = 1 / MARK_BOUNDS.width;
  // SVG y points down. Turning half a revolution about x flips y (and z)
  // without mirroring, so faces keep their winding.
  for (const [g, z] of [
    [merged, depth / 2],
    [lens, depth * 0.225],
  ] as const) {
    g.translate(-cx, -cy, -z);
    g.rotateX(Math.PI);
    g.scale(scale, scale, scale);
  }
  // Smooth across the bevel's segments, crisp where faces meet at an edge.
  const shell = toCreasedNormals(merged, Math.PI / 5);
  const aperture = toCreasedNormals(lens, Math.PI / 5);
  if (shell !== merged) merged.dispose();
  if (aperture !== lens) lens.dispose();

  // The lens centre, from the path's own bounds.
  aperture.computeBoundingBox();
  const box = aperture.boundingBox!;
  return {
    shell,
    aperture,
    apertureCenter: [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2],
  };
}
