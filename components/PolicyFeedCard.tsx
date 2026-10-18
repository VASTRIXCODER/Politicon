'use client';

import { useId, useMemo, useRef, useState, type RefObject } from 'react';
import { TrendingUp, MessageSquare, Check, Loader2 } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Skeleton, { SkeletonText } from '@/components/ui/Skeleton';
import Spotlight from '@/components/ui/Spotlight';
import PolicyProvenance from '@/components/PolicyProvenance';
import ViewFullImpactButton from '@/components/ViewFullImpactButton';
import BillPath from '@/components/feed/BillPath';
import { ImpactChip, ReasonChips, RecordHeader, RelevanceMeter } from '@/components/feed/parts';
import { useSheetTilt } from '@/components/feed/useSheetTilt';
import styles from '@/components/feed/docket.module.css';
import { billPath } from '@/lib/billPath';
import { cn } from '@/lib/utils';
import type { DiscoveredPolicy } from '@/types';

type FeedPolicy = DiscoveredPolicy;

// Violet tint with primary-300 text (AA in both themes): the card's main action.
const TINT = 'bg-primary/10 hover:bg-primary/20 border-primary/25 text-primary-300';

/**
 * A policy in the docket: a bill sheet with its official-record header (the
 * source, the chamber it started in and a gold seal, or an "Unverified"
 * chip), the bill number and title, the plain-English summary, why it's in
 * the feed, where the bill stands (BillPath, from the record only), the
 * user's own estimate once analysed, and its actions.
 *
 * Under a mouse the sheet tilts a little and a light follows the pointer;
 * touch screens, reduced motion and "Pause motion" keep it still.
 */
export default function PolicyFeedCard({ policy, analyzed, impact, onAnalyze, onAskAdvisor, onDismiss, analyzingIds, focusWhenEmptyRef }: {
  policy: FeedPolicy;
  analyzed: boolean;
  /** The user's net annual impact, once analyzed. */
  impact?: number | null;
  onAnalyze: (_policy: FeedPolicy) => void;
  onAskAdvisor: (_policy: FeedPolicy) => void;
  onDismiss: (_policy: FeedPolicy) => Promise<string | null>;
  analyzingIds: Set<string>;
  /** Where keyboard focus goes when the last card in the list is dismissed (e.g. the list's heading). */
  focusWhenEmptyRef?: RefObject<HTMLElement | null>;
}) {
  const isAnalyzing = analyzingIds.has(policy.id);
  const [dismissing, setDismissing] = useState(false);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const titleId = useId();
  const reasonsId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const sheetRef = useSheetTilt<HTMLDivElement>();
  const path = useMemo(
    () => billPath(policy.record, { billNumber: policy.billNumber, region: policy.region }),
    [policy.record, policy.billNumber, policy.region]
  );

  async function dismiss() {
    if (dismissing) return;
    // Captured while this card is still in the list: whether it holds focus,
    // and the cards that will take its place.
    const card = cardRef.current;
    const hadFocus = !!card?.contains(document.activeElement);
    const neighbours = [card?.nextElementSibling, card?.previousElementSibling];
    setDismissing(true);
    setDismissError(null);
    const error = await onDismiss(policy);
    if (error) {
      setDismissError(error);
      setDismissing(false);
      return;
    }
    // The card is about to unmount. Keep keyboard users in place: focus the
    // next card's title (else the previous one's, else the list heading).
    if (!hadFocus) return;
    const next = neighbours.find((el): el is HTMLElement => el instanceof HTMLElement && el.isConnected && el.hasAttribute('data-feed-card'));
    (next?.querySelector<HTMLElement>('[data-feed-card-title]') ?? focusWhenEmptyRef?.current)?.focus();
  }

  const estimate = policy.estimatedImpact?.trim();

  return (
    <div ref={cardRef} data-feed-card="" data-docket-key={policy.id} className={styles.card} role="article" aria-labelledby={titleId}>
      <div ref={sheetRef} className={cn(styles.sheet, 'flex flex-col p-5 sm:p-6')}>
        <Spotlight />

        {/* The record header. */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-dashed border-fg/12 pb-3">
          <RecordHeader policy={policy} origin={path.origin} />
          <RelevanceMeter score={policy.relevanceScore} relevance={policy.relevance} />
        </div>

        <h3 id={titleId} data-feed-card-title="" tabIndex={-1} className="font-display text-lg font-medium leading-snug text-ink outline-none sm:text-xl [text-wrap:balance]">
          {policy.billNumber && (
            <span className="mb-1 block font-mono-data text-meta font-medium tracking-wide text-primary-300">{policy.billNumber}</span>
          )}
          {policy.title}
        </h3>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {policy.category && <Badge className="capitalize">{policy.category}</Badge>}
          {analyzed && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-meta font-medium text-primary-300">
              <Check className="h-3 w-3" aria-hidden /> Analyzed
            </span>
          )}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted">{policy.description}</p>

        <ReasonChips reasons={policy.reasons} id={reasonsId} className="mt-4" />

        {/* Where it stands, and where that comes from. */}
        <div className={cn(styles.record, 'mt-4 space-y-2.5 px-3.5 pb-3 pt-2.5')}>
          <BillPath path={path} />
          <PolicyProvenance record={policy.record} compact />
        </div>

        {analyzed && typeof impact === 'number' ? (
          <div className="mt-4">
            <ImpactChip impact={impact} />
          </div>
        ) : estimate && /\$\s?\d/.test(estimate) ? (
          <p className="mt-4 text-xs font-mono-data text-primary-300">{estimate} est. impact</p>
        ) : estimate ? (
          // e.g. "Depends on final details": words, not a figure.
          <p className="mt-4 text-xs text-muted">Estimated impact: {estimate}</p>
        ) : null}

        {/* The actions sit at the foot, so cards in a row line them up. */}
        <div className="mt-auto pt-4">
          <div className="flex gap-2">
            {analyzed ? (
              <ViewFullImpactButton
                policyId={policy.id}
                policyTitle={policy.title}
                category={policy.category}
                description={policy.description}
                region={policy.region}
                variant="card"
                analyzed
              />
            ) : (
              <Button
                onClick={() => onAnalyze(policy)}
                disabled={isAnalyzing}
                aria-busy={isAnalyzing || undefined}
                aria-describedby={titleId}
                variant="ghost"
                size="sm"
                className={cn('min-h-10 flex-1 gap-1.5 px-3 py-2 text-xs', TINT)}
                icon={isAnalyzing ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" /> : <TrendingUp className="h-3 w-3" />}
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze Impact'}
              </Button>
            )}
            <Button
              onClick={() => onAskAdvisor(policy)}
              aria-describedby={titleId}
              variant="ghost"
              size="sm"
              className="min-h-10 flex-1 gap-1.5 px-3 py-2 text-xs font-normal text-muted hover:text-ink"
              icon={<MessageSquare className="h-3 w-3" />}
            >
              Ask the Guide
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-meta">
            {dismissError && <span role="alert" className="text-danger">{dismissError}</span>}
            <button
              type="button"
              onClick={dismiss}
              // aria-disabled, not disabled: a disabled button drops keyboard focus mid-request.
              aria-disabled={dismissing || undefined}
              aria-describedby={titleId}
              className="min-h-6 rounded-md px-1 text-muted underline-offset-2 hover:text-ink hover:underline aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            >
              {dismissing ? 'Hiding…' : 'Not relevant to me'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A docket card while the feed loads: the same sheet, with placeholder lines. Hidden from assistive tech. */
export function FeedSkeletonCard() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={cn(styles.sheet, 'p-5 sm:p-6')}>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-dashed border-fg/12 pb-3">
          <Skeleton shape="line" className="w-40" />
          <Skeleton shape="line" className="w-24" />
        </div>
        <Skeleton shape="line" className="mb-2 w-16" />
        <Skeleton className="mb-1.5 h-5 w-4/5" />
        <Skeleton className="mb-4 h-5 w-1/2" />
        <SkeletonText lines={2} className="mb-5" />
        <Skeleton className="mb-5 h-20 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 rounded-full" />
          <Skeleton className="h-10 flex-1 rounded-full" />
        </div>
      </div>
    </div>
  );
}
