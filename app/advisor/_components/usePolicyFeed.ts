'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { DiscoveredPolicy } from '@/types';

/** How often a feed that is still being built is checked again, and for how long. */
const POLL_MS = 5000;
const MAX_ATTEMPTS = 60;

/**
 * The user's personalized policy feed (cached server-side). A 202 means it
 * is being built in the background: show what we have and check back. On an
 * error, keep any feed already shown.
 */
export function usePolicyFeed(): { feed: DiscoveredPolicy[]; feedLoading: boolean } {
  const [feed, setFeed] = useState<DiscoveredPolicy[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const wait = (ms: number) => new Promise<boolean>(resolve => {
      const t = setTimeout(() => resolve(true), ms);
      signal.addEventListener('abort', () => { clearTimeout(t); resolve(false); }, { once: true });
    });
    async function loadFeed() {
      setFeedLoading(true);
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !signal.aborted; attempt++) {
        const res = await apiFetch<{ policies?: DiscoveredPolicy[] }>('/api/policies/feed', { signal });
        if (signal.aborted) return;
        if (res.ok && Array.isArray(res.data.policies) && res.data.policies.length > 0) {
          setFeed(res.data.policies);
          setFeedLoading(false);
        }
        if (res.ok && res.status === 202) {
          if (!(await wait(POLL_MS))) return;
          continue;
        }
        // On an error, keep any feed already shown.
        break;
      }
      if (!signal.aborted) setFeedLoading(false);
    }
    void loadFeed();
    return () => controller.abort();
  }, []);

  return { feed, feedLoading };
}
