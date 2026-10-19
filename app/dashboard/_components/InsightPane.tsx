'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRight, MessageSquare, Sparkles } from 'lucide-react';
import AiDisclaimer from '@/components/ui/AiDisclaimer';
import Button from '@/components/ui/Button';
import IconTile from '@/components/ui/IconTile';
import { SkeletonText } from '@/components/ui/Skeleton';
import Surface from '@/components/ui/Surface';

/*
 * The side of the feed: the portfolio insight (the AI's short read of the
 * user's analyses, on a glass pane: prose, never a figure, so the glass
 * rule holds) and the way into the Policy Guide, a small night pane, the
 * Chamber the guide lives in.
 */

// The rating row only shows under an insight, which arrives after the page is
// usable: it loads then (fetched as soon as the insight is asked for), off
// the first load, holding its row's height meanwhile.
const FeedbackControls = dynamic(() => import('@/components/FeedbackControls'), {
  ssr: false,
  loading: () => <div className="mt-1 min-h-[26px]" />,
});

export interface InsightPaneProps {
  insight: string;
  loading: boolean;
}

export function InsightPane({ insight, loading }: InsightPaneProps) {
  useEffect(() => {
    // The same chunk next/dynamic loads, asked for early.
    if (loading) void import('@/components/FeedbackControls');
  }, [loading]);

  return (
    <section aria-labelledby="dashboard-snapshot">
      <h2 id="dashboard-snapshot" className="mb-4 font-display text-xl font-medium text-ink">
        Your policy <em>snapshot</em>
      </h2>
      {loading ? (
        <Surface variant="glass" pad="sm" role="status">
          <span className="sr-only">Generating your policy snapshot…</span>
          <SkeletonText lines={3} />
        </Surface>
      ) : insight ? (
        <Surface variant="glass" pad="md">
          <div className="flex items-start gap-3">
            <IconTile icon={Sparkles} size="sm" className="mt-0.5" />
            <p className="text-sm leading-relaxed text-ink [text-wrap:pretty]">{insight}</p>
          </div>
          <AiDisclaimer className="mt-4" />
          <FeedbackControls targetType="insight" targetId="portfolio" excerpt={insight.slice(0, 500)} className="mt-1" />
        </Surface>
      ) : (
        <Surface variant="glass" pad="sm">
          <p className="text-sm leading-relaxed text-muted">Analyze some policies to get an AI-generated portfolio insight.</p>
        </Surface>
      )}
    </section>
  );
}

export function GuidePane() {
  return (
    <Surface variant="night" as="section" aria-labelledby="dashboard-guide" pad="md" className="overflow-hidden">
      <div className="flex items-start gap-3">
        <IconTile icon={MessageSquare} size="sm" className="mt-0.5" />
        <div className="min-w-0">
          <h2 id="dashboard-guide" className="font-display text-lg font-medium text-ink">
            Your <em>Policy Guide</em>
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            AI answers about how any policy affects your specific situation.
          </p>
        </div>
      </div>
      <Button href="/advisor" variant="ghost" fullWidth className="mt-5" icon={<ArrowRight className="h-4 w-4" />} iconPosition="end">
        Ask the Policy Guide
      </Button>
    </Surface>
  );
}
