'use client';

import type { ReactNode } from 'react';
import Badge from '@/components/ui/Badge';
import Surface from '@/components/ui/Surface';
import SceneView from '@/components/three/SceneView';
import TransmissionHero from '@/components/three/scenes/TransmissionHero.lazy';
import FlowSankey from '@/components/three/scenes/FlowSankey.lazy';
import TimelineRibbon from '@/components/three/scenes/TimelineRibbon.lazy';
import VulnerabilityCrystal from '@/components/three/scenes/VulnerabilityCrystal.lazy';
import SpendingTerrain from '@/components/three/scenes/SpendingTerrain.lazy';
import TransmissionPoster from '@/components/impact/posters/TransmissionPoster';
import FlowPoster from '@/components/impact/posters/FlowPoster';
import RibbonPoster from '@/components/impact/posters/RibbonPoster';
import CrystalPoster from '@/components/impact/posters/CrystalPoster';
import TerrainPoster from '@/components/impact/posters/TerrainPoster';
import ReceiptLab from '@/components/impact/receipt/ReceiptLab';
import GuideLab from '@/components/guide/GuideLab';
import { CrystalView, FlowView, HeroView, RibbonView, TerrainView } from '@/app/impact/[policyId]/_components/visuals';
import { ANALYSIS_SCHEMA_VERSION, coerceFullAnalysis } from '@/lib/analysisSchema';
import { describeTransmission } from '@/lib/transmission';
import type { FullAnalysis, Policy } from '@/types';

/*
 * /lab: the signed-in app's second half (App II), for visual QA. The policy
 * detail page's Transmission views exactly as the page mounts them (the
 * hero, the overview's money flow, the timeline ribbon with its month
 * slider, the vulnerability crystal and the spending terrain) over an
 * example analysis; the hero for a cost, for $0 and for an unverified bill
 * (no gold seal); each scene with no data, as its own empty state; then My
 * Impact's receipt and skyline, and the Policy Guide's Chamber.
 */

const POLICY: Policy = {
  id: 'lab-ctc',
  title: 'Working Families Tax Credit Act',
  summary: 'Raises the refundable credit for households with children under 17.',
  description: 'Raises the refundable credit for households with children under 17.',
  category: 'taxes',
  status: 'proposed',
  date: '2026-09-15',
  source: 'congress.gov',
  sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1001',
  governingBody: 'H.R. 1001',
  region: 'Federal',
  confidenceLevel: 'medium',
  impacts: [],
  assumptions: [],
  tags: [],
  record: {
    verified: true,
    source: 'congress.gov',
    sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1001',
    latestActionDate: '2026-09-15',
    latestAction: 'Referred to the Committee on Ways and Means.',
    asOf: '2026-10-18T09:00:00Z',
    status: 'proposed',
    billNumber: 'H.R. 1001',
    region: 'Federal',
    congress: 119,
    billType: 'hr',
    number: '1001',
  },
};

/** Cumulative months that rise, dip in month 4 (a premium change lands) and recover. */
const MONTHLY = [90, 185, 275, 230, 330, 430, 525, 620, 720, 815, 910, 1010].map((impact, i) => ({ month: i + 1, impact }));

/** An example analysis, normalized as the server stores it: a gain overall, with one cost among its categories. */
const EXAMPLE: FullAnalysis = coerceFullAnalysis(
  {
    plainEnglishSummary: 'If it passes as written, your refundable credit could rise by about $1,200 a year.',
    netAnnualImpact: 1010,
    netMonthlyImpact: 84,
    confidenceScore: 64,
    direction: 'positive',
    categoryImpacts: { taxes: 1200, healthcare: -240, education: 50 },
    timeline: { monthly: MONTHLY, year1: 1010, year3: 3240, year5: 5600 },
    vulnerability: { incomeStability: 38, housingSecurity: 52, employmentRisk: 24, costOfLivingPressure: 71, investmentExposure: 18, debtBurden: 46 },
    spendingVelocity: [
      { category: 'Groceries', dollarImpact: 12 },
      { category: 'Childcare', dollarImpact: 60 },
      { category: 'Health insurance', dollarImpact: -20 },
      { category: 'Transport', dollarImpact: 0 },
      { category: 'Utilities', dollarImpact: -6 },
      { category: 'Housing', dollarImpact: 8 },
    ],
    record: POLICY.record,
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
  },
  POLICY
);

const HEROES: { title: string; note: string; netAnnualImpact: number; status: string; verified: boolean }[] = [
  { title: 'A cost, in effect', note: 'Amber hangs below a raised zero shelf, clear of the plinth; an enacted law is lit from within.', netAnnualImpact: -340, status: 'enacted', verified: true },
  { title: 'No change', note: '$0: an empty zero shelf on the column’s foot, no light travelling.', netAnnualImpact: 0, status: 'proposed', verified: true },
  { title: 'Unverified bill', note: 'Not checked against an official record: the sheet carries no gold seal.', netAnnualImpact: 620, status: 'proposed', verified: false },
];

function Specimen({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-3">
      <div data-night="" data-scene-night="" className="overflow-hidden rounded-pane bg-canvas">
        {children}
      </div>
      <div>
        <h4 className="font-display text-lg font-medium text-ink">{title}</h4>
        <p className="mt-1 text-sm leading-relaxed text-muted">{note}</p>
      </div>
    </Surface>
  );
}

export default function AppTwoLab() {
  return (
    // data-lab-section: tests/e2e/stage.spec.ts draws this half of /lab in its own test.
    <div data-lab-section="app-two">
      <section className="mt-16" aria-labelledby="lab-transmission">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="lab-transmission" className="font-display text-display-sm font-medium text-ink">
            The <em>Transmission</em>
          </h2>
          <Badge variant="example">Example</Badge>
        </div>
        <p className="mt-2 max-w-2xl text-muted">
          The policy detail page&apos;s views as the page mounts them, over an example analysis: +$1,010 a year, a tax gain with a
          healthcare cost among its categories, confidence 64/100.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div data-night="" data-scene-night="" className="overflow-hidden rounded-pane bg-canvas">
              <HeroView a={EXAMPLE} />
            </div>
          </div>
          <div className="space-y-6 lg:col-span-7">
            <FlowView a={EXAMPLE} />
          </div>
        </div>
        <div className="mt-6 space-y-6">
          <RibbonView a={EXAMPLE} simple={false} />
          <div className="grid gap-6 lg:grid-cols-2">
            <CrystalView a={EXAMPLE} simple={false} />
            <TerrainView a={EXAMPLE} />
          </div>
        </div>

        <h3 className="mt-12 font-display text-xl font-medium text-ink">The hero, other cases</h3>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {HEROES.map((h) => (
            <Specimen key={h.title} title={h.title} note={h.note}>
              <SceneView
                className="aspect-[10/9] w-full"
                label={describeTransmission(h)}
                poster={<TransmissionPoster id={`lab-hero-${h.netAnnualImpact}`} netAnnualImpact={h.netAnnualImpact} status={h.status} verified={h.verified} />}
              >
                <TransmissionHero netAnnualImpact={h.netAnnualImpact} status={h.status} verified={h.verified} />
              </SceneView>
            </Specimen>
          ))}
        </div>

        <h3 className="mt-12 font-display text-xl font-medium text-ink">With no data</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          The page shows an honest empty state instead of these; each scene still draws its empty stand without inventing a figure.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Specimen title="Flow, no categories" note="The bill, an empty rail and an empty vessel.">
            <SceneView className="aspect-[16/9] w-full" poster={<FlowPoster id="lab-flow-empty" flows={[]} verified />}>
              <FlowSankey flows={[]} verified />
            </SceneView>
          </Specimen>
          <Specimen title="Ribbon, no months" note="No band is drawn.">
            <SceneView className="aspect-[16/9] w-full" poster={<RibbonPoster points={[]} />}>
              <TimelineRibbon points={[]} />
            </SceneView>
          </Specimen>
          <Specimen title="Crystal, no scores" note="The empty guide rings only.">
            <SceneView className="aspect-square w-full" poster={<CrystalPoster id="lab-crystal-empty" axes={[]} />}>
              <VulnerabilityCrystal axes={[]} />
            </SceneView>
          </Specimen>
          <Specimen title="Terrain, no categories" note="The empty slab.">
            <SceneView className="aspect-[6/5] w-full" poster={<TerrainPoster id="lab-terrain-empty" cells={[]} />}>
              <SpendingTerrain cells={[]} />
            </SceneView>
          </Specimen>
        </div>
      </section>

      <section className="mt-16" aria-labelledby="lab-receipt">
        <h2 id="lab-receipt" className="mb-6 font-display text-display-sm font-medium text-ink">
          The <em>Receipt</em> and the <em>Skyline</em>
        </h2>
        <ReceiptLab />
      </section>

      <GuideLab />
    </div>
  );
}
