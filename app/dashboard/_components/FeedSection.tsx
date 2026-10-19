'use client';

import { ArrowRight, BookOpen, RefreshCw } from 'lucide-react';
import PolicyFeedCard, { FeedSkeletonCard } from '@/components/PolicyFeedCard';
import PolicyDocket from '@/components/feed/PolicyDocket';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { timeAgo } from '@/lib/utils';
import type { DashboardData } from './useDashboardData';

/*
 * The policy feed: the bills and laws picked for the user's profile, as the
 * docket (PolicyDocket: the cards at a little depth). Its heading, refresh,
 * loading, error and empty states are the page's as before; the cards keep
 * their own actions (analyze, view the impact, ask the guide, hide).
 */

export default function FeedSection({ feed }: { feed: DashboardData['feed'] }) {
  const { policies, loading, refreshing, updatedAt, error, needsOnboarding, headingRef } = feed;

  return (
    <section aria-labelledby="policy-feed">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2
          id="policy-feed"
          ref={headingRef}
          tabIndex={-1}
          className="scroll-mt-28 font-display text-2xl font-medium text-ink outline-none"
        >
          Policy feed
        </h2>
        <div className="flex items-center gap-3">
          {updatedAt && <span className="text-meta text-muted">Updated {timeAgo(updatedAt).toLowerCase()}</span>}
          <button
            type="button"
            onClick={() => feed.load(true)}
            disabled={refreshing || loading}
            aria-busy={refreshing || undefined}
            className="glass flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-muted transition-colors duration-200 ease-civic hover:text-ink disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'motion-safe:animate-spin' : ''}`} aria-hidden />
            {refreshing ? 'Refreshing…' : 'Refresh'}
            <span className="sr-only"> policy feed</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4" role="status">
          <span className="sr-only">Loading your policy feed…</span>
          {[0, 1, 2].map((i) => (
            <FeedSkeletonCard key={i} />
          ))}
        </div>
      ) : needsOnboarding ? (
        <EmptyState
          icon={BookOpen}
          titleAs="h3"
          title="Finish your profile first"
          body="Your feed is built from your financial profile. It takes about two minutes."
          action={
            <Button href="/onboarding" icon={<ArrowRight className="h-4 w-4" />} iconPosition="end">
              Complete profile
            </Button>
          }
        />
      ) : error ? (
        <div role="alert">
          <EmptyState
            titleAs="h3"
            title="Couldn’t load your feed"
            body={error}
            action={
              <Button variant="ghost" onClick={() => feed.load(false)}>
                Try again
              </Button>
            }
          />
        </div>
      ) : policies.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          titleAs="h3"
          title="No policies in your feed yet"
          body="Use Refresh to build your personalized feed."
        />
      ) : (
        <PolicyDocket layout="stack">
          {policies.map((policy) => (
            <PolicyFeedCard
              key={policy.id}
              policy={policy}
              analyzed={feed.analyzedIds.has(policy.id)}
              impact={feed.impactById.get(policy.id)}
              onAnalyze={feed.analyze}
              onAskAdvisor={feed.askAdvisor}
              onDismiss={feed.dismiss}
              analyzingIds={feed.analyzingIds}
              focusWhenEmptyRef={headingRef}
            />
          ))}
        </PolicyDocket>
      )}
    </section>
  );
}
