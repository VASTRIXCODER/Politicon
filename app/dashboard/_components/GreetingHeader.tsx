'use client';

import dynamic from 'next/dynamic';
import { MessageSquare, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { dayPart, ledgerSummary, type DashboardProfileRow } from './dashboardModel';
import styles from './dashboard.module.css';

/*
 * The dashboard's masthead: the date, the greeting (the page's h1, in
 * Fraunces with the name as its italic accent), one honest line on what the
 * analyzed policies add up to, and the two ways in (analyze a policy, ask
 * the guide). The user's household stands beside it as their avatar (the
 * diorama they built in onboarding), when the profile says enough to draw it.
 *
 * Rendered only in the browser once the profile has loaded (the greeting
 * reads the visitor's clock), so the server sends the skeleton.
 */

/** The avatar's width: 96px on phones, 160px (its md size) from sm up. */
const AVATAR_BOX = 'w-24 flex-shrink-0 sm:w-40';

export interface GreetingHeaderProps {
  loading: boolean;
  firstName: string;
  profile: DashboardProfileRow | null;
  /** What the ledger adds up to (dashboardModel.ts ledgerHeadline). */
  headline: { analysed: number; net: number };
}

// Drawn only once the profile is in (in the browser), so its poster and scene stay off the first load.
const DashboardAvatar = dynamic(() => import('./DashboardAvatar'), {
  ssr: false,
  loading: () => <Skeleton shape="circle" className={AVATAR_BOX} />,
});

const today = () => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

export default function GreetingHeader({ loading, firstName, profile, headline }: GreetingHeaderProps) {
  if (loading) {
    return (
      <div className="mb-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6" role="status">
        <span className="sr-only">Loading your dashboard…</span>
        <Skeleton shape="circle" className={AVATAR_BOX} />
        <div className="w-full min-w-0 flex-1">
          <Skeleton shape="line" className="mb-4 w-40" />
          <Skeleton className="mb-3 h-10 w-full max-w-sm" />
          <Skeleton shape="line" className="w-full max-w-md" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(styles.rise, 'mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10')}>
      {/* On a phone the household stands above the greeting, so the h1 keeps the full width. */}
      <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
        {/* Only a profile with its housing answered can be drawn (DashboardAvatar checks the rest). */}
        {profile?.housing_situation && <DashboardAvatar profile={profile} className="max-sm:-ml-2 max-sm:w-24" />}
        <div className="min-w-0">
          <p className="mb-3 inline-flex items-center gap-2.5 font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-primary-300">
            {/* A point of violet light, like a status lamp (as on PageHeader). */}
            <span
              aria-hidden="true"
              data-decorative=""
              className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_rgb(var(--c-violet)/0.18),0_0_12px_rgb(var(--c-glow)/0.9)]"
            />
            {today()}
          </p>
          <h1 className="text-display-sm font-display font-medium text-ink [overflow-wrap:anywhere] [text-wrap:balance]">
            Good {dayPart(new Date().getHours())}, <em className="capitalize">{firstName}</em>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base [text-wrap:pretty]">{ledgerSummary(headline)}</p>
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
        <Button href="/advisor" icon={<Search className="h-4 w-4" />}>
          Analyze a Policy
        </Button>
        <Button href="/advisor" variant="ghost" icon={<MessageSquare className="h-4 w-4" />}>
          Ask the Policy Guide
        </Button>
      </div>
    </div>
  );
}
