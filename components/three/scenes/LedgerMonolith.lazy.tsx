'use client';

import { lazy } from 'react';
import type { LedgerMonolithProps } from '@/components/three/scenes/LedgerMonolith';

/*
 * The dashboard's "Your Ledger" monolith as pages use it, inside a SceneView:
 *
 *   const ledger = useMemo(() => buildLedger({ analyses, totals }), [analyses, totals]);
 *   <SceneView interactive className="aspect-[4/5]" label={describeLedger(ledger, household)}
 *     poster={<LedgerPoster model={ledger} focus={focus} household={household} />}>
 *     <LedgerMonolith model={ledger} focus={focus} onFocus={setFocus} household={household} />
 *   </SceneView>
 *   <LedgerReadout model={ledger} focus={focus} onFocus={setFocus} />
 *
 * A lazy component, so three.js and the scene load with the stage, never in
 * the page's first-load bundle. It brings its own camera, lights and (tier 2)
 * bloom, and frames itself for any box. The model, its geometry and its
 * words live in lib/ledger.ts (three-free), which DOM code imports directly.
 */

const Lazy = lazy(() => import('@/components/three/scenes/LedgerMonolith'));

export type { LedgerMonolithProps };

export default function LedgerMonolith(props: LedgerMonolithProps) {
  return <Lazy {...props} />;
}
