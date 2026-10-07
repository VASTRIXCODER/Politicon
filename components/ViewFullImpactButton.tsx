'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api';

interface ViewFullImpactButtonProps {
  policyId: string;
  policyTitle: string;
  /** Display-only metadata; the server resolves policy details from the user's feed. */
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
//   3. If missing -> start a background analysis, then navigate.
//   4. If generation fails, show the reason under the button.
export default function ViewFullImpactButton({
  policyId,
  variant = 'compact',
  label = 'View Full Impact',
}: ViewFullImpactButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setError(null);
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

      // No existing analysis -> start one (it runs in the background) and open
      // the detail page, which shows progress until it's ready.
      const res = await apiFetch('/api/analyze', { body: { policyId } });
      if (res.ok) router.push(target);
      else setError(res.message);
    } catch (e) {
      console.error('View full impact error:', e);
      setError('Something went wrong. Please try again.');
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
    <span className="inline-flex flex-col gap-1">
      <button onClick={handleClick} disabled={loading} className={styles[variant]}>
        {loading ? <Loader2 className={`${iconSize} animate-spin`} /> : <ExternalLink className={iconSize} />}
        {loading ? (variant === 'chat' ? 'Preparing analysis...' : 'Loading...') : label}
      </button>
      {error && <span role="alert" className="text-[11px] text-red-300">{error}</span>}
    </span>
  );
}
