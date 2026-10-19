import { Suspense } from 'react';
import AppShell from '@/components/layout/AppShell';
import styles from '@/components/guide/guide.module.css';
import { cn } from '@/lib/utils';
import AdvisorChamber from './_components/AdvisorChamber';
import ChamberFallback from './_components/ChamberFallback';

/*
 * The AI Policy Guide: "the Chamber". The whole page is a night scene in
 * both themes (a night AppShell: night tokens, and the stage paints the
 * Chamber's aurora behind it). On a screen tall enough it fills the screen
 * under the floating bar and only the conversation scrolls; on a shorter one
 * (a phone held sideways, 400% zoom) the page scrolls, so the composer is
 * always in reach (guide.module.css .main). The conversation reads the URL (?policyId=,
 * ?q=), so it renders on the client inside Suspense, and the prerendered
 * HTML is the fallback: the orb's poster and the title.
 */

// The screen (styles.main: fixed to it only when tall enough): no column width, gutters or
// room under the bar of the default <main> (the Chamber adds its own room for the bar).
const CHAMBER_MAIN = cn('flex max-w-none flex-col px-0 pb-0 pt-0 sm:px-0 lg:px-0', styles.main);

export default function AdvisorPage() {
  return (
    <AppShell night mainClassName={CHAMBER_MAIN}>
      <Suspense fallback={<ChamberFallback />}>
        <AdvisorChamber />
      </Suspense>
    </AppShell>
  );
}
