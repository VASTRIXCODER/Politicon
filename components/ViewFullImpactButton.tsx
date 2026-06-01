'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ViewFullImpactButtonProps {
  policyId: string;
  policyTitle: string;
  category?: string;
  description?: string;
  region?: string;
  // Visual variant so the shared component can match each surface it's used on.
  variant?: 'chat' | 'compact' | 'card';
  label?: string;
}

// Shared "View Full Impact" pipeline used in advisor chat bubbles, dashboard
// feed cards, and impact page cards.
//
// On click:
//   1. Look up an existing analysis for (user, policy_id) in analyzed_policies.
//   2. If found -> navigate to /impact/<id> (no re-analysis).
//   3. If missing -> POST /api/analyze (which upserts), then navigate.
// All errors are swallowed to the console; the user never sees a raw error.
export default function ViewFullImpactButton({
  policyId,
  policyTitle,
  category,
  description,
  region,
  variant = 'compact',
  label = 'View Full Impact',
}: ViewFullImpactButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const target = `/impact/${encodeURIComponent(policyId)}`;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(target);
        return;
      }

      try {
        const { data: existing, error: checkErr } = await supabase
          .from('analyzed_policies')
          .select('id')
          .eq('user_id', user.id)
          .eq('policy_id', policyId)
          .maybeSingle();
        // 42P01 = undefined_table -> treat as "no analysis yet".
        if (checkErr && (checkErr as { code?: string }).code !== '42P01') {
          console.error('View full impact lookup error:', checkErr);
        }
        if (existing) {
          router.push(target);
          return;
        }
      } catch (e) {
        console.error('View full impact lookup error:', e);
      }

      // No existing analysis -> generate it, then navigate.
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: {
            id: policyId,
            title: policyTitle,
            summary: description || policyTitle,
            description: description || policyTitle,
            category: category || 'General',
            status: 'proposed',
            date: new Date().toISOString(),
            source: 'Politicon',
            sourceUrl: '',
            governingBody: region || 'Federal',
            region: region || 'Federal',
            confidenceLevel: 'medium',
            impacts: [],
            assumptions: [],
            tags: [],
          },
        }),
      });
      if (!res.ok) console.error('Analyze request failed with status', res.status);
      await res.json().catch(() => null);
      router.push(target);
    } catch (e) {
      console.error('View full impact error:', e);
      router.push(`/impact/${encodeURIComponent(policyId)}`);
    } finally {
      setLoading(false);
    }
  }

  const styles: Record<string, string> = {
    chat: 'mt-3 flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/25 text-primary px-4 py-2.5 rounded-xl text-xs font-semibold transition-all w-fit disabled:opacity-60 disabled:cursor-not-allowed',
    compact: 'flex items-center gap-1.5 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary px-3 py-1.5 rounded-xl text-[10px] font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed',
    card: 'flex-1 flex items-center justify-center gap-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed',
  };
  const iconSize = variant === 'chat' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <button onClick={handleClick} disabled={loading} className={styles[variant]}>
      {loading ? <Loader2 className={`${iconSize} animate-spin`} /> : <ExternalLink className={iconSize} />}
      {loading ? (variant === 'chat' ? 'Preparing analysis...' : 'Loading...') : label}
    </button>
  );
}
