'use client';

import { useId, useMemo, useState } from 'react';
import Surface from '@/components/ui/Surface';
import SceneView from '@/components/three/SceneView';
import HouseholdScene from '@/components/three/scenes/HouseholdScene.lazy';
import LedgerMonolith from '@/components/three/scenes/LedgerMonolith.lazy';
import { newestPiece } from '@/components/three/kit/dioramaLayout';
import HouseholdAvatar from '@/components/avatar/HouseholdAvatar';
import HouseholdPoster from '@/components/onboarding/HouseholdPoster';
import LedgerPoster from '@/components/dashboard/LedgerPoster';
import LedgerReadout from '@/components/dashboard/LedgerReadout';
import Badge from '@/components/ui/Badge';
import { describeHousehold, householdFromProfile, type HouseholdInput } from '@/lib/household';
import { EMPTY_LEDGER, buildLedger, describeLedger } from '@/lib/ledger';

/*
 * /lab: the signed-in app's 3D (App I), for visual QA. The onboarding
 * diorama with a scrubber through the answers that build it (each new piece
 * rises in, the last step plays the reveal), the household avatar at its
 * three sizes, and the dashboard's ledger monolith with example data (and
 * its readout, which shares its focus) and empty.
 */

/** Onboarding's answers in the order its questions ask them (state first, dependents last). */
const ANSWERS: { label: string; input: HouseholdInput }[] = [
  { label: 'Nothing answered', input: {} },
  { label: 'State: Ohio', input: { state: 'Ohio' } },
  { label: 'Files jointly (married)', input: { filingStatus: 'married_joint' } },
  { label: 'Owns, with a mortgage', input: { housingSituation: 'own_mortgage' } },
  { label: 'Student loans and an auto loan', input: { debtTypes: ['student_loans', 'auto_loan'] } },
  { label: 'Two dependents, ages 5 to 12', input: { hasDependents: true, dependentsCount: 2, dependentAgeBands: ['5_12'] } },
];

/** The answers up to each step, merged. */
const BUILD = ANSWERS.map((_, i) => householdFromProfile(Object.assign({}, ...ANSWERS.slice(0, i + 1).map((a) => a.input))));

const AVATARS = [
  { size: 'sm', model: householdFromProfile({ housingSituation: 'campus', debtTypes: ['student_loans'], state: 'Iowa' }) },
  { size: 'md', model: householdFromProfile({ housingSituation: 'rent', hasDependents: true, dependentsCount: 1, debtTypes: ['credit_card'] }) },
  {
    size: 'lg',
    model: householdFromProfile({
      housingSituation: 'live_with_family',
      filingStatus: 'married_joint',
      hasDependents: true,
      dependentsCount: 3,
      dependentAgeBands: ['under_5', '13_17'],
      debtTypes: ['medical', 'business_loan'],
    }),
  },
] as const;

/** Example analyses: one per category, signed from the user's side. */
const LAB_ROWS = [
  { category: 'healthcare', dollar_impact: 920 },
  { category: 'taxes', dollar_impact: 600 },
  { category: 'education', dollar_impact: 60 },
  { category: 'energy', dollar_impact: -180 },
  { category: 'housing', dollar_impact: -420 },
];
const LAB_LEDGER = buildLedger({ analyses: LAB_ROWS, totals: null });

function DioramaSpecimen() {
  const id = useId();
  const [step, setStep] = useState(ANSWERS.length - 1);
  const model = BUILD[step];
  const lastAdded = step > 0 ? newestPiece(BUILD[step - 1], model) : null;
  const reveal = step === ANSWERS.length - 1;

  return (
    <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-3">
      <SceneView className="aspect-[5/4]" poster={<HouseholdPoster model={model} lastAdded={lastAdded} lit={reveal} />} label={describeHousehold(model)}>
        <HouseholdScene model={model} mode="build" lastAdded={lastAdded} reveal={reveal} />
      </SceneView>
      <label htmlFor={id} className="flex items-center gap-3 text-sm text-muted">
        Answers
        <input
          id={id}
          type="range"
          min={0}
          max={ANSWERS.length - 1}
          step={1}
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <span className="w-6 text-right font-mono-data text-ink">{step}</span>
      </label>
      <div>
        <h3 className="font-display text-lg font-medium text-ink">Build your household (onboarding)</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {ANSWERS[step].label}. Each answer adds its piece with a pulse of light; the last one plays the reveal (the camera
          pulls back, the windows light). Under reduced motion it is a composed still.
        </p>
        <p className="mt-2 text-sm text-ink">{describeHousehold(model)}</p>
      </div>
    </Surface>
  );
}

function AvatarSpecimen() {
  return (
    <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-center gap-4">
        {AVATARS.map((a) => (
          <HouseholdAvatar key={a.size} model={a.model} size={a.size} />
        ))}
      </div>
      <div>
        <h3 className="font-display text-lg font-medium text-ink">Household avatar</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          The diorama small (120, 160 and 200 px), turning once in about 40 seconds; still under reduced motion. A campus
          hall, an apartment (one dependent, ages not given), a family home.
        </p>
      </div>
    </Surface>
  );
}

function LedgerSpecimen() {
  const [focus, setFocus] = useState<string | null>(null);
  const household = useMemo(() => BUILD[BUILD.length - 1], []);
  return (
    <Surface as="article" variant="outline" pad="sm" className="grid gap-6 lg:col-span-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div data-night="" data-scene-night="" className="relative rounded-pane bg-canvas p-3 text-ink">
        <SceneView
          interactive
          className="aspect-[4/5] w-full"
          label={`Example: ${describeLedger(LAB_LEDGER, household)}`}
          poster={<LedgerPoster model={LAB_LEDGER} focus={focus} household={household} id="lab-ledger" />}
        >
          <LedgerMonolith model={LAB_LEDGER} focus={focus} onFocus={setFocus} household={household} />
        </SceneView>
      </div>
      <div className="min-w-0">
        <Badge variant="example" className="mb-3">Example</Badge>
        <LedgerReadout model={LAB_LEDGER} focus={focus} onFocus={setFocus} titleAs="h3" />
      </div>
    </Surface>
  );
}

function EmptyLedgerSpecimen() {
  return (
    <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-3">
      <div data-night="" data-scene-night="" className="relative rounded-pane bg-canvas p-3 text-ink">
        <SceneView className="aspect-[4/5] w-full" label={describeLedger(EMPTY_LEDGER)} poster={<LedgerPoster model={EMPTY_LEDGER} id="lab-ledger-empty" />}>
          <LedgerMonolith model={EMPTY_LEDGER} />
        </SceneView>
      </div>
      <div>
        <h3 className="font-display text-lg font-medium text-ink">Ledger, empty</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          No analyses yet: a clear column with a dashed baseline and no numbers anywhere.
        </p>
      </div>
    </Surface>
  );
}

export default function AppLab() {
  return (
    <section className="mt-16" aria-labelledby="lab-app">
      <h2 id="lab-app" className="font-display text-display-sm font-medium text-ink">
        The <em>app</em>
      </h2>
      <p className="mt-2 max-w-2xl text-muted">
        Onboarding&apos;s household diorama, the avatar it becomes, and the dashboard&apos;s ledger. Point at a slab (or a row of
        the readout) to light the same category in both.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DioramaSpecimen />
        <AvatarSpecimen />
        <LedgerSpecimen />
        <EmptyLedgerSpecimen />
      </div>
    </section>
  );
}
