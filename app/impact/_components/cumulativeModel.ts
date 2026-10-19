import { projectionAt, SKYLINE_HORIZONS, type SkylineHorizon } from '@/lib/skyline';
import type { PolicyAnalysisRow } from './impactModel';

/*
 * The Cumulative analysis tab's arithmetic (CumulativeView), kept apart from
 * the page's own model so it loads with that tab, not in the first load.
 * Every projection here is an analysis's own cumulative estimate after 1, 3
 * or 5 years (timeline.year1/3/5), never the yearly figure multiplied up.
 */

/** Combined impact by category: one row per category, one stack segment per selected policy. */
export function stackedByCategory(rows: readonly PolicyAnalysisRow[]) {
  const series = rows.map((a) => ({ key: a.policy_id, name: a.policy_title }));
  const byCat: Record<string, Record<string, number | string>> = {};
  for (const a of rows) {
    const cat = a.category || 'Other';
    if (!byCat[cat]) byCat[cat] = { category: cat };
    byCat[cat][a.policy_id] = Number(byCat[cat][a.policy_id] || 0) + (a.dollar_impact || 0);
  }
  return { data: Object.values(byCat), series };
}

export interface HorizonTotal {
  horizon: SkylineHorizon;
  /** Sum of the selected analyses' own projections at this horizon. */
  total: number;
  /** How many of them have one. */
  counted: number;
}

/** The selected analyses' combined projections after 1, 3 and 5 years: their own estimates summed, never the yearly figure multiplied. */
export function horizonTotals(rows: readonly PolicyAnalysisRow[]): HorizonTotal[] {
  return SKYLINE_HORIZONS.map((horizon) => {
    let total = 0;
    let counted = 0;
    for (const r of rows) {
      const v = projectionAt(r.timeline, horizon);
      if (v === null) continue;
      total += v;
      counted += 1;
    }
    return { horizon, total, counted };
  });
}

/**
 * The projection chart: one line per selected policy that has all three
 * projections, plus a total line over those same policies, from the
 * analyses' own timeline.year1/3/5. Policies without them are left out
 * (`missing`), never drawn as $0.
 */
export function projectionLines(rows: readonly PolicyAnalysisRow[]) {
  const complete = rows.filter((r) => SKYLINE_HORIZONS.every((h) => projectionAt(r.timeline, h) !== null));
  const missing = rows.filter((r) => !complete.includes(r));
  const series = complete.length
    ? [...complete.map((a) => ({ key: a.policy_id, name: a.policy_title })), { key: '__total', name: 'Total', total: true }]
    : [];
  const data = complete.length
    ? SKYLINE_HORIZONS.map((yr) => {
        const row: Record<string, number | string> = { name: `${yr} Year${yr > 1 ? 's' : ''}` };
        let total = 0;
        for (const a of complete) {
          const v = projectionAt(a.timeline, yr) ?? 0;
          row[a.policy_id] = v;
          total += v;
        }
        row.__total = total;
        return row;
      })
    : [];
  return { data, series, missing };
}

/** Each selected analysis's share of the combined size (|impact|), largest first, in whole percent. */
export function rankedShares(rows: readonly PolicyAnalysisRow[]) {
  const ranked = [...rows].sort((a, b) => Math.abs(b.dollar_impact || 0) - Math.abs(a.dollar_impact || 0));
  const totalAbs = ranked.reduce((s, a) => s + Math.abs(a.dollar_impact || 0), 0) || 1;
  return ranked.map((row) => ({ row, share: Math.round((Math.abs(row.dollar_impact || 0) / totalAbs) * 100) }));
}

/** "Jobs Act and 2 more" style list of titles, for notes about left-out policies. */
export function titleList(rows: readonly { policy_title: string }[], max = 2): string {
  const names = rows.slice(0, max).map((r) => r.policy_title);
  const rest = rows.length - names.length;
  if (rest > 0) return `${names.join(', ')} and ${rest} more`;
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
