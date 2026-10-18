/**
 * "Brackets as a city", the /explorer model, as plain data: the explorer's
 * illustrative dataset (lib/explorerData.ts) as five districts, one per
 * income bracket, each with a tower per policy category, laid out along a
 * gentle arc on a paper plinth.
 *
 * Three-free on purpose. The 3D scene (BracketCity.tsx), the server-rendered
 * poster that stands in for it (app/explorer/_components/CityPoster.tsx),
 * the page's readout and tests/bracketCity.test.ts all build on these
 * functions, so the model, its poster and its words always show the same
 * numbers in the same places.
 *
 * Honest by construction: a tower's height is linear in its dollars, on the
 * explorer chart's one shared scale (CHART_SCALE). Gains rise from the
 * street; costs hang below it, into the glass well under the district. A
 * non-zero amount never draws thinner than a sliver (as divergingBar does),
 * and zero draws nothing.
 */
import {
  BRACKETS,
  BRACKET_ROWS,
  CATEGORIES,
  CHART_SCALE,
  EXAMPLE_POLICIES,
  UNIT_LABEL,
  formatAnnual,
  type BracketKey,
  type CategoryKey,
} from '@/lib/explorerData';
import { impactSign, type ImpactSign } from '@/lib/format';

// ---------------------------------------------------------------------------
// The data

export interface CityTower {
  category: CategoryKey;
  categoryLabel: string;
  /** Signed $/yr for a typical household in the bracket: the category's example policies summed. */
  amount: number;
  sign: ImpactSign;
  /** |amount| as a share of the chart scale (0..1): the tower's height, linear. */
  share: number;
}

export interface CityDistrict {
  bracket: BracketKey;
  label: string;
  /** For district labels where space is tight ("$25–50k"). */
  short: string;
  /** One per category, in CATEGORIES order. */
  towers: readonly CityTower[];
  /** The sum across every example policy. */
  net: number;
}

export interface ExplorerCityData {
  /** In BRACKETS order: left to right across the city. */
  districts: readonly CityDistrict[];
  categories: readonly { key: CategoryKey; label: string }[];
  /** The chart scale in dollars: a tower of share 1. */
  scale: number;
  /** The largest cost as a share of the scale: how deep the wells under the districts go. */
  deepestShare: number;
  /** The largest gain as a share of the scale. */
  tallestShare: number;
  unit: string;
  policyCount: number;
}

export const SHORT_BRACKET: Record<BracketKey, string> = {
  under25k: '<$25k',
  '25to50k': '$25–50k',
  '50to75k': '$50–75k',
  '75to100k': '$75–100k',
  '100kPlus': '$100k+',
};

export function buildCityData(): ExplorerCityData {
  const districts = BRACKET_ROWS.map((row) => {
    const towers = CATEGORIES.map((cat) => {
      const amount = row.totals[cat.key];
      return {
        category: cat.key,
        categoryLabel: cat.label,
        amount,
        sign: impactSign(amount),
        share: Math.min(Math.abs(amount), CHART_SCALE) / CHART_SCALE,
      };
    });
    return {
      bracket: row.key,
      label: row.label,
      short: SHORT_BRACKET[row.key],
      towers,
      net: towers.reduce((sum, t) => sum + t.amount, 0),
    };
  });
  const cells = districts.flatMap((d) => d.towers);
  return {
    districts,
    categories: CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
    scale: CHART_SCALE,
    deepestShare: Math.max(0, ...cells.filter((t) => t.amount < 0).map((t) => t.share)),
    tallestShare: Math.max(0, ...cells.filter((t) => t.amount > 0).map((t) => t.share)),
    unit: UNIT_LABEL,
    policyCount: EXAMPLE_POLICIES.length,
  };
}

/** The dataset is fixed, so the city is too: build it once. */
export const CITY_DATA: ExplorerCityData = buildCityData();

// ---------------------------------------------------------------------------
// The model's layout, in world units. The street (the paper's top, the zero
// line) is y = 0 and the camera looks from +z. The plinth is a curved band
// that follows the districts' arc: a paper top over a clear acrylic body,
// on a porcelain foot. Gains stand on the paper; costs hang from its
// underside into the acrylic. The poster projects the same coordinates.

export const CITY = {
  /** Height of a tower at the chart scale (share 1). */
  maxHeight: 1.35,
  /** The thinnest a non-zero tower draws, so a small amount never vanishes. */
  minHeight: 0.03,
  /** A floor line on every tower, every this many dollars a year from the street: the scale, drawn in. */
  floorDollars: 100,
  /** The paper sheet on top of the plinth. Costs hang from its underside. */
  paper: 0.03,
  /** Acrylic below the deepest cost. */
  clearance: 0.12,
  /** The porcelain foot under the acrylic. */
  foot: 0.05,
  /**
   * Paper in front of the districts and behind them, to the plinth's edges.
   * Kept narrow in front: the paper hides the top of every cost from a camera
   * above the street, by about this ledge times the tangent of its pitch.
   */
  ledgeFront: 0.05,
  ledgeBack: 0.16,
} as const;

/** A full city (wide screens): each district a staggered row of towers on a wide, gentle arc. */
const FULL = {
  towerWidth: 0.2,
  towerGap: 0.075,
  /** Alternate towers step back and forth by this much, like a street front. */
  stagger: 0.075,
  lotMargin: 0.07,
  arcRadius: 6,
  arcStep: 0.26,
};

/** A compact city (phones): each district a 2 × 2 block on a tighter arc, so it fills a narrow box. */
const COMPACT = {
  towerWidth: 0.24,
  towerGap: 0.1,
  stagger: 0,
  lotMargin: 0.06,
  arcRadius: 3.2,
  arcStep: 0.33,
};

export interface CityDistrictPlacement {
  bracket: BracketKey;
  index: number;
  /** Centre of the district's lot on the street. */
  x: number;
  z: number;
  /** Turn about the vertical axis, in radians (each lot faces the arc's centre). */
  yaw: number;
  width: number;
  depth: number;
}

export interface CityTowerPlacement {
  bracket: BracketKey;
  category: CategoryKey;
  amount: number;
  sign: ImpactSign;
  districtIndex: number;
  /** Index in CATEGORIES. */
  towerIndex: number;
  /** Centre of the footprint. */
  x: number;
  z: number;
  yaw: number;
  /** Square footprint. */
  width: number;
  /** World height (0 for a zero amount). */
  height: number;
  /** +1 rises from the street (a gain), −1 hangs below it (a cost), 0 draws nothing. */
  dir: 1 | -1 | 0;
  /** The tower's span in y: [bottom, top]. */
  y0: number;
  y1: number;
}

export interface CityPlinth {
  /** The arc's centre, on the camera's side of the city. */
  cx: number;
  cz: number;
  /** The band's inner (front) and outer (back) radii. */
  inner: number;
  outer: number;
  /** Half the angle between the centres of the band's rounded ends. */
  span: number;
  /** y of the acrylic's floor (the paper's top is 0). */
  floor: number;
  /** y of the foot's underside. */
  bottom: number;
}

export interface CityLayout {
  compact: boolean;
  districts: readonly CityDistrictPlacement[];
  towers: readonly CityTowerPlacement[];
  /** World units per dollar (linear, the same for every tower). */
  unitsPerDollar: number;
  plinth: CityPlinth;
  /** Half-extents of the plinth around the origin, for the camera. */
  footprint: { halfWidth: number; halfDepth: number };
  /** The tallest point: the tallest gain. */
  top: number;
}

export interface CityLayoutOptions {
  compact?: boolean;
}

/** Rotates a local (x, z) offset by `yaw` about the vertical axis. */
export function turn(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

/** A tower's world height for a signed amount: linear, with a sliver for anything non-zero. */
export function towerHeight(amount: number, scale = CHART_SCALE): number {
  if (impactSign(amount) === 'neutral') return 0;
  return Math.max(CITY.minHeight, (Math.min(Math.abs(amount), scale) / scale) * CITY.maxHeight);
}

/** Local (x, z) of a district's towers around its centre, in category order. */
function towerSlots(compact: boolean): [number, number][] {
  const s = compact ? COMPACT : FULL;
  const step = s.towerWidth + s.towerGap;
  if (compact) {
    // Taxes and healthcare at the back, housing and employment in front.
    return [
      [-step / 2, -step / 2],
      [step / 2, -step / 2],
      [-step / 2, step / 2],
      [step / 2, step / 2],
    ];
  }
  return [0, 1, 2, 3].map((i) => [(i - 1.5) * step, i % 2 === 0 ? s.stagger : -s.stagger]);
}

export function cityLayout(data: ExplorerCityData, { compact = false }: CityLayoutOptions = {}): CityLayout {
  const s = compact ? COMPACT : FULL;
  const slots = towerSlots(compact);
  const width = compact
    ? 2 * s.towerWidth + s.towerGap + 2 * s.lotMargin
    : 4 * s.towerWidth + 3 * s.towerGap + 2 * s.lotMargin;
  const depth = compact ? width : s.towerWidth + 2 * s.stagger + 2 * s.lotMargin;

  const n = data.districts.length;
  const angle = (i: number) => (i - (n - 1) / 2) * s.arcStep;
  const R = s.arcRadius;
  // The arc bends toward the camera (its middle is furthest back); centre the districts in depth.
  const edge = Math.abs(angle(0));
  const back = -(R * (1 - Math.cos(edge))) / 2;
  const cz = back + R;

  // Each lot faces the arc's centre, so the lots follow the band.
  const districts: CityDistrictPlacement[] = data.districts.map((d, index) => {
    const a = angle(index);
    return { bracket: d.bracket, index, x: R * Math.sin(a), z: cz - R * Math.cos(a), yaw: -a, width, depth };
  });

  const unitsPerDollar = CITY.maxHeight / data.scale;
  const towers: CityTowerPlacement[] = data.districts.flatMap((d, districtIndex) => {
    const place = districts[districtIndex];
    return d.towers.map((t, towerIndex) => {
      const [lx, lz] = slots[towerIndex] ?? [0, 0];
      const [ox, oz] = turn(lx, lz, place.yaw);
      const height = towerHeight(t.amount, data.scale);
      const dir = t.sign === 'gain' ? 1 : t.sign === 'loss' ? -1 : 0;
      return {
        bracket: d.bracket,
        category: t.category,
        amount: t.amount,
        sign: t.sign,
        districtIndex,
        towerIndex,
        x: place.x + ox,
        z: place.z + oz,
        yaw: place.yaw,
        width: s.towerWidth,
        height,
        dir,
        y0: dir > 0 ? 0 : dir < 0 ? -CITY.paper - height : 0,
        y1: dir > 0 ? height : dir < 0 ? -CITY.paper : 0,
      } satisfies CityTowerPlacement;
    });
  });

  // The acrylic goes just deeper than the deepest cost.
  const deepest = Math.max(0, ...towers.filter((t) => t.dir < 0).map((t) => t.height));
  const floor = -(CITY.paper + deepest + CITY.clearance);
  const inner = R - depth / 2 - CITY.ledgeFront;
  const outer = R + depth / 2 + CITY.ledgeBack;
  // The band's rounded ends start just past the outer lots' far corners.
  const span = edge + (width / 2 + 0.06) / R;
  const plinth: CityPlinth = { cx: 0, cz, inner, outer, span, floor, bottom: floor - CITY.foot };

  let halfWidth = 0;
  let halfDepth = 0;
  for (const [x, z] of plinthOutline(plinth, 24)) {
    halfWidth = Math.max(halfWidth, Math.abs(x));
    halfDepth = Math.max(halfDepth, Math.abs(z));
  }

  return {
    compact,
    districts,
    towers,
    unitsPerDollar,
    plinth,
    footprint: { halfWidth, halfDepth },
    top: Math.max(0, ...towers.filter((t) => t.dir > 0).map((t) => t.height)),
  };
}

/** A point on a circle around the plinth's centre, at angle `a` (0 = straight back from the camera). */
export function onArc(p: CityPlinth, r: number, a: number): [number, number] {
  return [p.cx + r * Math.sin(a), p.cz - r * Math.cos(a)];
}

/**
 * The plinth's outline as world (x, z) points, counter-clockwise seen from
 * above: the front (inner) arc left to right, the right end's half-round,
 * the back (outer) arc right to left, the left end's half-round. Shared by
 * the 3D extrusion and the poster.
 */
export function plinthOutline(p: CityPlinth, segments = 48): [number, number][] {
  const out: [number, number][] = [];
  const mid = (p.inner + p.outer) / 2;
  const half = (p.outer - p.inner) / 2;
  const capSteps = Math.max(6, Math.round(segments / 3));
  for (let i = 0; i <= segments; i++) out.push(onArc(p, p.inner, -p.span + (2 * p.span * i) / segments));
  for (let end = 0; end < 2; end++) {
    const a = end === 0 ? p.span : -p.span;
    const [ex, ez] = onArc(p, mid, a);
    // Radial (outward) and tangential (along increasing a) directions there.
    const ux = Math.sin(a);
    const uz = -Math.cos(a);
    const tx = Math.cos(a) * (end === 0 ? 1 : -1);
    const tz = Math.sin(a) * (end === 0 ? 1 : -1);
    for (let k = 1; k < capSteps; k++) {
      const phi = Math.PI * (k / capSteps);
      // Right end: from the inner edge round to the outer one; left end: back again.
      const c = end === 0 ? -Math.cos(phi) : Math.cos(phi);
      const sn = Math.sin(phi);
      out.push([ex + half * (c * ux + sn * tx), ez + half * (c * uz + sn * tz)]);
    }
    if (end === 0) for (let i = 0; i <= segments; i++) out.push(onArc(p, p.outer, p.span - (2 * p.span * i) / segments));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The camera, as plain math, so the poster is drawn from exactly the view
// the 3D scene opens on.

export interface CityView {
  /** Turn about the city, radians (0 looks straight at its middle). */
  yaw: number;
  /** Height of the eye above the street, as an angle (radians). */
  pitch: number;
  /** Vertical field of view, degrees. */
  fov: number;
}

/** The composed frame: a three-quarter view from just right of centre, a little above the street. */
export const CITY_VIEW: Record<'full' | 'compact', CityView & { yawRange: number; pitchRange: readonly [number, number] }> = {
  full: { yaw: -0.12, pitch: 0.34, fov: 24, yawRange: 0.5, pitchRange: [0.14, 0.66] },
  compact: { yaw: -0.14, pitch: 0.5, fov: 28, yawRange: 0.45, pitchRange: [0.3, 0.8] },
};

/** How much of the box (in NDC, 1 = its edge) the city may fill, across and down. */
export const CITY_FILL = { x: 0.94, y: 0.86 } as const;

type V3 = [number, number, number];

export interface CityCamera {
  position: V3;
  target: V3;
  fov: number;
  aspect: number;
}

/** What must stay in frame: the plinth's outline at its top and foot, and every tower's far end. */
export function cityBounds(layout: CityLayout): V3[] {
  const pts: V3[] = [];
  for (const [x, z] of plinthOutline(layout.plinth, 16)) pts.push([x, 0, z], [x, layout.plinth.bottom, z]);
  for (const t of layout.towers) if (t.dir > 0) pts.push([t.x, t.y1, t.z]);
  return pts;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A point in normalised device coordinates (x, y in −1..1 inside the frame) and its distance along the view. */
export function projectPoint(cam: CityCamera, p: V3): V3 {
  const f = unit(sub(cam.target, cam.position));
  const r = unit(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, cam.position);
  const z = Math.max(1e-4, dot(d, f));
  const t = Math.tan((cam.fov * Math.PI) / 360);
  return [dot(d, r) / z / (t * cam.aspect), dot(d, u) / z / t, z];
}

/**
 * The camera for a view of the city in a box of `aspect` (width / height):
 * placed on the view's yaw and pitch around the city's middle, then pulled
 * in or back until its bounds just fill the frame (CITY_FILL).
 */
export function frameCity(layout: CityLayout, view: CityView & { tx?: number }, aspect: number, bounds = cityBounds(layout)): CityCamera {
  const target: V3 = [view.tx ?? 0, (layout.top + layout.plinth.bottom) / 2 + 0.06, 0];
  const dir: V3 = [Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch)];
  let distance = layout.footprint.halfWidth * 4;
  let cam: CityCamera = { position: target, target, fov: view.fov, aspect };
  for (let pass = 0; pass < 4; pass++) {
    cam = { position: [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance], target, fov: view.fov, aspect };
    let reach = 0;
    for (const p of bounds) {
      const [x, y] = projectPoint(cam, p);
      reach = Math.max(reach, Math.abs(x) / CITY_FILL.x, Math.abs(y) / CITY_FILL.y);
    }
    // On screen, size goes about as 1 / distance.
    distance *= reach || 1;
  }
  return { ...cam, position: [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance] };
}

/** Where a district's label sits: on the page just under the plinth's front edge, below the district. */
export function labelAnchor(layout: CityLayout, d: CityDistrictPlacement): V3 {
  const [ox, oz] = turn(0, d.depth / 2 + CITY.ledgeFront, d.yaw);
  return [d.x + ox, layout.plinth.bottom, d.z + oz];
}

// ---------------------------------------------------------------------------
// Focus: what the page's controls (or a click on a tower) pick out.

export interface CityFocus {
  bracket?: BracketKey | null;
  category?: CategoryKey | null;
}

/**
 * How lit a tower is under a focus, 0..1: everything at 1 with no focus;
 * the picked bracket's district or category's towers at 1 and the rest dim;
 * with both picked, the one tower at 1, its row and column half lit.
 */
export function towerEmphasis(focus: CityFocus | undefined, bracket: BracketKey, category: CategoryKey): number {
  const b = focus?.bracket ?? null;
  const c = focus?.category ?? null;
  if (!b && !c) return 1;
  const inBracket = !b || b === bracket;
  const inCategory = !c || c === category;
  if (inBracket && inCategory) return 1;
  if (b && c && (b === bracket || c === category)) return 0.55;
  return 0.25;
}

/** How lit a district (its plate and well) is: dimmed only when another bracket is picked. */
export function districtEmphasis(focus: CityFocus | undefined, bracket: BracketKey): number {
  const b = focus?.bracket ?? null;
  return !b || b === bracket ? 1 : 0.4;
}

// ---------------------------------------------------------------------------
// Words. The model is decoration; these say what it shows.

export const DIRECTION_WORD: Record<ImpactSign, string> = { gain: 'Gain', loss: 'Cost', neutral: 'No change' };

/** "Gain +$650/yr", "Cost −$290/yr", "No change $0/yr". */
export function signedPhrase(amount: number): string {
  return `${DIRECTION_WORD[impactSign(amount)]} ${formatAnnual(amount)}`;
}

/** What the model is, for its SceneView label. */
export function cityDescription(data: ExplorerCityData): string {
  const first = data.districts[0]?.label ?? '';
  const last = data.districts[data.districts.length - 1]?.label ?? '';
  return (
    `A model city of the illustrative examples: ${data.districts.length} districts, one per income bracket from ${first} to ${last}, ` +
    `each with a glass tower per category (${data.categories.map((c) => c.label).join(', ')}). ` +
    'Towers rise above the street for gains and hang below it for costs, their heights on one linear scale. ' +
    'Every figure is in the readout and the table on this page.'
  );
}

function findDistrict(data: ExplorerCityData, bracket: BracketKey | null | undefined) {
  return bracket ? data.districts.find((d) => d.bracket === bracket) : undefined;
}

/** "A, B and C" */
function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** One tower in words: "$25k–$50k households, Healthcare: Gain +$650/yr". */
export function towerPhrase(data: ExplorerCityData, bracket: BracketKey, category: CategoryKey): string {
  const d = findDistrict(data, bracket);
  const t = d?.towers.find((x) => x.category === category);
  if (!d || !t) return '';
  return `${d.label} households, ${t.categoryLabel}: ${signedPhrase(t.amount)}`;
}

/**
 * The focus in one or two sentences, for the page's polite live region:
 * read out when the focus changes, so the model's light never carries
 * meaning on its own. Always ends by saying the figures are illustrative.
 */
export function focusSummary(data: ExplorerCityData, focus: CityFocus | undefined): string {
  const d = findDistrict(data, focus?.bracket);
  const category = focus?.category ? data.categories.find((c) => c.key === focus.category) : undefined;
  if (d && category) return `${towerPhrase(data, d.bracket, category.key)}. Illustrative figures.`;
  if (d) {
    const parts = d.towers.map((t) => `${t.categoryLabel} ${signedPhrase(t.amount)}`);
    return `${d.label} households: ${listJoin(parts)}; net ${signedPhrase(d.net)}. Illustrative figures.`;
  }
  if (category) {
    const parts = data.districts.map((x) => {
      const t = x.towers.find((y) => y.category === category.key);
      return `${x.label} ${signedPhrase(t?.amount ?? 0)}`;
    });
    return `${category.label} in every bracket: ${listJoin(parts)}. Illustrative figures.`;
  }
  return `All ${data.districts.length} brackets and ${data.categories.length} categories. Illustrative figures.`;
}

// ---------------------------------------------------------------------------
// The scene and the page talk through these (plain callbacks, no three.js).

/** A tower under the pointer, or picked. */
export interface CityHit {
  bracket: BracketKey;
  category: CategoryKey;
}

/**
 * Where the scene puts each district's label, in px from the top-left of
 * the view's box, every frame the camera moves. The page owns the label
 * elements (plain DOM text, aria-hidden: the controls name every bracket).
 */
export interface CityLabelSink {
  place(bracket: BracketKey, x: number, y: number, visible: boolean): void;
}

/** BRACKETS order, re-exported for callers that only need the keys. */
export const CITY_BRACKETS: readonly BracketKey[] = BRACKETS.map((b) => b.key);
