/**
 * Where things stand on the household diorama, and how a ledger column is
 * stacked: plain numbers with no three.js, so the landing film's timeline
 * (components/three/scenes/filmShots.ts) can aim light at the house and the
 * ledger, and tests can check the arithmetic.
 *
 * Diorama units: the plinth's top is y = 0, its centre the origin, and the
 * house faces +z. A ledger column stands on y = 0 of its own position.
 */

export type Vec3 = readonly [number, number, number];

export const DIORAMA = {
  plinth: { radius: 1.3, height: 0.2 },
  /** The house body (walls), centred on `center` at ground level; the gable rises above `wall`. */
  house: { center: [-0.24, 0, -0.1] as Vec3, width: 0.62, depth: 0.5, wall: 0.34, gable: 0.24 },
  /** Where a ledger column stands beside the house. */
  ledger: [0.56, 0, -0.16] as Vec3,
  car: { position: [-0.8, 0, 0.42] as Vec3, rotationY: 0.55 },
  tree: [-0.86, 0, -0.5] as Vec3,
  /** Two figures by the front path: a grown-up and a child. */
  figures: [
    { position: [-0.02, 0, 0.5] as Vec3, height: 0.19, rotationY: -0.5 },
    { position: [0.11, 0, 0.45] as Vec3, height: 0.14, rotationY: -0.9 },
  ],
} as const;

export interface LedgerSlab {
  /** Signed dollars: + a gain (teal, above the baseline), − a cost (amber, below it). */
  amount: number;
  gain: boolean;
  /** Distance from the baseline to the slab's near and far faces (units, always ≥ 0). */
  inner: number;
  outer: number;
  /** Absolute heights of the slab's bottom and top faces. */
  bottom: number;
  top: number;
}

export interface LedgerLayout {
  /** Height of the pedestal the column stands on. */
  pedestal: number;
  /** Height of the zero line. Gains stack up from it, costs hang down from it. */
  baseline: number;
  slabs: LedgerSlab[];
  /** The taller of the two stacks (normalises a fill that runs out from the baseline). */
  extent: number;
  /** Net dollars (gains minus costs), and the height that marks it. */
  net: number;
  netY: number;
  /** Top of the whole column. */
  top: number;
}

export interface LedgerOptions {
  /** Units of height per dollar (linear: an honest scale). */
  unitsPerDollar?: number;
  /** Height of the pedestal under the lowest cost. */
  pedestal?: number;
  /** Gap between neighbouring slabs. */
  gap?: number;
}

export const LEDGER_DEFAULTS: Required<LedgerOptions> = { unitsPerDollar: 1 / 2200, pedestal: 0.05, gap: 0.014 };

/**
 * Stacks signed amounts into a ledger column: gains upward from the
 * baseline and costs downward from it, each slab's height linear in its
 * dollars (gaps aside), largest nearest the baseline. The baseline sits just
 * high enough for the costs to hang above the pedestal.
 */
export function ledgerLayout(amounts: readonly number[], options: LedgerOptions = {}): LedgerLayout {
  const unitsPerDollar = options.unitsPerDollar ?? LEDGER_DEFAULTS.unitsPerDollar;
  const pedestal = options.pedestal ?? LEDGER_DEFAULTS.pedestal;
  const gap = options.gap ?? LEDGER_DEFAULTS.gap;
  const finite = amounts.filter((a) => Number.isFinite(a) && a !== 0);
  const gains = finite.filter((a) => a > 0).sort((a, b) => b - a);
  const costs = finite.filter((a) => a < 0).sort((a, b) => a - b);

  const stack = (list: number[]) => {
    let d = 0;
    return list.map((amount) => {
      const inner = d + gap / 2;
      const outer = inner + Math.abs(amount) * unitsPerDollar;
      d = outer + gap / 2;
      return { amount, gain: amount > 0, inner, outer };
    });
  };
  const up = stack(gains);
  const down = stack(costs);
  const costDepth = down.length ? down[down.length - 1].outer + gap / 2 : 0;
  const baseline = pedestal + costDepth;

  const slabs: LedgerSlab[] = [
    ...up.map((s) => ({ ...s, bottom: baseline + s.inner, top: baseline + s.outer })),
    ...down.map((s) => ({ ...s, bottom: baseline - s.outer, top: baseline - s.inner })),
  ];
  const upExtent = up.length ? up[up.length - 1].outer : 0;
  const extent = Math.max(upExtent, costDepth, 1e-6);
  const net = finite.reduce((sum, a) => sum + a, 0);
  return { pedestal, baseline, slabs, extent, net, netY: baseline + net * unitsPerDollar, top: baseline + upExtent };
}

/**
 * How much of a slab shows (0..1) when the fill front has run `front`
 * (0..1, a share of the layout's extent) out from the baseline.
 */
export function slabShown(slab: LedgerSlab, front: number, extent: number): number {
  const reach = Math.min(1, Math.max(0, front)) * extent;
  const h = slab.outer - slab.inner;
  return h <= 0 ? 0 : Math.min(1, Math.max(0, (reach - slab.inner) / h));
}
