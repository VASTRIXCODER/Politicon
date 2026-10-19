'use client';

import { useState } from 'react';
import Surface from '@/components/ui/Surface';
import Button from '@/components/ui/Button';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Badge from '@/components/ui/Badge';
import GuideOrbView from '@/components/guide/GuideOrbView';
import OrbPoster from '@/components/guide/OrbPoster';
import { useOrbVoice } from '@/components/guide/useOrbVoice';
import { orbState, type OrbState } from '@/components/guide/orbVoice';
import MessagePane from '@/app/advisor/_components/MessagePane';
import { GUARDRAIL_REPLIES } from '@/lib/guardrails';

/*
 * /lab: the Policy Guide's Chamber pieces, for visual QA (the integrator
 * mounts <GuideLab /> from app/lab/AppTwoLab.tsx). The orb in a night
 * section, with its state chosen by hand, a pulse button (one ripple per
 * press, as per streamed word) and "speak" (a sample reply's cadence); its
 * three CSS posters side by side; and the panes the conversation is made
 * of, the guardrail seal cards included.
 */

const STATES: { value: OrbState; label: string }[] = [
  { value: 'idle', label: 'Idle' },
  { value: 'thinking', label: 'Thinking' },
  { value: 'speaking', label: 'Speaking' },
];

const SAMPLE_REPLY =
  'For a household like yours, a larger refundable credit would most likely show up at tax time, not in each paycheck. ' +
  'The estimate depends on your filing status and income range, so treat it as a range, not a promise.';

const AT = new Date('2026-10-18T09:30:00');

function OrbSpecimen() {
  const [chosen, setChosen] = useState<OrbState>('idle');
  const [manualPulse, setManualPulse] = useState(0);
  const voice = useOrbVoice();
  // "Speak" plays the real cadence; otherwise the chosen state, with hand-made pulses.
  const state = voice.speaking ? orbState(false, true) : chosen;
  const pulse = voice.pulse + manualPulse;

  return (
    <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-4">
      <div data-night="" data-scene-night="" className="relative grid place-items-center rounded-pane bg-canvas p-6 text-ink">
        <GuideOrbView className="size-56" state={state} pulse={pulse} eager={false} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Orb state" options={STATES} value={state} onValueChange={setChosen} size="sm" />
        <Button size="sm" variant="ghost" onClick={() => setManualPulse((p) => p + 1)}>
          Pulse
        </Button>
        <Button size="sm" variant="ghost" onClick={() => voice.speak(SAMPLE_REPLY)}>
          Speak a reply
        </Button>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        Idle breathes, thinking swirls, speaking ripples once per word. Under reduced motion or Pause motion it is a still frame
        per state, and pulses do nothing.
      </p>
    </Surface>
  );
}

function PosterSpecimen() {
  return (
    <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-4">
      <div data-night="" className="grid grid-cols-3 gap-3 rounded-pane bg-canvas p-4 text-ink">
        {STATES.map((s) => (
          <figure key={s.value} className="flex flex-col items-center gap-2">
            <div className="relative size-24">
              <OrbPoster state={s.value} pulse={s.value === 'speaking' ? 1 : 0} />
            </div>
            <figcaption className="text-meta text-muted">{s.label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted">
        The CSS posters: the server&apos;s first paint, and all there is on devices without 3D.
      </p>
    </Surface>
  );
}

function PaneSpecimen() {
  return (
    <Surface as="article" variant="outline" pad="sm" className="lg:col-span-2">
      <div data-night="" className="rounded-pane bg-canvas p-4 text-ink sm:p-6">
        <Badge variant="example" className="mb-4">Example</Badge>
        <MessagePane sessionId={null} message={{ id: 'u1', role: 'user', content: 'Tell me about the financial impact of the Working Families Tax Credit Act', timestamp: AT }} />
        <MessagePane
          sessionId={null}
          message={{
            id: 'a1',
            role: 'assistant',
            content: SAMPLE_REPLY,
            summary: SAMPLE_REPLY,
            dollarLine: 'Roughly $600 to $1,200 a year for a household like yours (an educational estimate).',
            timestamp: AT,
          }}
        />
        <MessagePane sessionId={null} message={{ id: 'g1', role: 'assistant', content: GUARDRAIL_REPLIES.vote_advice, guardrail: 'vote_advice', timestamp: AT }} />
        <MessagePane sessionId={null} message={{ id: 'g2', role: 'assistant', content: GUARDRAIL_REPLIES.crisis, guardrail: 'crisis', timestamp: AT }} />
        <MessagePane
          sessionId={null}
          onRetry={() => {}}
          message={{ id: 'e1', role: 'assistant', local: true, content: 'The Policy Guide is busy right now.', retry: { text: 'Hello' }, timestamp: AT }}
        />
      </div>
    </Surface>
  );
}

export default function GuideLab() {
  return (
    <section className="mt-16" aria-labelledby="lab-guide">
      <h2 id="lab-guide" className="font-display text-display-sm font-medium text-ink">
        The <em>Chamber</em>
      </h2>
      <p className="mt-2 max-w-2xl text-muted">
        The Policy Guide&apos;s orb, its posters, and the panes its conversation is made of, the calm seal cards for fixed
        replies included.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <OrbSpecimen />
        <PosterSpecimen />
        <PaneSpecimen />
      </div>
    </section>
  );
}
