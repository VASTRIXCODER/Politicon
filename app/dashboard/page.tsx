'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { Layers, Newspaper } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import Skeleton from '@/components/ui/Skeleton';
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils';
import FeedSection from './_components/FeedSection';
import GreetingHeader from './_components/GreetingHeader';
import { GuidePane, InsightPane } from './_components/InsightPane';
import LedgerSkeleton from './_components/LedgerSkeleton';
import RecentAnalyses from './_components/RecentAnalyses';
import { useDashboardData } from './_components/useDashboardData';
import { ledgerHeadline } from './_components/dashboardModel';
import styles from './_components/dashboard.module.css';

/*
 * The dashboard, "Your Ledger": the greeting with the user's household as
 * its avatar; the ledger (the glass monolith of every analyzed policy beside
 * the readout of its figures); then the feed, the docket of policies picked
 * for the profile, with the portfolio insight, the receipt of recent
 * analyses and the way into the guide beside it; and a cumulative view.
 *
 * All loading, polling and actions live in useDashboardData; this file only
 * lays the sections out.
 */

const DASHBOARD_TABS = [
  { id: 'analyzed', label: 'Your feed', icon: Newspaper },
  { id: 'cumulative', label: 'Cumulative impact', icon: Layers },
] as const;

type DashboardTab = (typeof DASHBOARD_TABS)[number]['id'];

// The ledger (its poster, readout and 3D view) is the user's own data, so it
// only renders in the browser: its code loads beside the data, off the first load.
const LedgerSection = dynamic(() => import('./_components/LedgerSection'), { ssr: false, loading: () => <LedgerSkeleton /> });

// Only shown when its tab is picked.
const CumulativeView = dynamic(() => import('./_components/CumulativeView'), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid gap-6 lg:grid-cols-12">
      <span className="sr-only">Loading your cumulative impact…</span>
      <Skeleton className="h-72 lg:col-span-5" />
      <Skeleton className="h-72 lg:col-span-7" />
    </div>
  ),
});

export default function DashboardPage() {
  const data = useDashboardData();
  const { loading, analyses, totals, profile, feed } = data;
  const [activeTab, setActiveTab] = useState<DashboardTab>('analyzed');
  // The ledger's net and count for the header and the receipt (the ledger itself loads with its section).
  const headline = useMemo(() => ledgerHeadline(analyses, totals), [analyses, totals]);

  // The empty ledger's next step: the feed, on its tab, with focus on its heading.
  function goToFeed() {
    setActiveTab('analyzed');
    requestAnimationFrame(() => {
      const heading = feed.headingRef.current;
      heading?.scrollIntoView({ block: 'start' });
      heading?.focus({ preventScroll: true });
    });
  }

  return (
    <AppShell>
      {data.toast}

      <GreetingHeader loading={loading} firstName={data.firstName} profile={profile} headline={headline} />

      <LedgerSection loading={loading} analyses={analyses} totals={totals} onGoToFeed={goToFeed} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabList label="Dashboard views" className="glass mb-6 w-fit max-w-full rounded-2xl p-1">
          {DASHBOARD_TABS.map((tab) => (
            <Tab key={tab.id} value={tab.id} icon={<tab.icon className="h-3.5 w-3.5" />}>
              {tab.label}
            </Tab>
          ))}
        </TabList>

        <TabPanel value="analyzed">
          <div
            className={cn(styles.rise, 'grid items-start gap-8 lg:grid-cols-12 lg:grid-rows-[auto_1fr]')}
            style={{ '--rise-delay': '160ms' } as CSSProperties}
          >
            {/* Phones read the insight first, then the feed; from lg it heads the side column. */}
            <div className="min-w-0 lg:col-span-4 lg:col-start-9 lg:row-start-1">
              <InsightPane insight={data.portfolioInsight} loading={data.insightLoading} />
            </div>
            <div className="min-w-0 lg:col-span-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <FeedSection feed={feed} />
            </div>
            <div className="min-w-0 space-y-8 lg:col-span-4 lg:col-start-9 lg:row-start-2">
              <RecentAnalyses loading={loading} analyses={analyses} analysed={headline.analysed} />
              <GuidePane />
            </div>
          </div>
        </TabPanel>

        <TabPanel value="cumulative">
          <CumulativeView analyses={analyses} insight={data.portfolioInsight} />
        </TabPanel>
      </Tabs>
    </AppShell>
  );
}
