'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X, RefreshCw } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';
import GlassCard from '@/components/ui/GlassCard';
import PolicyFeedCard, { FeedSkeletonCard } from '@/components/PolicyFeedCard';
import { useToast } from '@/components/ui/Toast';
import { apiFetch } from '@/lib/api';
import { requestAnalysis } from '@/lib/analysisClient';
import { createClient } from '@/lib/supabase/client';
import type { DiscoveredPolicy } from '@/types';

const POLL_MS = 5000;
const POLL_ATTEMPTS = 60; // ~5 minutes

type Show = 'all' | 'analyzed' | 'not_analyzed';
const SHOW_LABELS: Record<Show, string> = { all: 'All', analyzed: 'Analyzed', not_analyzed: 'Not analyzed yet' };

/**
 * Every policy in the user's personalized feed, searchable and filterable.
 * Policies come from official records (see the dashboard to refresh the feed).
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
          timer.current = setTimeout(() => loadFeed(attempt + 1), POLL_MS);
          return;
        }
        fail('Your feed is taking longer than usual. Please check back in a few minutes.');
      }
    } else if (res.code === 'needs_onboarding') {
      router.replace('/onboarding');
      return;
    } else if (attempt > 0 && attempt < POLL_ATTEMPTS && (res.status === 0 || res.status === 429 || (res.status >= 500 && res.code !== 'feed_failed'))) {
      // A blip while waiting for a refresh: keep checking.
      timer.current = setTimeout(() => loadFeed(attempt + 1), POLL_MS);
      return;
    } else {
      fail(res.message);
    }
    setPreparing(false);
    setLoading(false);
  }

  useEffect(() => {
    abort.current = new AbortController();
    loadFeed();
    loadImpacts();
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
    const res = await requestAnalysis(policy.id, { signal: abort.current?.signal });
    if (abort.current?.signal.aborted) return;
    if (res.ok) {
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
    setPolicies((prev) => prev.filter((p) => p.id !== policy.id));
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

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      {toast}
      <div className="relative z-10">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
          <header className="mb-8">
            <h1 className="font-display text-3xl font-bold text-text-primary mb-2">Your policies</h1>
            <p className="text-text-muted max-w-2xl">
              Bills and laws from official records that are most relevant to your profile. Analyze one to see what it could mean for your
              finances. To get newer policies, refresh your feed on the <Link href="/dashboard" className="text-primary hover:underline underline-offset-2">dashboard</Link>.
            </p>
          </header>

          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <label htmlFor="policy-search" className="sr-only">Search your policies</label>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
              <input
                id="policy-search"
                type="search"
                placeholder="Search by title, bill number or topic…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-glass w-full pl-11 pr-10 py-3.5 text-base sm:text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div role="group" aria-label="Show" className="flex gap-1 glass rounded-2xl p-1 w-fit">
              {(Object.keys(SHOW_LABELS) as Show[]).map((k) => (
                <button
                  key={k}
                  aria-pressed={show === k}
                  onClick={() => setShow(k)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${show === k ? 'bg-primary/20 text-primary border border-primary/20' : 'text-text-muted hover:text-text-primary'}`}
                >
                  {SHOW_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {categories.length > 2 && (
            <div role="group" aria-label="Category" className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat}
                  aria-pressed={category === cat}
                  onClick={() => setCategory(cat)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                    category === cat ? 'bg-primary/20 border-primary/40 text-primary' : 'glass border-white/8 text-text-muted hover:text-text-primary'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {preparing && (
            <p role="status" className="mb-6 flex items-center gap-2 text-sm text-text-muted">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" aria-hidden /> Updating your feed from official records…
            </p>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => <FeedSkeletonCard key={i} />)}
            </div>
          ) : error && policies.length === 0 ? (
            <GlassCard className="rounded-2xl p-10 text-center">
              <h2 className="font-medium text-text-primary mb-2">We couldn&apos;t load your policies</h2>
              <p role="alert" className="text-sm text-text-muted mb-6">{error}</p>
              <button onClick={() => loadFeed()} className="bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-2.5 rounded-xl text-sm font-medium">
                Try again
              </button>
            </GlassCard>
          ) : policies.length === 0 ? (
            <GlassCard className="rounded-2xl p-10 text-center">
              <h2 className="font-medium text-text-primary mb-2">No policies in your feed yet</h2>
              <p className="text-sm text-text-muted mb-6">Build your personalized feed from the dashboard.</p>
              <Link href="/dashboard" className="inline-block bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-2.5 rounded-xl text-sm font-medium">
                Go to the dashboard
              </Link>
            </GlassCard>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-text-muted mb-4">No policies match these filters.</p>
              <button onClick={() => { setSearch(''); setCategory('All'); setShow('all'); }} className="text-sm text-primary hover:underline underline-offset-2">
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-text-muted mb-4" aria-live="polite">
                Showing {filtered.length} of {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
