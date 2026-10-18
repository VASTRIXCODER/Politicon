/**
 * "Your Ledger", the dashboard's centrepiece: every policy the user has
 * analysed, as one glass monolith on a porcelain plinth. A lit violet
 * baseline splits it; one teal slab per category that saves the user money
 * stacks up from it and one amber slab per category that costs them hangs
 * down from it, every slab as tall as its dollars on ONE linear scale; a
 * ring of light marks the net, and a staff beside it carries the scale's
 * marks. The numbers themselves are never 3D: the page states them.
 *
 * Pure and three-free. The scene (components/three/scenes/LedgerMonolith),
 * its server poster (components/dashboard/LedgerPoster) and the DOM twin
 * (components/dashboard/LedgerReadout) all read this model and this
 * geometry, so the picture, the poster and the figures can't drift apart.
 *
 * INPUT: exactly what the dashboard loads (app/dashboard/page.tsx).
 *   analyses  its list of the user's latest analyses (the policy_analyses
 *             view, newest first, RECENT_LIMIT rows): each row's `category`
 *             (the policy's own category) and `dollar_impact` (that
 *             policy's net yearly impact, signed from the user's side:
 *             + saves them money, − costs them).
 *   totals    analysis_totals(): `count` and `netAnnual` over EVERY
 *             analysis, or null while it loads (or if it failed).
 * The dashboard has no per-category breakdown of a single analysis (the
 * view exposes only the net), so a slab is one policy category, netted
 * over the analyses in it, exactly as the dashboard's "By Category" view
 * already groups them.
 *
 * Honest with partial data: when the totals cover more analyses than the
 * list (the list is capped), the difference is real arithmetic, not a
 * guess: one extra slab, "Other analyses", holds their combined net, so
 * every slab adds up to the headline net. Nothing is invented: no
 * analyses → an empty ledger (no numbers at all), a category that nets to
 * $0 → listed as "no change" with no slab, missing amounts → $0.
 */
import { formatUSD, impactWords } from '@/lib/format';
import { describeHousehold, type HouseholdModel } from '@/lib/household';

export type LedgerTone = 'gain' | 'loss' | 'neutral';

export interface LedgerSlab {
  /** Stable id: `cat-<category>` for a category, OTHER_ANALYSES_ID for the combined rest. */
  id: string;
  label: string;
  /** Signed whole dollars a year: + saves the user money, − costs them. */
  value: number;
  tone: LedgerTone;
  /** How many analysed policies this slab nets together. */
  policies: number;
  /** The combined net of the analyses the dashboard didn't list (see the header). */
  combined?: boolean;
}

export interface LedgerModel {
  /** Signed whole dollars a year over every analysed policy (the headline). */
  net: number;
  /** Sum of the gaining slabs, ≥ 0. */
  gains: number;
  /** Sum of the costing slabs as a magnitude, ≥ 0 (net = gains − costs, give or take rounding). */
  costs: number;
  /** Gains (largest first), then costs (largest first), then the categories that net to $0. */
  slabs: LedgerSlab[];
  /** How many policies the net covers. 0 means the ledger is empty. */
  analysed: number;
  /** How many of them the category slabs were built from (the rest are in the "Other analyses" slab). */
  listed: number;
  /** How many of the listed analyses are of policies that aren't law (proposed, passed, rejected, repealed): their amounts are what they would mean. */
  notLaw: number;
}

/** One row of the dashboard's analyses list (only the fields the ledger reads). */
export interface LedgerAnalysis {
  category?: string | null;
  /** The policy's net yearly impact (PostgREST may send a numeric as a string). */
  dollar_impact?: number | string | null;
  /** The policy's recorded status (the view's `status`): 'enacted' is law; anything else known isn't. */
  status?: string | null;
}

export interface LedgerInput {
  analyses: readonly (LedgerAnalysis | null | undefined)[] | null | undefined;
  /** From analysis_totals(): every analysis, not just the listed ones. Null while it loads. */
  totals?: { count: number; netAnnual: number } | null;
}

export const OTHER_ANALYSES_ID = 'other-analyses';

export const EMPTY_LEDGER: LedgerModel = Object.freeze({
  net: 0,
  gains: 0,
  costs: 0,
  slabs: Object.freeze([]) as unknown as LedgerSlab[],
  analysed: 0,
  listed: 0,
  notLaw: 0,
}) as LedgerModel;

const CATEGORY_LABELS: Record<string, string> = {
  taxes: 'Taxes',
  tax: 'Taxes',
  healthcare: 'Healthcare',
  health: 'Healthcare',
  housing: 'Housing',
  employment: 'Employment',
  education: 'Education',
  retirement: 'Retirement',
  energy: 'Energy',
  trade: 'Trade',
  transportation: 'Transportation',
  consumer: 'Consumer',
  general: 'General',
  other: 'Other',
};

/** A policy category as a stable key: "Health care " → "health-care"; nothing → "other". */
export function categoryKey(category: string | null | undefined): string {
  const slug = String(category ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!slug) return 'other';
  return slug === 'tax' ? 'taxes' : slug === 'health' ? 'healthcare' : slug;
}

/** The category's name as the app writes it ("social-security" → "Social security"). */
export function categoryLabel(category: string | null | undefined): string {
  const key = categoryKey(category);
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  const words = key.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const dollars = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Whole dollars, never −0. */
const whole = (n: number) => {
  const r = Math.round(n);
  return Object.is(r, -0) ? 0 : r;
};

const toneOf = (v: number): LedgerTone => (v > 0 ? 'gain' : v < 0 ? 'loss' : 'neutral');

const TONE_ORDER: Record<LedgerTone, number> = { gain: 0, loss: 1, neutral: 2 };

export function buildLedger(input: LedgerInput): LedgerModel {
  const rows = (input.analyses ?? []).filter((r): r is LedgerAnalysis => !!r);
  const groups = new Map<string, { label: string; raw: number; policies: number }>();
  let listedRaw = 0;
  let notLaw = 0;
  for (const row of rows) {
    if (typeof row.status === 'string' && row.status.trim() && row.status.trim().toLowerCase() !== 'enacted') notLaw += 1;
    const v = dollars(row.dollar_impact);
    const key = categoryKey(row.category);
    const g = groups.get(key) ?? { label: categoryLabel(row.category), raw: 0, policies: 0 };
    g.raw += v;
    g.policies += 1;
    groups.set(key, g);
    listedRaw += v;
  }

  const listed = rows.length;
  const t = input.totals;
  const count = t && Number.isFinite(Number(t.count)) ? Math.max(0, Math.floor(Number(t.count))) : null;
  const totalNet = t && Number.isFinite(Number(t.netAnnual)) ? Number(t.netAnnual) : null;
  // The totals add something only when they cover analyses the list doesn't
  // (otherwise the list itself is the whole story, and stays self-consistent).
  const rest = count !== null && totalNet !== null && count > listed ? count - listed : 0;
  const netRaw = rest ? (totalNet as number) : listedRaw;

  const slabs: LedgerSlab[] = [...groups].map(([key, g]) => {
    const value = whole(g.raw);
    return { id: `cat-${key}`, label: g.label, value, tone: toneOf(value), policies: g.policies };
  });
  if (rest) {
    const value = whole(netRaw - listedRaw);
    slabs.push({ id: OTHER_ANALYSES_ID, label: 'Other analyses', value, tone: toneOf(value), policies: rest, combined: true });
  }
  // Largest nearest the baseline; the combined rest outermost in its group; ties by name.
  slabs.sort(
    (a, b) =>
      TONE_ORDER[a.tone] - TONE_ORDER[b.tone] ||
      Number(!!a.combined) - Number(!!b.combined) ||
      Math.abs(b.value) - Math.abs(a.value) ||
      a.label.localeCompare(b.label)
  );

  const gains = slabs.reduce((s, x) => s + Math.max(0, x.value), 0);
  const costs = slabs.reduce((s, x) => s + Math.max(0, -x.value), 0);
  return { net: whole(netRaw), gains, costs, slabs, analysed: listed + rest, listed, notLaw };
}

// ---------------------------------------------------------------------------
// The scale: one linear scale for gains and costs, sized to the ledger so the
// stack fills most of the column, with a round step for the staff's marks.

/** The smallest of 1, 2, 2.5, 5 × 10ⁿ that is ≥ x. */
export function niceStep(x: number): number {
  if (!(x > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x * (1 - 1e-9)) return m * p;
  return 10 * p;
}

export interface LedgerScale {
  /** Dollars a year the column's slab region spans (a whole number of steps). */
  max: number;
  /** Dollars a year between two marks on the staff. */
  step: number;
}

/** The scale for a ledger, or null when it has nothing to stack (empty, or every slab nets to $0). */
export function ledgerScale(model: Pick<LedgerModel, 'gains' | 'costs'>): LedgerScale | null {
  const total = model.gains + model.costs;
  if (!(total >= 1)) return null;
  const step = Math.max(1, niceStep(total / 5));
  return { step, max: Math.ceil(total / step - 1e-9) * step };
}

// ---------------------------------------------------------------------------
// The monolith in world units, shared by the scene and its poster. The
// plinth's top is y = 0, the column stands on it centred on the origin, and
// its front faces +z.

export const LEDGER_WORLD = {
  /** The column, porcelain foot included. */
  height: 2.5,
  width: 0.7,
  depth: 0.4,
  /** The porcelain foot under the lowest cost, and the clear glass kept above the highest gain, as shares of the height. */
  foot: 0.06,
  head: 0.05,
  /** Air between neighbouring slabs (cut out of each slab's own interval, so slab edges sit on the scale). */
  gap: 0.012,
  /** No slab is drawn thinner than this (a sliver for a very small amount). */
  minSlab: 0.006,
  /** The baseline plate: how far it stands proud of the column, and how thick it is. */
  plate: { overhang: 0.05, thickness: 0.022 },
  /** The empty ledger's dashed baseline, as a share of the height. */
  emptyBaseline: 0.36,
  /** How far a highlighted slab slides out toward the viewer. */
  slideOut: 0.07,
  plinth: { radius: 1.15, height: 0.2 },
  /** The scale staff, standing just clear of the column's right side. */
  staff: { x: 0.5, z: 0.02, radius: 0.007, tick: 0.055 },
  /**
   * The household at the column's foot, front left: the user's diorama (the
   * kit's HouseholdDiorama, its avatar) in miniature, on its own plinth.
   * `plinth` and `house` repeat the diorama's own units (DIORAMA in
   * components/three/kit/dioramaLayout.ts; tests/ledger.test.ts keeps them equal).
   */
  household: {
    position: [-0.62, 0, 0.48] as readonly [number, number, number],
    rotationY: 0.5,
    scale: 0.27,
    plinth: { radius: 1.3, height: 0.2 },
    house: [-0.24, 0, -0.1] as readonly [number, number, number],
  },
} as const;

/** The composed view (the scene's camera and the poster's projection). Radians; fov in degrees. */
export const LEDGER_VIEW = { yaw: 0.5, pitch: 0.17, fov: 26 } as const;

export interface LedgerGeometrySlab {
  id: string;
  tone: 'gain' | 'loss';
  /** The drawn slab's bottom and top (world y), gaps taken out. */
  y0: number;
  y1: number;
}

export interface LedgerGeometry {
  empty: boolean;
  scale: LedgerScale | null;
  /** World y of the zero line. */
  baseline: number;
  /** World y of the net ring (null for an empty ledger). */
  net: number | null;
  /** Top of the porcelain foot. */
  footTop: number;
  slabs: LedgerGeometrySlab[];
  /** The clear glass above the highest gain (or above the foot, when empty). */
  glass: { y0: number; y1: number };
  /** World y of each staff mark, one per scale step either side of the baseline. */
  ticks: number[];
  top: number;
}

export function ledgerGeometry(model: LedgerModel): LedgerGeometry {
  const W = LEDGER_WORLD;
  const H = W.height;
  const footTop = W.foot * H;
  const regionTop = (1 - W.head) * H;
  const plateHalf = W.plate.thickness / 2;
  const scale = ledgerScale(model);

  if (model.analysed === 0 || !scale) {
    const baseline = W.emptyBaseline * H;
    return {
      empty: model.analysed === 0,
      scale: null,
      baseline,
      // Everything nets to $0: the ring rests on the baseline.
      net: model.analysed === 0 ? null : baseline,
      footTop,
      slabs: [],
      glass: { y0: footTop, y1: H },
      ticks: [],
      top: H,
    };
  }

  const perDollar = (regionTop - footTop) / scale.max;
  const baseline = footTop + model.costs * perDollar;
  const near = plateHalf + 0.004;
  const slabs: LedgerGeometrySlab[] = [];
  const stack = (tone: 'gain' | 'loss') => {
    let d = 0;
    for (const s of model.slabs) {
      if (s.tone !== tone) continue;
      const a = d;
      d += Math.abs(s.value) * perDollar;
      // Intervals on the scale, measured out from the baseline.
      let lo = a + (a === 0 ? near : W.gap / 2);
      let hi = d - W.gap / 2;
      if (hi - lo < W.minSlab) {
        const mid = (a + d) / 2;
        lo = mid - W.minSlab / 2;
        hi = mid + W.minSlab / 2;
      }
      slabs.push(tone === 'gain' ? { id: s.id, tone, y0: baseline + lo, y1: baseline + hi } : { id: s.id, tone, y0: baseline - hi, y1: baseline - lo });
    }
    return d;
  };
  const up = stack('gain');
  stack('loss');

  const gainsTop = baseline + up;
  const ticks: number[] = [];
  const stepY = scale.step * perDollar;
  for (let y = baseline + stepY; y <= regionTop + 1e-6; y += stepY) ticks.push(y);
  for (let y = baseline - stepY; y >= footTop - 1e-6; y -= stepY) ticks.push(y);
  ticks.sort((a, b) => a - b);

  const net = Math.min(gainsTop, Math.max(footTop, baseline + model.net * perDollar));
  return {
    empty: false,
    scale,
    baseline,
    net,
    footTop,
    slabs,
    glass: { y0: up > 0 ? gainsTop + W.gap / 2 : baseline + near, y1: H },
    ticks,
    top: H,
  };
}

// ---------------------------------------------------------------------------
// The composed view as an orthographic projection: the poster draws with it,
// and the scene frames its perspective camera from the same bounds, so the
// cross-fade from poster to scene is between two pictures of one model.

export type Vec3 = readonly [number, number, number];

/** A world point in view space: x right, y up, z toward the viewer (yaw about y, then pitch down). */
export function projectLedger([x, y, z]: Vec3, yaw: number = LEDGER_VIEW.yaw, pitch: number = LEDGER_VIEW.pitch): [number, number, number] {
  const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
  const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
  return [x1, y * Math.cos(pitch) - z1 * Math.sin(pitch), y * Math.sin(pitch) + z1 * Math.cos(pitch)];
}

/** The world point that projects to view (x, y) at depth z (the inverse of projectLedger). */
export function unprojectLedger([x1, y2, z2]: Vec3, yaw: number = LEDGER_VIEW.yaw, pitch: number = LEDGER_VIEW.pitch): [number, number, number] {
  const y = y2 * Math.cos(pitch) + z2 * Math.sin(pitch);
  const z1 = -y2 * Math.sin(pitch) + z2 * Math.cos(pitch);
  return [x1 * Math.cos(yaw) + z1 * Math.sin(yaw), y, -x1 * Math.sin(yaw) + z1 * Math.cos(yaw)];
}

/** The view-space box around the plinth, the column and the household: what the frame must hold. */
export function ledgerViewBounds(withHousehold: boolean): { minX: number; maxX: number; minY: number; maxY: number } {
  const W = LEDGER_WORLD;
  const pts: Vec3[] = [];
  for (const x of [-W.width / 2, W.width / 2]) for (const z of [-W.depth / 2, W.depth / 2]) pts.push([x, W.height, z]);
  const r = W.plinth.radius;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push([Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r, -W.plinth.height, Math.sin(a) * r]);
  }
  if (withHousehold) {
    const { position, scale, plinth } = W.household;
    const [hx, , hz] = position;
    const lift = plinth.height * scale;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push([hx + Math.cos(a) * plinth.radius * scale, 0, hz + Math.sin(a) * plinth.radius * scale]);
    }
    // Its tallest building (the apartment block) with room to spare.
    pts.push([hx, lift + 0.32, hz]);
  }
  const p = pts.map((v) => projectLedger(v));
  const xs = p.map((v) => v[0]);
  const ys = p.map((v) => v[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// ---------------------------------------------------------------------------
// Words: the scene's label for screen readers, and the caption for its scale.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const yearly = (n: number) => `${formatUSD(n, { signed: true })} a year`;

/** What the picture shows, in one or two sentences (the SceneView's label). */
export function describeLedger(model: LedgerModel, household?: HouseholdModel | null): string {
  const home = household?.dwelling ? ` Beside it stands your household: ${describeHousehold(household).replace(/^./, (c) => c.toLowerCase())}` : '';
  if (model.analysed === 0) return `An empty glass ledger on a porcelain plinth, its baseline dashed: no policies analyzed yet.${home}`;
  const up = model.slabs.filter((s) => s.tone === 'gain').length;
  const down = model.slabs.filter((s) => s.tone === 'loss').length;
  if (!up && !down) return `A clear glass ledger with no slabs: every analyzed policy nets to $0 a year, so its ring of light rests on the baseline.${home}`;
  const parts: string[] = [];
  if (up) parts.push(`${plural(up, 'teal slab', 'teal slabs')} for what saves you money ${up === 1 ? 'rises' : 'rise'} above a violet baseline`);
  if (down) parts.push(`${plural(down, 'amber slab', 'amber slabs')} for what costs you ${down === 1 ? 'hangs' : 'hang'} below ${up ? 'it' : 'a violet baseline'}`);
  return `Your ledger as a glass column: ${parts.join(', and ')}. A ring of light marks the net, ${yearly(model.net)} (${impactWords(model.net)}).${home}`;
}

/** The scale in words, for the figure's caption. */
export function ledgerScaleNote(model: LedgerModel): string {
  if (model.analysed === 0) return 'Each policy you analyze adds to its category’s slab: savings rise above the baseline in teal, costs hang below it in amber.';
  const scale = ledgerScale(model);
  if (!scale) return 'Every analyzed policy nets to $0 a year, so there are no slabs yet; the ring of light rests on the baseline.';
  return `Each slab is as tall as its yearly amount, on one linear scale for savings and costs; each mark on the staff is ${formatUSD(scale.step)} a year. The ring of light marks the net.`;
}

/** Which of the analyses aren't law (so their amounts are hypothetical), or null when all known ones are. */
export function ledgerStatusNote(model: LedgerModel): string | null {
  const n = model.notLaw;
  if (!n) return null;
  // Statuses are known only for the listed analyses.
  const of = model.listed < model.analysed ? 'of your latest analyses' : 'of these policies';
  if (model.analysed === 1) return 'This policy isn’t law, so its amount is what it would mean if enacted.';
  return n === 1
    ? `1 ${of} isn’t law, so its amount is what it would mean if enacted.`
    : `${n} ${of} aren’t law, so their amounts are what they would mean if enacted.`;
}

/** Why there's an "Other analyses" slab, or null when there isn't one. */
export function ledgerCoverageNote(model: LedgerModel): string | null {
  const rest = model.slabs.find((s) => s.combined);
  if (!rest) return null;
  if (model.listed === 0) return `Your ${plural(rest.policies, 'analysis is', 'analyses are')} shown combined, as “Other analyses”: their categories didn’t load.`;
  const latest = model.listed === 1 ? 'latest analysis' : `${model.listed} latest analyses`;
  const others = rest.policies === 1 ? 'other analysis is' : `other ${rest.policies} analyses are`;
  return `Categories cover your ${latest}; your ${others} combined as “Other analyses”.`;
}
