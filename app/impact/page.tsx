'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import PolicyReceipt from '@/components/impact/receipt/PolicyReceipt';
import type { ReceiptOrder } from '@/components/impact/receipt/receiptModel';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import Skeleton from '@/components/ui/Skeleton';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import AnalysisBody from './_components/AnalysisBody';
import Methodology from './_components/Methodology';
import { LoadFailed, NoAnalyses, RECEIPT_COLUMN, RECEIPT_GRID, ReceiptSkeleton, SKYLINE_COLUMN, SkylineSkeleton } from './_components/ImpactStates';
import { sortRows, type ImpactTab } from './_components/impactModel';
import { useImpactList } from './_components/useImpactList';

/*
 * My Impact (/impact): "Your Policy Receipt" beside "The Skyline". The
 * receipt itemizes every analyzed policy (its signed yearly estimate, the
 * subtotals of what saves and what costs you, the net at the foot) and
 * prints on its first view; the skyline beside it stands each policy up as
 * a glass tower whose height is its own cumulative estimate after 1, 3 or
 * 5 years. The two share one focus, so pointing at a line lights its tower.
 * The Cumulative analysis tab combines a selection of them.
 *
 * All loading lives in useImpactList; the skyline and the cumulative tab
 * load with next/dynamic, off the first-load bundle.
 */

const SkylineSection = dynamic(() => import('@/components/impact/receipt/SkylineSection'), {
  ssr: false,
  loading: () => <SkylineSkeleton />,
});

// Only shown when its tab is picked.
const CumulativeView = dynamic(() => import('./_components/CumulativeView'), {
  ssr: false,
  loading: () => <CumulativeSkeleton />,
});

const TABS: { value: ImpactTab; label: string }[] = [
  { value: 'individual', label: 'Your receipt' },
  { value: 'cumulative', label: 'Cumulative analysis' },
];

function CumulativeSkeleton({ label = 'Loading your cumulative impact…' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" className="space-y-8">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-48 w-full rounded-[2rem]" />
      <div className="grid gap-8 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

function ImpactContent() {
  const searchParams = useSearchParams();
  const policyParam = searchParams.get('policy');
  const data = useImpactList(policyParam);
  const { analyses, loading, failed, openId, setOpenId } = data;

  const [tab, setTab] = useState<ImpactTab>('individual');
  const [order, setOrder] = useState<ReceiptOrder>('impact');
  const [focus, setFocus] = useState<string | null>(null);
  // The receipt prints the first time it's shown on a visit, not each time its tab comes back.
  const [printed, setPrinted] = useState(false);

  const sorted = useMemo(() => sortRows(analyses, order), [analyses, order]);
  const byId = useMemo(() => new Map(analyses.map((a) => [a.id, a])), [analyses]);
  const showReceipt = tab === 'individual' && !loading && !failed && analyses.length > 0;

  useEffect(() => {
    if (showReceipt && !printed) setPrinted(true);
  }, [showReceipt, printed]);

  // The ?policy= deep link: once its line is open, bring it into view.
  useEffect(() => {
    if (!policyParam || loading || !openId) return;
    const el = document.querySelector(`[data-receipt-line="${CSS.escape(openId)}"]`);
    el?.scrollIntoView({ block: 'center' });
    // Only on arrival, not each time a line is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyParam, loading]);

  const toggle = useCallback((id: string) => setOpenId((current) => (current === id ? null : id)), [setOpenId]);
  const details = useCallback(
    (id: string) => {
      const row = byId.get(id);
      return row ? <AnalysisBody row={row} headingTag="h4" /> : null;
    },
    [byId]
  );

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabList label="Impact views" className="glass mb-8 w-fit max-w-full rounded-2xl p-1">
        {TABS.map((t) => (
          <Tab key={t.value} value={t.value} className="px-5 py-2.5">
            {t.label}
          </Tab>
        ))}
      </TabList>

      <TabPanel value="individual">
        {loading ? (
          <ReceiptSkeleton />
        ) : failed ? (
          <LoadFailed onRetry={data.reload} />
        ) : analyses.length === 0 ? (
          <NoAnalyses />
        ) : (
          <>
            <div className={RECEIPT_GRID}>
              <div className={RECEIPT_COLUMN}>
                <PolicyReceipt
                  lines={sorted}
                  order={order}
                  onOrderChange={setOrder}
                  openId={openId}
                  onToggle={toggle}
                  details={details}
                  focus={focus}
                  onFocus={setFocus}
                  print={!printed}
                />
              </div>
              <div className={SKYLINE_COLUMN}>
                <SkylineSection rows={sorted} focus={focus} onFocus={setFocus} />
              </div>
            </div>
            <Methodology />
          </>
        )}
      </TabPanel>

      <TabPanel value="cumulative">
        {loading ? (
          <CumulativeSkeleton label="Loading your analyses…" />
        ) : failed ? (
          <LoadFailed onRetry={data.reload} />
        ) : analyses.length === 0 ? (
          <EmptyState
            title="No analyses yet"
            body="Analyze some policies first to see cumulative impact."
            action={
              <Button href="/dashboard" variant="primary" size="sm">
                Go to Dashboard
              </Button>
            }
          />
        ) : (
          <CumulativeView
            analyses={analyses}
            checkedIds={data.checkedIds}
            setCheckedIds={data.setCheckedIds}
            checkedAnalyses={data.checkedAnalyses}
            netImpact={data.netImpact}
            cumSummary={data.cumSummary}
            cumLoading={data.cumLoading}
          />
        )}
      </TabPanel>
    </Tabs>
  );
}

export default function ImpactPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="My Impact"
        title={
          <>
            What it all <em>adds up to</em>
          </>
        }
        lede="Every policy you've analyzed, itemized on one receipt, and the skyline it builds over 1, 3 and 5 years. Educational estimates for your household, not advice."
        className="mb-10"
      />
      <Suspense fallback={<ReceiptSkeleton label="Loading your impact analysis…" />}>
        <ImpactContent />
      </Suspense>
    </AppShell>
  );
}
