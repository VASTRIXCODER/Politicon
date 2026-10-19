import { describe, expect, it } from 'vitest';
import type { DiscoveredPolicy } from '@/types';
import { BEAT_MS, MAX_BEATS, MIN_SPEAKING_MS, countWords, orbState, speechBeats } from '@/components/guide/orbVoice';
import { MAX_EXTRA_ANALYSES, POLICY_DRAG_TYPE, buildRail, droppedPolicy, isPolicyDrag, type RailAnalysisRow } from '@/components/guide/policyRail';
import { INITIAL_MESSAGE, policyQuestion } from '@/app/advisor/_components/types';

// The Policy Guide's Chamber: the orb's voice, the "Your policies" rail and
// the pieces of the conversation the journey e2e depends on.

const policy = (id: string, extra: Partial<DiscoveredPolicy> = {}): DiscoveredPolicy => ({
  id,
  title: `Policy ${id}`,
  billNumber: `H.R. ${id}`,
  status: 'proposed',
  category: 'taxes',
  relevanceScore: 70,
  relevance: 'High',
  summary: 'A summary.',
  description: 'A summary.',
  direction: 'positive',
  estimatedImpact: '+$1,200/yr',
  reasons: [],
  region: 'Federal',
  ...extra,
});

const analysis = (id: string, dollar: RailAnalysisRow['dollar_impact'], extra: Partial<RailAnalysisRow> = {}): RailAnalysisRow => ({
  policy_id: id,
  policy_title: `Analysed ${id}`,
  category: 'housing',
  dollar_impact: dollar,
  ...extra,
});

describe('the orb voice', () => {
  it('counts words between spaces, leaving punctuation-only runs out', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('It could save you about $1,200 a year.')).toBe(8);
    expect(countWords('Taxes — and housing\n\nboth …')).toBe(4);
    expect(countWords('Lowers ¿qué? 税 costs')).toBe(4);
  });

  it('pulses once per word, capped, on a short cadence', () => {
    const short = speechBeats('Hello there');
    expect(short).toEqual({ beats: 2, intervalMs: BEAT_MS, durationMs: MIN_SPEAKING_MS });
    const long = speechBeats('word '.repeat(500));
    expect(long.beats).toBe(MAX_BEATS);
    // Never busy for long, whatever the reply's length.
    expect(long.durationMs).toBeLessThanOrEqual(MAX_BEATS * BEAT_MS + 240);
    expect(long.durationMs).toBeLessThan(2500);
  });

  it('thinks while a reply is on its way, then speaks, then rests', () => {
    expect(orbState(true, false)).toBe('thinking');
    expect(orbState(true, true)).toBe('thinking');
    expect(orbState(false, true)).toBe('speaking');
    expect(orbState(false, false)).toBe('idle');
  });
});

describe('the "Your policies" rail', () => {
  it('lists the feed in its order, with the user’s own estimate on analysed policies', () => {
    const rail = buildRail([policy('a'), policy('b')], [analysis('b', -340), analysis('z', 75)]);
    expect(rail.map((p) => p.id)).toEqual(['a', 'b', 'z']);
    expect(rail[0]).toMatchObject({ source: 'feed', analysedAnnual: undefined, relevanceScore: 70, estimatedImpact: '+$1,200/yr' });
    expect(rail[1]).toMatchObject({ source: 'feed', analysedAnnual: -340, title: 'Policy b' });
    // An analysis of a policy no longer in the feed follows it.
    expect(rail[2]).toMatchObject({ source: 'analysis', analysedAnnual: 75, title: 'Analysed z', category: 'housing' });
    expect(rail[2].relevanceScore).toBeUndefined();
  });

  it('never invents an amount: missing or non-numeric estimates show none (not zero)', () => {
    const rail = buildRail([], [analysis('n', null), analysis('s', 'abc'), analysis('t', '120.5'), analysis('e', '')]);
    expect(rail.map((p) => [p.id, p.analysedAnnual])).toEqual([
      ['n', undefined],
      ['s', undefined],
      ['t', 120.5],
      ['e', undefined],
    ]);
  });

  it('keeps one chip per policy and caps the analyses added after the feed', () => {
    const many = Array.from({ length: MAX_EXTRA_ANALYSES + 4 }, (_, i) => analysis(`x${i}`, i));
    const rail = buildRail([policy('a'), policy('a')], [analysis('a', 10), analysis('a', 99), ...many, analysis('x0', 5)]);
    expect(rail.filter((p) => p.id === 'a')).toHaveLength(1);
    // The most recent analysis of a policy is the one shown.
    expect(rail[0].analysedAnnual).toBe(10);
    expect(rail.filter((p) => p.source === 'analysis')).toHaveLength(MAX_EXTRA_ANALYSES);
    expect(new Set(rail.map((p) => p.id)).size).toBe(rail.length);
  });

  it('falls back to the id and "other" for analyses without a title or category', () => {
    const [p] = buildRail([], [analysis('q', 1, { policy_title: null, category: null })]);
    expect(p).toMatchObject({ title: 'q', category: 'other' });
  });

  it('only takes policy drags, and only ids that are on the rail', () => {
    expect(isPolicyDrag(['text/plain', POLICY_DRAG_TYPE])).toBe(true);
    expect(isPolicyDrag(['text/plain', 'Files'])).toBe(false);
    expect(isPolicyDrag(undefined)).toBe(false);
    const rail = buildRail([policy('a')], [analysis('b', 1)]);
    expect(droppedPolicy(rail, 'a')?.title).toBe('Policy a');
    expect(droppedPolicy(rail, 'b')?.source).toBe('analysis');
    expect(droppedPolicy(rail, 'not-mine')).toBeUndefined();
    expect(droppedPolicy(rail, '')).toBeUndefined();
  });
});

describe('the conversation', () => {
  it('asks the same question the dashboard hand-off prefills (the journey e2e waits for it)', () => {
    expect(policyQuestion('Working Families Tax Credit Act')).toBe('Tell me about the financial impact of Working Families Tax Credit Act');
  });

  it('greets as a local message: never sent to the model or saved', () => {
    expect(INITIAL_MESSAGE).toMatchObject({ id: '0', role: 'assistant', local: true });
    expect(INITIAL_MESSAGE.content).toMatch(/educational estimates, not financial advice/);
  });
});
