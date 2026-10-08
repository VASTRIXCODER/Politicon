'use client';

import { useState } from 'react';
import { TrendingUp, MessageSquare, Check, Loader2 } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import PolicyProvenance from '@/components/PolicyProvenance';
import ViewFullImpactButton from '@/components/ViewFullImpactButton';
import { formatUSD, impactTone } from '@/lib/format';
import type { DiscoveredPolicy } from '@/types';

type FeedPolicy = DiscoveredPolicy;

const RELEVANCE_COLORS: Record<string, string> = {
  High: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  Medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  Low: 'text-text-muted bg-white/5 border-white/10',
};

export default function PolicyFeedCard({ policy, analyzed, impact, onAnalyze, onAskAdvisor, onDismiss, analyzingIds }: {
  policy: FeedPolicy;
  analyzed: boolean;
  /** The user's net annual impact, once analyzed. */
  impact?: number | null;
  onAnalyze: (_policy: FeedPolicy) => void;
  onAskAdvisor: (_policy: FeedPolicy) => void;
  onDismiss: (_policy: FeedPolicy) => Promise<string | null>;
  analyzingIds: Set<string>;
}) {
  const isAnalyzing = analyzingIds.has(policy.id);
  const [dismissing, setDismissing] = useState(false);
  const [dismissError, setDismissError] = useState<string | null>(null);
  async function dismiss() {
    setDismissing(true);
    setDismissError(null);
    const error = await onDismiss(policy);
    if (error) {
      setDismissError(error);
      setDismissing(false);
    }
  }
  return (
    <GlassCard className="rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${RELEVANCE_COLORS[policy.relevance] || RELEVANCE_COLORS.Low}`}>
            {policy.relevanceScore ? `${policy.relevanceScore} · ` : ''}{policy.relevance} Relevance
          </span>
          <Badge variant="default">{policy.category}</Badge>
          {analyzed && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-400/10 border-emerald-400/20 flex items-center gap-1">
              <Check className="w-2.5 h-2.5" /> Analyzed
            </span>
          )}
        </div>
        <span className="text-[10px] text-text-muted flex-shrink-0">{policy.region}</span>
      </div>
      <h3 className="font-medium text-text-primary text-sm leading-snug mb-1">
        {policy.billNumber && <span className="text-text-muted font-mono-data mr-1.5">{policy.billNumber}</span>}
        {policy.title}
      </h3>
      <p className="text-xs text-text-muted mb-2 leading-relaxed">{policy.description}</p>
      {analyzed && typeof impact === 'number' ? (
        <p className={`text-xs font-mono-data mb-2 ${impactTone(impact)}`}>{formatUSD(impact, { signed: true, suffix: '/yr' })} for you</p>
      ) : policy.estimatedImpact && /\$\s?\d/.test(policy.estimatedImpact) ? (
        <p className="text-xs font-mono-data text-primary mb-2">{policy.estimatedImpact} est. impact</p>
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
          />
        ) : (
          <button
            onClick={() => onAnalyze(policy)}
            disabled={isAnalyzing}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
            {isAnalyzing ? 'Analyzing...' : 'Analyze Impact'}
          </button>
        )}
        <button
          onClick={() => onAskAdvisor(policy)}
          className="flex-1 flex items-center justify-center gap-1.5 glass hover:border-white/16 text-text-muted px-3 py-2 rounded-xl text-xs transition-all"
        >
          <MessageSquare className="w-3 h-3" /> Ask the Guide
        </button>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[11px]">
        {dismissError && <span role="alert" className="text-red-300">{dismissError}</span>}
        <button
          onClick={dismiss}
          disabled={dismissing}
          className="text-text-muted hover:text-text-primary underline-offset-2 hover:underline disabled:opacity-60"
        >
          {dismissing ? 'Hiding…' : 'Not relevant to me'}
        </button>
      </div>
    </GlassCard>
  );
}

export function FeedSkeletonCard() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse">
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
