'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, SearchX, X, RefreshCw, BookOpen, ArrowRight } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Surface from '@/components/ui/Surface';
import PolicyFeedCard, { FeedSkeletonCard } from '@/components/PolicyFeedCard';
import PolicyDocket from '@/components/feed/PolicyDocket';
import { useToast } from '@/components/ui/Toast';
import { apiFetch } from '@/lib/api';
import { requestAnalysis } from '@/lib/analysisClient';
import { policyCategory, track } from '@/lib/track';
import { createClient } from '@/lib/supabase/client';
import { getCategoryIcon } from '@/lib/categoryIcons';
import { cn } from '@/lib/utils';
import type { DiscoveredPolicy } from '@/types';

const POLL_MS = 5000;
const POLL_ATTEMPTS = 60; // ~5 minutes

type Show = 'all' | 'analyzed' | 'not_analyzed';
const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'analyzed', label: 'Analyzed' },
  { value: 'not_analyzed', label: 'Not analyzed' },
];

/** The same grid the docket lays its cards out on (components/feed/PolicyDocket, layout="grid"). */
const GRID = 'grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 xl:grid-cols-3';

/**
 * Every policy in the user's personalized feed, searchable and filterable,
 * as a docket of bill sheets. Policies come from official records (see the
 * dashboard to refresh the feed).
 */
export default function PoliciesPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [policies, setPolicies] = useState<DiscoveredPolicy[]>([]);
  const [impacts, setImpacts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [show, setShow] = useState<Show>('all');
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const policyCount = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  // The page title takes focus when the list it heads goes away (the last card hidden, filters cleared).
  const headingRef = useRef<HTMLSpanElement>(null);
  useEffect(() => { policyCount.current = policies.length; }, [policies]);

  async function loadImpacts() {
    // Same rule as the dashboard and /impact: a policy is analyzed once it has a
    // stored result, even while a re-analysis is running or after one failed.
    const { data } = await createClient()
      .from('policy_analyses')
      .select('policy_id, dollar_impact');
    setImpacts(new Map((data || []).map((r) => [r.policy_id as string, Number(r.dollar_impact) || 0])));
  }

  /** With a feed on screen, an error is a toast; otherwise it replaces the (empty) list. */
  function fail(message: string) {
    if (policyCount.current > 0) showToast(message, 'error');
    else setError(message);
  }

  async function loadFeed(attempt = 0) {
    const signal = abort.current?.signal;
    if (timer.current) clearTimeout(timer.current);
    if (attempt === 0) { setLoading(true); setError(null); }
    const res = await apiFetch<{ policies?: DiscoveredPolicy[]; generating?: boolean }>('/api/policies/feed', { signal });
    if (signal?.aborted) return;
    if (res.ok) {
      if (Array.isArray(res.data.policies)) setPolicies(res.data.policies);
      if (res.status === 202) {
        setPreparing(true);
        if (attempt < POLL_ATTEMPTS) {
          if (res.data.policies?.length) setLoading(false);
          timer.current = setTimeout(() => { void loadFeed(attempt + 1); }, POLL_MS);
          return;
        }
        fail('Your feed is taking longer than usual. Please check back in a few minutes.');
      }
    } else if (res.code === 'needs_onboarding') {
      router.replace('/onboarding');
      return;
    } else if (attempt > 0 && attempt < POLL_ATTEMPTS && (res.status === 0 || res.status === 429 || (res.status >= 500 && res.code !== 'feed_failed'))) {
      // A blip while waiting for a refresh: keep checking.
      timer.current = setTimeout(() => { void loadFeed(attempt + 1); }, POLL_MS);
      return;
    } else {
      fail(res.message);
    }
    setPreparing(false);
    setLoading(false);
  }

  useEffect(() => {
    abort.current = new AbortController();
    void loadFeed();
    void loadImpacts();
    return () => {
      abort.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    };
    // Runs once per mount; loadFeed reads only refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAnalyze(policy: DiscoveredPolicy) {
    if (analyzingIds.has(policy.id)) return;
    setAnalyzingIds((prev) => new Set(prev).add(policy.id));
    const category = policyCategory(policy.category);
    track('analysis_requested', { source: 'policies', category });
    const res = await requestAnalysis(policy.id, { signal: abort.current?.signal });
    if (abort.current?.signal.aborted) return;
    if (res.ok) {
      track('analysis_ready', { source: 'policies', category, status: res.fresh ? 'fresh' : 'cached' });
      setImpacts((prev) => new Map(prev).set(policy.id, res.analysis.netAnnualImpact));
      showToast(`Analysis ready for “${policy.title}”.`);
    } else if (!res.cancelled) {
      showToast(res.message, 'error');
    }
    setAnalyzingIds((prev) => {
      const next = new Set(prev);
      next.delete(policy.id);
      return next;
    });
  }

  async function handleDismiss(policy: DiscoveredPolicy): Promise<string | null> {
    const res = await apiFetch('/api/feedback', { body: { targetType: 'feed_item', targetId: policy.id, rating: 'not_relevant' } });
    if (!res.ok) return res.message;
    track('policy_dismissed', { source: 'policies', category: policyCategory(policy.category) });
    setPolicies((prev) => prev.filter((p) => p.id !== policy.id));
    showToast(`Hidden “${policy.title}” from your feed.`);
    return null;
  }

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(policies.map((p) => p.category).filter(Boolean))).sort()],
    [policies],
  );
  // A chosen category can leave the feed (dismissed, or a refresh); fall back to All.
  useEffect(() => {
    if (category !== 'All' && !categories.includes(category)) setCategory('All');
  }, [categories, category]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return policies.filter((p) => {
      if (category !== 'All' && p.category !== category) return false;
      const analyzed = impacts.has(p.id);
      if (show === 'analyzed' && !analyzed) return false;
      if (show === 'not_analyzed' && analyzed) return false;
      if (!q) return true;
      return [p.title, p.description, p.billNumber, p.region, p.category]
        .some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
    });
  }, [policies, impacts, search, category, show]);

  // The docket's ledger line: counts of what's actually in the feed.
  const analyzedCount = useMemo(() => policies.filter((p) => impacts.has(p.id)).length, [policies, impacts]);
  const officialCount = useMemo(() => policies.filter((p) => p.record?.verified).length, [policies]);

  function clearFilters() {
    setSearch('');
    setCategory('All');
    setShow('all');
  }

  // Read out by one status region that stays mounted, so a search that matches
  // nothing (and the results coming back) is announced as it changes.
  const noMatches = !loading && policies.length > 0 && filtered.length === 0;
  const resultsStatus = loading || policies.length === 0
    ? ''
    : noMatches
      ? 'No policies match these filters.'
      : `Showing ${filtered.length} of ${policies.length} ${policies.length === 1 ? 'policy' : 'policies'}`;

  return (
    <AppShell>
      {toast}
      <PageHeader
        eyebrow="Your docket"
        title={
          <span ref={headingRef} tabIndex={-1} className="rounded-md">
            Your <em>policies</em>
          </span>
        }
        lede={
          <p>
            Bills and laws from official records that are most relevant to your profile. Analyze one to see what it could mean for your
            finances. To get newer policies, refresh your feed on the{' '}
            <Link href="/dashboard" className="text-primary-300 underline decoration-primary/30 underline-offset-2 hover:decoration-primary">dashboard</Link>.
          </p>
        }
        actions={
          !loading && policies.length > 0 ? (
            <dl className="grid grid-cols-3 gap-x-6 gap-y-1 font-mono-data">
              {[
                ['In your feed', policies.length],
                ['Analyzed', analyzedCount],
                ['Official records', officialCount],
              ].map(([label, value]) => (
                // Number above its label (dd first on screen), the numbers in one row even when a label wraps on a phone.
                <div key={label} className="flex flex-col-reverse justify-end">
                  <dt className="text-meta uppercase tracking-[0.12em] text-muted">{label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          ) : undefined
        }
      />

      {/* The filter bar: glass, because it's a control (the docket's paper holds the content). */}
      <Surface variant="glass" pad="none" className="mb-6 mt-10 flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="policy-search" className="sr-only">Search your policies</label>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              ref={searchRef}
              id="policy-search"
              type="search"
              placeholder="Search title, bill or topic…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-glass w-full rounded-full py-3 pl-11 pr-10 text-base sm:text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-fg/5 hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
          <SegmentedControl label="Show" options={SHOW_OPTIONS} value={show} onValueChange={setShow} size="sm" className="self-start lg:self-auto" />
        </div>

        {categories.length > 2 && (
          <div role="group" aria-label="Category" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
            {categories.map((cat) => {
              const Icon = cat === 'All' ? null : getCategoryIcon(cat);
              const on = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'inline-flex min-h-8 flex-shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors duration-200 ease-civic',
                    on ? 'border-primary bg-raised text-ink shadow-[0_6px_16px_-8px_rgb(var(--c-violet)/0.45)]' : 'border-fg/10 bg-fg/4 text-muted hover:border-fg/20 hover:text-ink'
                  )}
                >
                  {Icon && <Icon className={cn('h-3.5 w-3.5', on && 'text-primary-300')} aria-hidden />}
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </Surface>

      {preparing && (
        <p role="status" className="mb-6 flex items-center gap-2 text-sm text-muted">
          <RefreshCw className="h-4 w-4 text-primary motion-safe:animate-spin" aria-hidden /> Updating your feed from official records…
        </p>
      )}

      <h2 className="sr-only">Policies in your feed</h2>
      <p role="status" className={noMatches ? 'sr-only' : 'mb-4 text-xs text-muted empty:mb-0'}>
        {resultsStatus}
      </p>

      {loading ? (
        <div role="status" aria-busy="true" className={GRID}>
          <span className="sr-only">Loading your policies…</span>
          {[0, 1, 2, 3, 4, 5].map((i) => <FeedSkeletonCard key={i} />)}
        </div>
      ) : error && policies.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          tone="neutral"
          title="We couldn’t load your policies"
          body={<p role="alert">{error}</p>}
          action={
            <Button onClick={() => loadFeed()} variant="ghost" size="sm">
              Try again
            </Button>
          }
        />
      ) : policies.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No policies in your feed yet"
          body="Build your personalized feed from the dashboard."
          action={
            <Button href="/dashboard" icon={<ArrowRight className="h-4 w-4" />} iconPosition="end">
              Go to the dashboard
            </Button>
          }
        />
      ) : noMatches ? (
        <EmptyState
          icon={SearchX}
          tone="neutral"
          titleAs="p"
          title="No policies match these filters"
          body="Try another search or category, or clear the filters to see your whole feed."
          action={
            <Button
              variant="ghost"
              size="sm"
              // This button leaves with the empty state; the page title keeps focus in place.
              onClick={() => { clearFilters(); headingRef.current?.focus(); }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <PolicyDocket layout="grid">
          {filtered.map((policy) => (
            <PolicyFeedCard
              key={policy.id}
              policy={policy}
              analyzed={impacts.has(policy.id)}
              impact={impacts.get(policy.id)}
              onAnalyze={handleAnalyze}
              onAskAdvisor={(p) => router.push(`/advisor?policyId=${encodeURIComponent(p.id)}`)}
              onDismiss={handleDismiss}
              analyzingIds={analyzingIds}
              focusWhenEmptyRef={headingRef}
            />
          ))}
        </PolicyDocket>
      )}
    </AppShell>
  );
}
