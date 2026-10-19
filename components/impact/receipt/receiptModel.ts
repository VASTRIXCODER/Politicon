import { formatUSD, impactSign, impactWords } from '@/lib/format';

/*
 * The policy receipt's arithmetic, kept pure (tests/impactList.test.ts):
 * the subtotal of what saves you money, the subtotal of what costs you, and
 * the net at the foot, all from each analysis's own yearly estimate.
 */

/** The receipt's order: the largest impact first (either way), or the newest first. */
export type ReceiptOrder = 'impact' | 'date';

/** A receipt line: one saved analysis. */
export interface ReceiptLine {
  id: string;
  policy_id: string;
  policy_title: string;
  category: string;
  created_at: string;
  /** Signed dollars a year (the analysis's net annual impact). */
  dollar_impact: number;
}

export interface ReceiptTotals {
  /** Sum of the gains (positive). */
  gains: number;
  /** Sum of the costs (positive). */
  costs: number;
  /** gains − costs. */
  net: number;
  gainCount: number;
  costCount: number;
  flatCount: number;
}

export function receiptTotals(lines: readonly Pick<ReceiptLine, 'dollar_impact'>[]): ReceiptTotals {
  const t: ReceiptTotals = { gains: 0, costs: 0, net: 0, gainCount: 0, costCount: 0, flatCount: 0 };
  for (const l of lines) {
    const v = Number.isFinite(l.dollar_impact) ? l.dollar_impact : 0;
    const s = impactSign(v);
    if (s === 'gain') {
      t.gains += v;
      t.gainCount += 1;
    } else if (s === 'loss') {
      t.costs -= v;
      t.costCount += 1;
    } else {
      t.flatCount += 1;
    }
  }
  t.net = t.gains - t.costs;
  return t;
}

/** "01", "02" … the till's line numbers (also on the skyline's plaques). */
export const lineNumber = (i: number) => String(i + 1).padStart(2, '0');

/** "+$1,240/yr". */
export const yearly = (n: number) => formatUSD(n, { signed: true, suffix: '/yr' });

/** "saves you $1,240 a year", "costs you $340 a year", "no change a year": what a screen reader hears for an amount. */
export function spokenYearly(n: number): string {
  const words = impactWords(n);
  return words === 'no change' ? 'no change a year' : `${words} ${formatUSD(Math.abs(n))} a year`;
}

export const policies = (n: number) => `${n} ${n === 1 ? 'policy' : 'policies'}`;

/** "social-security" → "Social security". */
export function categoryName(c: string | null | undefined): string {
  const words = String(c ?? '').trim().replace(/[-_]+/g, ' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Other';
}

/** "Oct 18, 2026" (empty for a date that doesn't parse). */
export function shortDate(iso: string | null | undefined): string {
  const d = new Date(iso ?? '');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The newest line's date: how current the receipt is. */
export function latestDate(lines: readonly Pick<ReceiptLine, 'created_at'>[]): string {
  let best = -Infinity;
  let iso = '';
  for (const l of lines) {
    const t = new Date(l.created_at).getTime();
    if (Number.isFinite(t) && t > best) {
      best = t;
      iso = l.created_at;
    }
  }
  return shortDate(iso);
}

/**
 * The receipt's paper in the dark theme (and the detail page's ledger and
 * checklist slips): a step lighter and warmer than the night surface
 * (23 17 48), as RGB channels, the value receipt.module.css and
 * detail.module.css use. Every text token on it is checked for AA in
 * tests/impactList.test.ts.
 */
export const NIGHT_PAPER = '42 35 54';
