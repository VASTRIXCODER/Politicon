'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Trash2 } from 'lucide-react';
import FeedbackControls from '@/components/FeedbackControls';
import { useChartPalette } from '@/components/charts/palette';
import { useReadingMode } from '@/components/providers/ReadingModeProvider';
import ConfirmDialog from '@/components/ui/ConfirmDialogWithMotion';
import ReadingModeToggle from '@/components/ui/ReadingModeToggle';
import { JargonBuster } from '@/components/ui/SimpleMode';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { applicability } from '@/lib/applicability';
import { incomeMidpoint } from '@/lib/simpleMode';
import type { FullAnalysis } from '@/types';
import { TAB_LABELS, TABS, profileChips, titleCase } from './detailModel';
import type { ImpactDetail } from './useImpactDetail';
import TransmissionHeader from './TransmissionHeader';
import OverviewTab from './OverviewTab';
import BreakdownTab from './BreakdownTab';
import TimelineTab from './TimelineTab';
import EconomicTab from './EconomicTab';
import DeepDiveTab from './DeepDiveTab';
import ActionTab from './ActionTab';

/*
 * The impact page with its analysis: the breadcrumb and page actions, the
 * Transmission hero, the stale-profile banner, the six tabs, and feedback.
 * Loaded off the page's first-load bundle (page.tsx).
 *
 * Deleting asks first, in an in-app dialog; a failure is told in a toast.
 */

export interface DetailViewProps {
  detail: ImpactDetail;
  analysis: FullAnalysis;
  policyId: string;
}

export default function DetailView({ detail, analysis: a, policyId }: DetailViewProps) {
  const { profile, analyzedAt, tab, setTab, stale, generating: reanalyzing, generateError: reanalyzeError } = detail;
  const onReanalyze = () => detail.generate(true);
  const { simple } = useReadingMode();
  const { toast, showToast } = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Category colours for the theme on the page (charts need concrete colours).
  const { category: categoryColors } = useChartPalette();
  const income = useMemo(() => incomeMidpoint({ incomeRange: profile?.incomeRange || '' } as Parameters<typeof incomeMidpoint>[0]), [profile]);
  const categoryBars = useMemo(
    () => Object.entries(a.categoryImpacts)
      .map(([k, v]) => ({ name: titleCase(k), value: v, color: categoryColors[k] || categoryColors.other }))
      .filter((d) => d.value !== 0),
    [a.categoryImpacts, categoryColors]
  );
  const applies = useMemo(() => applicability(profile), [profile]);
  const chips = useMemo(() => profileChips(profile), [profile]);

  async function confirmDelete() {
    setDeleting(true);
    const error = await detail.deleteAnalysis();
    // On success the page is on its way to My Impact; the dialog stays until it leaves.
    if (error === null) return;
    setDeleting(false);
    setConfirmingDelete(false);
    showToast(error, 'error');
  }

  return (
    <>
      {toast}

      {/* On a phone the actions drop under the breadcrumb rather than over it. */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
            <li><Link href="/dashboard" className="transition-colors hover:text-ink">Dashboard</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/impact" className="whitespace-nowrap transition-colors hover:text-ink">My Impact</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="max-w-[34vw] truncate text-ink sm:max-w-xs">{a.billNumber || a.policyTitle}</li>
          </ol>
        </nav>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete this analysis"
            aria-haspopup="dialog"
            className="rounded-xl border border-transparent p-2 text-muted transition-colors duration-200 ease-civic hover:border-danger/20 hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
          <ReadingModeToggle />
        </div>
      </div>

      <TransmissionHeader a={a} analyzedAt={analyzedAt} profileChips={chips} />

      {stale && (
        <div role="status" className="mb-8 flex flex-col justify-between gap-3 rounded-pane border border-caution/30 bg-caution/10 px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-sm text-ink">
            Your financial profile changed after this analysis was made, so these numbers may be out of date.
            {reanalyzeError && <span className="mt-1 block text-danger">{reanalyzeError}</span>}
          </p>
          <button type="button" onClick={onReanalyze} disabled={reanalyzing} aria-busy={reanalyzing || undefined}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-caution/30 bg-raised px-4 py-2 text-sm font-medium text-caution transition-colors duration-200 ease-civic hover:border-caution/50 hover:bg-surface disabled:opacity-60">
            {reanalyzing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {reanalyzing ? 'Re-analyzing…' : 'Re-analyze with my current profile'}
          </button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabList label="Analysis sections" className="glass mb-8 w-full rounded-2xl p-1 sm:w-fit">
          {TABS.map((t) => (
            <Tab key={t} value={t} className="py-2.5">
              {TAB_LABELS[t]}
            </Tab>
          ))}
        </TabList>

        {TABS.map((t) => (
          <TabPanel key={t} value={t}>
            {/* Tab sections start at h3, so each panel gets its own (visually hidden) h2. */}
            <h2 className="sr-only">{TAB_LABELS[t]}</h2>
            {t === 'overview' && <OverviewTab a={a} categoryBars={categoryBars} simple={simple} income={income} applies={applies} />}
            {t === 'breakdown' && <BreakdownTab a={a} categoryBars={categoryBars} simple={simple} />}
            {t === 'timeline' && <TimelineTab a={a} simple={simple} />}
            {t === 'economic' && <EconomicTab a={a} simple={simple} income={income} applies={applies} />}
            {t === 'deepdive' && <DeepDiveTab a={a} />}
            {t === 'action' && <ActionTab a={a} />}
          </TabPanel>
        ))}
      </Tabs>

      <div className="mt-12 border-t border-fg/8 pt-6">
        <FeedbackControls
          key={analyzedAt || 'analysis'}
          targetType="analysis"
          targetId={policyId}
          // Kept mounted while a re-analysis runs (so focus stays put); repeat clicks are ignored.
          onReanalyze={() => { if (!reanalyzing) onReanalyze(); }}
        />
        {/* Progress and errors for a re-analysis started from here or from the banner above. */}
        <div role="status" className="mt-2 text-xs">
          {reanalyzing ? (
            <span className="flex items-center gap-2 text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden /> Re-analyzing with your current profile…
            </span>
          ) : reanalyzeError && !stale ? (
            <span className="text-danger">{reanalyzeError}</span>
          ) : null}
        </div>
      </div>

      {/* Jargon Buster sidebar — only in Simple Mode */}
      {simple && (
        <div className="mt-8">
          <JargonBuster terms={a.simple?.jargon || []} />
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this analysis?"
        body="It will be removed from your totals and from My Impact. This can’t be undone."
        confirmLabel="Delete analysis"
        tone="danger"
        busy={deleting}
        busyLabel="Deleting…"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}
