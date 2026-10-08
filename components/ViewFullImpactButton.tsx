'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

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
  /** The caller knows an analysis already exists: render a plain link, no lookup. */
  analyzed?: boolean;
  className?: string;
}

// Violet tint with primary-300 text (about 6.8:1, AA) instead of primary on primary.
const TINT = 'bg-primary/20 hover:bg-primary/30 border-primary/20 text-primary-300';
const VARIANT_STYLES: Record<NonNullable<ViewFullImpactButtonProps['variant']>, string> = {
  chat: 'mt-3 w-fit px-4 py-2.5 text-xs font-semibold border-primary/25',
  compact: 'gap-1.5 px-3 py-1.5 text-meta bg-primary/15 hover:bg-primary/25',
  card: 'w-full gap-1.5 px-3 py-2 text-xs',
};

// Shared "View Full Impact" link used in advisor chat bubbles, dashboard
// feed cards, and impact page cards. It is a real link to /impact/<id>, so it
// can be opened in a new tab; the detail page handles every state itself.
//
// On a plain click (unless `analyzed` is set):
//   1. Look up an existing analysis for (user, policy_id) in analyzed_policies.
//   2. If found -> navigate to /impact/<id> (no re-analysis).
//   3. If missing -> start a background analysis, then navigate.
//   4. If generation fails, show the reason under the link.
export default function ViewFullImpactButton({
  policyId,
  policyTitle,
  variant = 'compact',
  label = 'View Full Impact',
  analyzed = false,
  className,
}: ViewFullImpactButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = `/impact/${encodeURIComponent(policyId)}`;

  async function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // New tab/window and other modified clicks keep the browser's default.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(target);
        return;
      }

      try {
        const { data: existing, error: checkErr } = await supabase
          .from('analyzed_policies')
          .select('generation_status, analysis_title:analysis->>policyTitle, legacy:analysis->legacy')
          .eq('user_id', user.id)
          .eq('policy_id', policyId)
          .maybeSingle();
        // 42P01 = undefined_table -> treat as "no analysis yet".
        if (checkErr && (checkErr as { code?: string }).code !== '42P01') {
          console.error('View full impact lookup error:', checkErr);
        }
        // Open the detail page if there's a result or a job is already running;
        // it shows progress for a running job.
        const hasResult = !!existing?.analysis_title || !!existing?.legacy;
        if (existing && (hasResult || existing.generation_status === 'pending')) {
          router.push(target);
          return;
        }
      } catch (err) {
        console.error('View full impact lookup error:', err);
      }

      // No existing analysis -> start one (it runs in the background) and open
      // the detail page, which shows progress until it's ready.
      const res = await apiFetch('/api/analyze', { body: { policyId } });
      if (res.ok) router.push(target);
      else setError(res.message);
    } catch (err) {
      console.error('View full impact error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const iconSize = variant === 'chat' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <span className={cn('inline-flex flex-col gap-1', variant === 'card' && 'flex-1', className)}>
      <Button
        href={target}
        onClick={analyzed ? undefined : handleClick}
        aria-busy={loading || undefined}
        variant="ghost"
        size="sm"
        className={cn(TINT, VARIANT_STYLES[variant])}
        icon={loading ? <Loader2 className={`${iconSize} animate-spin`} /> : <ExternalLink className={iconSize} />}
      >
        {loading ? (variant === 'chat' ? 'Preparing analysis...' : 'Loading...') : label}
        <span className="sr-only">: {policyTitle}</span>
      </Button>
      {error && <span role="alert" className="text-meta text-red-300">{error}</span>}
    </span>
  );
}
