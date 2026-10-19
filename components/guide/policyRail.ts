import type { DiscoveredPolicy, ImpactDirection } from '@/types';

/**
 * "Your policies": the policies the Policy Guide can be asked about from its
 * rail, built from what the page already has (pure; tests/guide.test.ts).
 *
 *   - the user's policy feed (/api/policies/feed), in feed order, and
 *   - their own analyses (the policy_analyses view), most recent first.
 *
 * A feed policy the user has analysed carries its analysed net annual
 * impact; analyses of policies no longer in the feed follow the feed. Both
 * are ids /api/advisor can resolve (lib/server/policies.ts resolvePolicy:
 * the feed first, then the user's analyses). An analysis without a finite
 * amount (one still being prepared) shows no amount, never a zero.
 */

export interface RailPolicy {
  id: string;
  title: string;
  category: string;
  /** Feed items only: the feed's 0–100 relevance score. */
  relevanceScore?: number;
  /** Feed items only: the score's band in words, as the feed cards print it. */
  relevance?: 'High' | 'Medium' | 'Low';
  /** Feed items only: the feed's likely direction (not an estimate of yours). */
  direction?: ImpactDirection;
  /** Feed items only: the feed's own short estimate text (e.g. "+$1,200/yr"). */
  estimatedImpact?: string;
  /** The user's analysed net annual impact, signed from their side ($/yr): + saves them money, − costs them. */
  analysedAnnual?: number;
  source: 'feed' | 'analysis';
}

/** A row of the policy_analyses view, as the rail reads it. */
export interface RailAnalysisRow {
  policy_id: string;
  policy_title: string | null;
  category: string | null;
  dollar_impact: number | string | null;
}

/** The feed's relevance bands (lib/claude relevanceLabel): 70 and up High, 40 and up Medium. */
export function relevanceBand(score: number): 'High' | 'Medium' | 'Low' {
  return score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low';
}

/** At most this many analyses that aren't in the feed are added after it. */
export const MAX_EXTRA_ANALYSES = 6;

/** The analysed amount as a number, or undefined (missing, not a number, not finite). */
function amount(v: RailAnalysisRow['dollar_impact']): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function buildRail(feed: readonly DiscoveredPolicy[], analyses: readonly RailAnalysisRow[]): RailPolicy[] {
  const analysed = new Map<string, RailAnalysisRow>();
  for (const row of analyses) {
    if (row?.policy_id && !analysed.has(row.policy_id)) analysed.set(row.policy_id, row);
  }
  const seen = new Set<string>();
  const out: RailPolicy[] = [];
  for (const p of feed) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const row = analysed.get(p.id);
    out.push({
      id: p.id,
      title: p.title,
      category: p.category,
      relevanceScore: p.relevanceScore,
      relevance: Number.isFinite(p.relevanceScore) ? (p.relevance ?? relevanceBand(p.relevanceScore)) : undefined,
      direction: p.direction,
      estimatedImpact: p.estimatedImpact || undefined,
      analysedAnnual: row ? amount(row.dollar_impact) : undefined,
      source: 'feed',
    });
  }
  let extra = 0;
  for (const row of analyses) {
    if (extra >= MAX_EXTRA_ANALYSES) break;
    if (!row?.policy_id || seen.has(row.policy_id)) continue;
    seen.add(row.policy_id);
    extra += 1;
    out.push({
      id: row.policy_id,
      title: row.policy_title || row.policy_id,
      category: row.category || 'other',
      analysedAnnual: amount(row.dollar_impact),
      source: 'analysis',
    });
  }
  return out;
}

/** The drag-and-drop type a policy chip carries (its id), so only policy drags light up the orb. */
export const POLICY_DRAG_TYPE = 'application/x-politicon-policy';

/** Whether a drag carries a policy (types are readable during dragover; the id only on drop). */
export function isPolicyDrag(types: readonly string[] | DOMStringList | null | undefined): boolean {
  if (!types) return false;
  return Array.from(types as ArrayLike<string>).includes(POLICY_DRAG_TYPE);
}

/** The rail policy a drop names, if it is one of the user's own (anything else is ignored). */
export function droppedPolicy(rail: readonly RailPolicy[], id: string | null | undefined): RailPolicy | undefined {
  if (!id) return undefined;
  return rail.find((p) => p.id === id);
}
