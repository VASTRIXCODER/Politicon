'use client';

import { use, useEffect } from 'react';
import dynamic from 'next/dynamic';
import AppShell from '@/components/layout/AppShell';
import { DetailSkeleton, NoAnalysis } from './_components/DetailStates';
import { useImpactDetail } from './_components/useImpactDetail';

/*
 * One analyzed policy, "The Transmission": the bill's official record and
 * where it stands, the user's net annual impact resolving out of it, and six
 * tabs of the honest figures behind that number, each with its visual.
 *
 * All loading, generation and deleting live in useImpactDetail; this file
 * picks the state to show. The analysis is the user's own data, read in the
 * browser, so the server sends the skeleton, and the detail view's code
 * (DetailView and everything under it) loads beside the data, off this
 * page's first-load bundle.
 */

const loadDetailView = () => import('./_components/DetailView');
const DetailView = dynamic(loadDetailView, { ssr: false, loading: () => <DetailSkeleton /> });

export default function PolicyDetailPage({ params }: { params: Promise<{ policyId: string }> }) {
  const policyId = decodeURIComponent(use(params).policyId);
  const detail = useImpactDetail(policyId);
  const { analysis, loading, generating, notFound, legacy, generateError, generate } = detail;

  // Fetch the detail view's code while the analysis is still loading.
  useEffect(() => {
    void loadDetailView();
  }, []);

  if (loading) {
    return (
      <AppShell mainClassName="max-w-6xl pb-24">
        <DetailSkeleton generating={generating} />
      </AppShell>
    );
  }

  if (notFound || !analysis) {
    return (
      <AppShell mainClassName="max-w-2xl pt-40 text-center">
        <NoAnalysis legacy={legacy} generating={generating} error={generateError} onGenerate={() => generate(legacy)} />
      </AppShell>
    );
  }

  return (
    <AppShell mainClassName="max-w-6xl pb-24">
      <DetailView detail={detail} analysis={analysis} policyId={policyId} />
    </AppShell>
  );
}
