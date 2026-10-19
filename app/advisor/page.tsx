import { Suspense } from 'react';
import AppShell from '@/components/layout/AppShell';
import AdvisorChamber from './_components/AdvisorChamber';
import ChamberFallback from './_components/ChamberFallback';

/*
 * The AI Policy Guide: "the Chamber". The whole page is a night scene in
 * both themes (a night AppShell: night tokens, and the stage paints the
 * Chamber's aurora behind it). It fills the screen under the floating bar;
 * only the conversation scrolls. The conversation reads the URL (?policyId=,
 * ?q=), so it renders on the client inside Suspense, and the prerendered
 * HTML is the fallback: the orb's poster and the title.
 */

// Fills the viewport: no column width, gutters or room under the bar of the
// default <main> (the Chamber adds its own room for the bar).
const CHAMBER_MAIN = 'flex h-screen max-w-none flex-col overflow-hidden px-0 pb-0 pt-0 sm:px-0 lg:px-0 supports-[height:100dvh]:h-[100dvh]';

export default function AdvisorPage() {
  return (
    <AppShell night mainClassName={CHAMBER_MAIN}>
      <Suspense fallback={<ChamberFallback />}>
        <AdvisorChamber />
      </Suspense>
    </AppShell>
  );
}
