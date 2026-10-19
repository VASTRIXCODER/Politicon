import ViewFullImpactButton from '@/components/ViewFullImpactButton';
import { formatUSD, impactTone } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PolicyAnalysisRow } from './impactModel';

/*
 * An analysis's short read, opened in place under its receipt line: the
 * plain-English summary, its own 1, 3 and 5-year projections (a dash where
 * it has none), the top trade-offs either way, things to consider, and the
 * way to the full analysis.
 */

const signedUSD = (n: number) => formatUSD(n, { signed: true });
const HEADING = 'mb-2 font-mono-data text-meta font-semibold uppercase tracking-[0.14em] text-primary-300';

export default function AnalysisBody({ row, headingTag = 'h4' }: { row: PolicyAnalysisRow; headingTag?: 'h3' | 'h4' }) {
  const H = headingTag;
  const t = row.timeline;
  const gains = (row.tradeoffs?.gains || []).slice(0, 3);
  const losses = (row.tradeoffs?.losses || []).slice(0, 3);
  const recs = (row.recommendations || []).slice(0, 3);
  return (
    <div className="space-y-5">
      {row.summary && <p className="text-sm leading-relaxed text-muted">{row.summary}</p>}
      {row.legacy && (
        <p className="text-meta text-muted">This is a short summary from an earlier version. Open the full impact to generate the complete breakdown.</p>
      )}
      {t && (t.year1 !== undefined || t.year3 !== undefined || t.year5 !== undefined) && (
        <div>
          <H className={HEADING}>Projections</H>
          <dl className="grid grid-cols-3 gap-2">
            {([['1 year', t.year1], ['3 years', t.year3], ['5 years', t.year5]] as const).map(([label, v]) => (
              <div key={label} className="min-w-0 rounded-tile border border-fg/8 bg-fg/[0.03] px-2.5 py-2">
                <dt className="text-meta text-muted">{label}</dt>
                <dd className={cn('font-mono-data text-sm font-semibold [overflow-wrap:anywhere]', impactTone(v ?? 0))}>
                  {typeof v === 'number' && Number.isFinite(v) ? signedUSD(v) : '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {(gains.length > 0 || losses.length > 0) && (
        <div>
          <H className={HEADING}>Trade-offs</H>
          <ul className="space-y-1.5 text-sm">
            {gains.map((g, i) => (
              <li key={`g${i}`} className="flex justify-between gap-3">
                <span className="text-muted">{g.label}</span>
                <span className="whitespace-nowrap font-mono-data text-gain">{signedUSD(Math.abs(g.value))}</span>
              </li>
            ))}
            {losses.map((l, i) => (
              <li key={`l${i}`} className="flex justify-between gap-3">
                <span className="text-muted">{l.label}</span>
                <span className="whitespace-nowrap font-mono-data text-loss">{signedUSD(-Math.abs(l.value))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recs.length > 0 && (
        <div>
          <H className={HEADING}>Things to consider</H>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {recs.map((r, i) => (
              <li key={i}>{r.step}</li>
            ))}
          </ul>
        </div>
      )}
      <ViewFullImpactButton policyId={row.policy_id} policyTitle={row.policy_title} category={row.category} variant="compact" analyzed />
    </div>
  );
}
