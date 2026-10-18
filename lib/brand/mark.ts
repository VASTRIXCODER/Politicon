/**
 * The Politicon mark, "the Aperture Dome": a Capitol dome whose shell is a
 * six-blade camera iris, so it reads both as the seat of law and as a lens
 * ("seeing policy clearly"). The opening at its heart is the light.
 *
 * Two drawings share the silhouette:
 *
 *   MARK_PATHS        the full mark, for 36px and up: <Logo size="lg">, the
 *                     Open Graph image and the extruded 3D mark (SVGLoader →
 *                     ExtrudeGeometry). Filled shapes on a 64×64 grid, wound
 *                     clockwise, with no holes and no overlaps, so they
 *                     extrude as separate solids.
 *   MARK_PATHS_SMALL  for 32px and below (the favicon, app icons, <Logo>
 *                     sm/md): the iris's 2.2-unit gaps vanish under a pixel
 *                     there, so the dome is one solid with a hexagonal
 *                     aperture knocked out, on three taller columns, with
 *                     every gap at least 3 units. Its dome has a hole: draw
 *                     it with fill-rule="evenodd".
 *
 * Construction of the full mark (to regenerate or adjust): the dome is the
 * upper half of an ellipse centred at (32, 38.5) with radii 19×23. Each blade
 * is bounded by two neighbouring circles of radius 22 whose centres sit 15.5
 * from the iris centre (32, 27) at 60° steps, offset ±1.1 so every gap in the
 * mark is 2.2 wide. The aperture is the region inside all six circles, inset
 * by the same half-gap. The lantern rises from the top blade, joined to it
 * along the dome's own curve; the five columns (4.8 wide, 10.8 tall) and the
 * plinth keep the 2.2 rhythm.
 */

export const MARK_VIEWBOX = '0 0 64 64';

/** The full mark's drawn area inside the viewBox (for centring in images and 3D). */
export const MARK_BOUNDS = { x: 7, y: 7.4, width: 50, height: 49.1 } as const;

/** The small mark's drawn area inside the viewBox. */
export const MARK_SMALL_BOUNDS = { x: 9, y: 7.4, width: 46, height: 50.1 } as const;

const DOME = [
  // Iris blades, clockwise from the right shoulder.
  'M50.15 31.7A20.9 20.9 0 0 1 35.12 33.96A23.1 23.1 0 0 0 45.59 22.42A19 23 0 0 1 50.15 31.7Z',
  'M43.93 20.6A20.9 20.9 0 0 1 39.59 27.77A23.1 23.1 0 0 0 36.97 16.3A19 23 0 0 1 43.93 20.6Z',
  // The top blade, with the lantern rising from it.
  'M34.04 15.63A20.9 20.9 0 0 1 36.46 20.82A23.1 23.1 0 0 0 24.58 17.33A19 23 0 0 1 30 15.63V9.4A2 2 0 0 1 34 9.4V15.63Z',
  'M20.96 19.78A20.9 20.9 0 0 1 28.88 20.04A23.1 23.1 0 0 0 16.73 38.5H13A19 23 0 0 1 20.96 19.78Z',
  'M18.94 38.5A20.9 20.9 0 0 1 24.41 26.23A23.1 23.1 0 0 0 27.47 38.5H18.94Z',
  'M30.05 38.5A20.9 20.9 0 0 1 27.54 33.18A23.1 23.1 0 0 0 50.63 33.96A19 23 0 0 1 51 38.5H30.05Z',
].join('');

// The lens of light at the centre of the iris.
const APERTURE =
  'M32 32.99A20.9 20.9 0 0 1 26.82 29.99A20.9 20.9 0 0 1 26.82 24.01A20.9 20.9 0 0 1 32 21.01A20.9 20.9 0 0 1 37.18 24.01A20.9 20.9 0 0 1 37.18 29.99A20.9 20.9 0 0 1 32 32.99Z';

const BASE = [
  // Colonnade: five columns, taller than wide.
  'M15.6 40.7H20.4V51.5H15.6Z',
  'M22.6 40.7H27.4V51.5H22.6Z',
  'M29.6 40.7H34.4V51.5H29.6Z',
  'M36.6 40.7H41.4V51.5H36.6Z',
  'M43.6 40.7H48.4V51.5H43.6Z',
  // Plinth.
  'M7 53.7H57V56.5H7Z',
].join('');

/**
 * SVG path data for the mark's three parts. Single-colour renderings draw
 * `dome` and `base` and leave the aperture open; colour renderings also fill
 * `aperture` with light.
 */
export const MARK_PATHS: { readonly dome: string; readonly aperture: string; readonly base: string } = {
  dome: DOME,
  aperture: APERTURE,
  base: BASE,
};

// Small: one solid dome (the lantern joined along the curve) with a pointed
// hexagon knocked out of it, wound the other way.
const SMALL_DOME =
  'M13 38.5A19 23 0 0 1 29 15.79V10.4A3 3 0 0 1 35 10.4V15.79A19 23 0 0 1 51 38.5Z' +
  'M32 20.4L26.28 23.7V30.3L32 33.6L37.72 30.3V23.7Z';

// The lens inside the knocked-out hexagon, with a ring of background around it.
const SMALL_APERTURE = 'M32 22.5L28.1 24.75V29.25L32 31.5L35.9 29.25V24.75Z';

const SMALL_BASE = ['M19 42H25V50.5H19Z', 'M29 42H35V50.5H29Z', 'M39 42H45V50.5H39Z', 'M9 53.5H55V57.5H9Z'].join('');

/** The mark for 32px and below. Draw `dome` with fill-rule="evenodd". */
export const MARK_PATHS_SMALL: { readonly dome: string; readonly aperture: string; readonly base: string } = {
  dome: SMALL_DOME,
  aperture: SMALL_APERTURE,
  base: SMALL_BASE,
};

export const WORDMARK = 'Politicon';
