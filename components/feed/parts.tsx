import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import { formatUSD, impactSign, impactWords } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DiscoveredPolicy } from '@/types';
import styles from './docket.module.css';

/*
 * The parts of a docket card (PolicyFeedCard). Server-safe and hook-free.
 */

const SOURCE_LABEL: Record<string, string> = {
  'congress.gov': 'Congress.gov',
  openstates: 'Open States',
};

/**
 * The card's record header: where the bill comes from and the chamber it
 * started in. A point of archive gold marks a verified official record; any
 * other policy gets an "Unverified" chip instead, never the seal. The chip
 * is neutral, as on the detail page: unverified isn't wrong, and in a
 * warning colour above the card's cost amber it would read as part of the cost.
 */
export function RecordHeader({ policy, origin }: { policy: DiscoveredPolicy; origin: string | null }) {
  const verified = !!policy.record?.verified;
  const source = verified ? SOURCE_LABEL[policy.record!.source] || policy.record!.source : null;
  const where = [source, policy.region, verified ? origin : null].filter(Boolean).join(' · ');
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono-data text-meta font-medium uppercase tracking-[0.12em] text-muted">
      {verified ? (
        <span aria-hidden="true" data-decorative="" className={styles.seal} />
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-fg/20 px-2 py-px normal-case tracking-normal text-muted">
          <Info className="h-3 w-3" aria-hidden /> Unverified
        </span>
      )}
      <span className="min-w-0 break-words">
        {verified && <span className="sr-only">Official record: </span>}
        {where}
      </span>
    </p>
  );
}

/** Relevance is not money, so it never borrows the gain/loss colours or the record's gold. */
const RELEVANCE_TONE: Record<string, string> = {
  High: 'text-primary-300',
  Medium: 'text-accent',
  Low: 'text-muted',
};
const RELEVANCE_BAR: Record<string, string> = {
  High: 'bg-primary',
  Medium: 'bg-accent',
  Low: 'bg-fg/30',
};

/** How relevant the policy is to the profile: the 0–100 score on a linear bar, and its band in words. */
export function RelevanceMeter({ score, relevance }: { score: number; relevance: DiscoveredPolicy['relevance'] }) {
  const pct = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  return (
    <p className={cn('inline-flex flex-shrink-0 items-center gap-2 text-meta font-medium', RELEVANCE_TONE[relevance] ?? RELEVANCE_TONE.Low)}>
      {pct > 0 && (
        <span aria-hidden="true" data-decorative="" className="h-1 w-10 overflow-hidden rounded-full bg-fg/8">
          <span className={cn('block h-full rounded-full', RELEVANCE_BAR[relevance] ?? RELEVANCE_BAR.Low)} style={{ width: `${pct}%` }} />
        </span>
      )}
      <span>
        {pct > 0 ? <span className="font-mono-data">{pct} · </span> : null}
        {relevance} relevance
      </span>
    </p>
  );
}

/** Why the policy is in this person's feed: the reasons the feed gave, as chips (up to three). */
export function ReasonChips({ reasons, id, className }: { reasons: string[] | undefined; id: string; className?: string }) {
  const list = (Array.isArray(reasons) ? reasons : []).filter((r): r is string => typeof r === 'string' && r.trim() !== '').slice(0, 3);
  if (!list.length) return null;
  return (
    <div className={className}>
      <p id={id} className="mb-1.5 font-mono-data text-meta uppercase tracking-[0.12em] text-muted">
        Why it&apos;s in your feed
      </p>
      <ul aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {list.map((reason) => (
          <li key={reason} className="inline-flex items-start gap-1.5 rounded-full border border-fg/8 bg-fg/4 px-2.5 py-1 text-meta text-ink/85">
            <span aria-hidden="true" className="mt-[0.3rem] h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

const IMPACT_TONE = {
  gain: 'border-gain/25 bg-gain-fill/10 text-gain',
  loss: 'border-loss/25 bg-loss-fill/10 text-loss',
  neutral: 'border-fg/12 bg-fg/4 text-muted',
} as const;
const IMPACT_ICON = { gain: ArrowUpRight, loss: ArrowDownRight, neutral: Minus } as const;

/**
 * The user's own estimate once a policy is analysed: the signed yearly
 * figure (teal for a gain, amber for a cost) and the direction in words, so
 * colour is never the only cue.
 */
export function ImpactChip({ impact }: { impact: number }) {
  const sign = impactSign(impact);
  const Icon = IMPACT_ICON[sign];
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <p className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono-data text-sm font-semibold', IMPACT_TONE[sign])}>
        <Icon aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.25} />
        {formatUSD(impact, { signed: true, suffix: '/yr' })} for you
      </p>
      <span className="text-meta text-muted">
        Your estimate · {sign === 'neutral' ? 'no change' : `${impactWords(impact)} money`}
      </span>
    </div>
  );
}
