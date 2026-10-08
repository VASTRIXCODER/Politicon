'use client';

import { useId, useRef, useState, type RefObject } from 'react';
import { TrendingUp, MessageSquare, Check, Loader2 } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import PolicyProvenance from '@/components/PolicyProvenance';
import ViewFullImpactButton from '@/components/ViewFullImpactButton';
import { formatUSD, impactTone } from '@/lib/format';
import type { DiscoveredPolicy } from '@/types';

type FeedPolicy = DiscoveredPolicy;

const RELEVANCE_COLORS: Record<string, string> = {
  High: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  Medium: 'text-gold bg-gold/10 border-gold/20',
  Low: 'text-text-muted bg-white/5 border-white/10',
};

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
  const cardRef = useRef<HTMLDivElement>(null);
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
  return (
    // Repeated in long lists: no backdrop blur, which is costly to repaint over the animated background.
    <GlassCard ref={cardRef} data-feed-card="" className="rounded-2xl p-5 backdrop-filter-none" role="article" aria-labelledby={titleId}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-meta font-medium px-2 py-0.5 rounded-full border ${RELEVANCE_COLORS[policy.relevance] || RELEVANCE_COLORS.Low}`}>
            {policy.relevanceScore ? `${policy.relevanceScore} · ` : ''}{policy.relevance} Relevance
          </span>
          <Badge variant="default">{policy.category}</Badge>
          {analyzed && (
            <span className="text-meta font-medium px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-400/10 border-emerald-400/20 flex items-center gap-1">
              <Check className="w-3 h-3" aria-hidden /> Analyzed
            </span>
          )}
        </div>
        <span className="text-meta text-text-muted flex-shrink-0">{policy.region}</span>
      </div>
      <h3 id={titleId} data-feed-card-title="" tabIndex={-1} className="font-medium text-text-primary text-sm leading-snug mb-1 outline-none">
        {policy.billNumber && <span className="text-text-muted font-mono-data mr-1.5">{policy.billNumber}</span>}
        {policy.title}
      </h3>
      <p className="text-xs text-text-muted mb-2 leading-relaxed">{policy.description}</p>
      {analyzed && typeof impact === 'number' ? (
        <p className={`text-xs font-mono-data mb-2 ${impactTone(impact)}`}>{formatUSD(impact, { signed: true, suffix: '/yr' })} for you</p>
      ) : policy.estimatedImpact && /\$\s?\d/.test(policy.estimatedImpact) ? (
        <p className="text-xs font-mono-data text-primary-300 mb-2">{policy.estimatedImpact} est. impact</p>
      ) : policy.estimatedImpact ? (
        // e.g. "Depends on final details": words, not a figure.
        <p className="text-xs text-text-muted mb-2">Estimated impact: {policy.estimatedImpact}</p>
      ) : null}
      <div className="mb-4">
        <PolicyProvenance record={policy.record} compact />
      </div>
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
            className="flex-1 gap-1.5 px-3 py-2 text-xs bg-primary/20 hover:bg-primary/30 border-primary/20 text-primary-300"
            icon={isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze Impact'}
          </Button>
        )}
        <Button
          onClick={() => onAskAdvisor(policy)}
          aria-describedby={titleId}
          variant="ghost"
          size="sm"
          className="flex-1 gap-1.5 px-3 py-2 text-xs font-normal text-text-muted hover:text-text-primary hover:border-white/16"
          icon={<MessageSquare className="w-3 h-3" />}
        >
          Ask the Guide
        </Button>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-meta">
        {dismissError && <span role="alert" className="text-red-300">{dismissError}</span>}
        <button
          type="button"
          onClick={dismiss}
          // aria-disabled, not disabled: a disabled button drops keyboard focus mid-request.
          aria-disabled={dismissing || undefined}
          aria-describedby={titleId}
          className="text-text-muted hover:text-text-primary underline-offset-2 hover:underline aria-disabled:opacity-60 aria-disabled:cursor-not-allowed"
        >
          {dismissing ? 'Hiding…' : 'Not relevant to me'}
        </button>
      </div>
    </GlassCard>
  );
}

export function FeedSkeletonCard() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse backdrop-filter-none" aria-hidden>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-16 bg-white/10 rounded-full" />
        <div className="h-5 w-12 bg-white/10 rounded-full" />
      </div>
      <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
      <div className="h-3 bg-white/10 rounded w-full mb-1" />
      <div className="h-3 bg-white/10 rounded w-2/3 mb-4" />
      <div className="flex gap-2">
        <div className="h-9 bg-white/10 rounded-xl flex-1" />
        <div className="h-9 bg-white/10 rounded-xl flex-1" />
      </div>
    </div>
  );
}
