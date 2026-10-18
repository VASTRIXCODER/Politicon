import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import { formatUSD, impactSign, impactTone, impactWords } from '@/lib/format';
import { cn } from '@/lib/utils';
import { receiptTotal, type PolicyAnalysisRow } from './dashboardModel';
import styles from './dashboard.module.css';

/*
 * The latest analyses as a receipt: a strip of porcelain paper with
 * perforated ends, the earlier receipts peeking out under it, one line per
 * policy (its category and date, its title linking to the full analysis, its
 * signed yearly amount with the words), and the net at the foot. A list, so
 * screen readers hear how many there are; every amount carries its sign and
 * its words, never colour alone.
 */

export interface RecentAnalysesProps {
  loading: boolean;
  analyses: PolicyAnalysisRow[];
  /** Every analysis the user has (the ledger's count), so the foot can say when these are only the latest. */
  analysed: number;
}

const yearly = (n: number) => formatUSD(n, { signed: true, suffix: '/yr' });
/** "social-security" → "Social security" (lib/ledger's labels load with the ledger, not with the page). */
const categoryName = (c: string | null | undefined) => {
  const words = String(c ?? '').trim().replace(/[-_]+/g, ' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Other';
};
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function RecentAnalyses({ loading, analyses, analysed }: RecentAnalysesProps) {
  const total = receiptTotal(analyses, analysed);

  return (
    <section aria-labelledby="dashboard-recent">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="dashboard-recent" className="font-display text-xl font-medium text-ink">
          Recent <em>analyses</em>
        </h2>
        <Link
          href="/impact"
          className="inline-flex items-center gap-1 text-meta font-medium text-primary-300 underline-offset-2 hover:underline"
        >
          All<span className="sr-only"> analyses</span> in My Impact
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3 rounded-pane border border-fg/8 bg-surface p-5" role="status">
          <span className="sr-only">Loading your analyses…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : analyses.length === 0 ? (
        <div className="rounded-pane border border-dashed border-fg/15 bg-surface/60 px-5 py-8 text-center">
          <p className="font-medium text-ink">No policies analyzed yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Analyze a policy from your feed and it prints here.</p>
        </div>
      ) : (
        <div className={styles.stack}>
          <span aria-hidden="true" data-decorative="" className={styles.under} />
          <div className={cn(styles.receipt, 'px-4 pb-3 pt-4 sm:px-5')}>
            <p
              aria-hidden="true"
              className="mb-2 flex items-center justify-between gap-3 border-b border-dashed border-fg/15 pb-2.5 font-mono-data text-meta uppercase tracking-[0.16em] text-muted"
            >
              <span>Policy receipt</span>
              <span>Per year</span>
            </p>
            <ol aria-labelledby="dashboard-recent">
              {analyses.map((a) => {
                const value = a.dollar_impact || 0;
                const words = impactWords(value);
                return (
                  <li key={a.id} className={cn(styles.line, 'relative -mx-2 rounded-md px-2 py-3')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono-data text-meta text-muted">
                          {categoryName(a.category)}
                          {shortDate(a.created_at) && ` · ${shortDate(a.created_at)}`}
                        </p>
                        <h3 className="mt-0.5 text-sm font-medium leading-snug text-ink">
                          <Link
                            href={`/impact/${encodeURIComponent(a.policy_id)}`}
                            className="line-clamp-2 rounded-sm underline-offset-2 hover:underline after:absolute after:inset-0 after:content-['']"
                          >
                            {a.policy_title}
                          </Link>
                        </h3>
                      </div>
                      <p className="flex-shrink-0 text-right">
                        <span className={cn('block whitespace-nowrap font-mono-data text-sm font-semibold', impactTone(value))}>{yearly(value)}</span>
                        <span className={cn('block text-meta', impactSign(value) === 'neutral' ? 'text-muted' : impactTone(value))}>{words}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className={cn(styles.foot, 'mt-1 flex items-baseline justify-between gap-3 pt-3')}>
              <span className="font-mono-data text-meta uppercase tracking-[0.12em] text-muted">{total.label}</span>
              <span className={cn('whitespace-nowrap font-mono-data text-base font-semibold', impactTone(total.value))}>
                {yearly(total.value)}
                <span className="sr-only"> ({impactWords(total.value)})</span>
              </span>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
