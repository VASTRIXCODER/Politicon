import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';

/*
 * The sound pass: which interface events play which cue (lib/sound, every
 * cue silent unless the visitor turned sound on, which lib/sound's own tests
 * cover). Here playCue is a spy and the morph is stubbed, so each test reads
 * as "this action → this cue".
 *
 *   rustle   the docket re-fans (a filter) or a card is dismissed
 *   chime    an analysis the visitor started lands on its card
 *   whoosh   the detail view opens
 *   tick     a segmented control changes
 */

vi.mock('@/lib/sound', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/sound')>()), playCue: vi.fn() }));
vi.mock('@/lib/viewTransition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/viewTransition')>()),
  navigateWithMorph: vi.fn(() => false),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const { playCue } = await import('@/lib/sound');
const { navigateWithMorph } = await import('@/lib/viewTransition');
const { default: SegmentedControl, pickSegment } = await import('@/components/ui/SegmentedControl');
const cues = await import('@/components/feed/cues');
const { openImpact } = await import('@/components/ViewFullImpactButton');

const root = path.resolve(__dirname, '..');
const source = (file: string) => readFileSync(path.join(root, file), 'utf8');

beforeEach(() => {
  vi.mocked(playCue).mockClear();
  vi.mocked(navigateWithMorph).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('tick: a segmented control changes', () => {
  const options = [
    { value: 'all', label: 'All' },
    { value: 'analyzed', label: 'Analyzed' },
    { value: 'off', label: 'Off', disabled: true },
  ] as const;

  it('ticks, then reports the new choice', () => {
    const onValueChange = vi.fn();
    pickSegment(options, 1, 'all', onValueChange);
    expect(playCue).toHaveBeenCalledTimes(1);
    expect(playCue).toHaveBeenCalledWith('tick');
    expect(onValueChange).toHaveBeenCalledWith('analyzed');
    expect(vi.mocked(playCue).mock.invocationCallOrder[0]).toBeLessThan(onValueChange.mock.invocationCallOrder[0]);
  });

  it('stays silent when nothing changes: the current choice, a disabled one, none at all', () => {
    const onValueChange = vi.fn();
    pickSegment(options, 0, 'all', onValueChange);
    pickSegment(options, 2, 'all', onValueChange);
    pickSegment(options, 7, 'all', onValueChange);
    expect(playCue).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('links the group to a visible hint when given one (and only then)', () => {
    const render = (describedBy?: string) =>
      renderToString(h(SegmentedControl<string>, { label: 'Theme', options, value: 'all', onValueChange: () => {}, describedBy }));
    expect(render('theme-hint')).toMatch(/<div role="radiogroup" aria-label="Theme" aria-describedby="theme-hint"/);
    expect(render()).not.toContain('aria-describedby');
  });
});

describe('rustle: the docket changes', () => {
  let activation: { isActive: boolean } | undefined;
  let clock = Date.UTC(2026, 9, 19);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Each test starts a minute after the last one, well clear of its last rustle.
    clock += 60_000;
    vi.setSystemTime(clock);
    activation = { isActive: true };
    vi.stubGlobal('navigator', {
      get userActivation() {
        return activation;
      },
    });
  });

  it('rustles once as a dismissed card leaves, and once for a burst of re-fans (typing a search)', () => {
    cues.rustleDocket({ deliberate: true });
    expect(playCue).toHaveBeenCalledWith('rustle');
    cues.rustleDocket();
    vi.advanceTimersByTime(cues.RUSTLE_GAP_MS - 1);
    cues.rustleDocket();
    expect(playCue).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    cues.rustleDocket();
    expect(playCue).toHaveBeenCalledTimes(2);
  });

  it('stays quiet when the feed changes on its own (no click, tap or key press just now)', () => {
    activation = { isActive: false };
    cues.rustleDocket();
    expect(playCue).not.toHaveBeenCalled();
    // A dismissal is the visitor's own action, however long its request took.
    cues.rustleDocket({ deliberate: true });
    expect(playCue).toHaveBeenCalledWith('rustle');
  });

  it('gives browsers without the User Activation API the benefit of the doubt', () => {
    activation = undefined;
    cues.rustleDocket();
    expect(playCue).toHaveBeenCalledTimes(1);
  });

  it('is wired to the docket (a re-fan, never the first fan-in) and to a card’s dismissal', () => {
    const docket = source('components/feed/PolicyDocket.tsx');
    expect(docket).toMatch(/if \(shown\.current !== null && shown\.current !== keys\) rustleDocket\(\);/);
    // The rustle comes before the motion check: reduced motion changes the list without moving it, still audibly.
    expect(docket.indexOf('rustleDocket();')).toBeLessThan(docket.indexOf('if (prefersLessMotion()'));
    const card = source('components/PolicyFeedCard.tsx');
    const dismiss = card.slice(card.indexOf('async function dismiss()'), card.indexOf('const estimate'));
    // Only once the dismissal succeeded (the card is leaving), never for a failure.
    expect(dismiss.indexOf('rustleDocket({ deliberate: true });')).toBeGreaterThan(dismiss.indexOf('if (error) {'));
  });
});

describe('chime: an analysis lands', () => {
  it('chimes only when the card’s own analysis finishes with a result', () => {
    expect(cues.analysisLanded(true, false, true)).toBe(true);
    // Still running; failed; already analyzed when the card appeared; a fresh card.
    expect(cues.analysisLanded(true, true, true)).toBe(false);
    expect(cues.analysisLanded(true, false, false)).toBe(false);
    expect(cues.analysisLanded(false, false, true)).toBe(false);
    expect(cues.analysisLanded(false, false, false)).toBe(false);
  });

  it('is wired to the card, where the client learns the analysis finished', () => {
    const card = source('components/PolicyFeedCard.tsx');
    expect(card).toMatch(/if \(analysisLanded\(wasAnalyzing\.current, isAnalyzing, analyzed\)\) playCue\('chime'\);/);
    // The detail page chimes for a generation it waited for.
    expect(source('app/impact/[policyId]/_components/useImpactDetail.ts')).toContain("playCue('chime')");
  });
});

describe('whoosh: the detail view opens', () => {
  it('whooshes and tries the morph; a plain navigation follows when the morph can’t run', () => {
    const push = vi.fn();
    const link = {} as Element;
    expect(openImpact(link, '/impact/us-119-hr-1001', push)).toBe(false);
    expect(playCue).toHaveBeenCalledWith('whoosh');
    expect(navigateWithMorph).toHaveBeenCalledWith(link, '/impact/us-119-hr-1001', expect.any(Function));
    // The caller navigates (the link's default, or router.push).
    expect(push).not.toHaveBeenCalled();
  });

  it('lets the morph navigate when it runs', () => {
    vi.mocked(navigateWithMorph).mockImplementationOnce((_from, _href, navigate) => {
      navigate();
      return true;
    });
    const push = vi.fn();
    expect(openImpact(null, '/impact/x', push)).toBe(true);
    expect(push).toHaveBeenCalledWith('/impact/x');
    expect(playCue).toHaveBeenCalledTimes(1);
  });

  it('never plays on a click meant for a new tab or window', () => {
    const button = source('components/ViewFullImpactButton.tsx');
    const analysed = button.slice(button.indexOf('function openAnalyzed'), button.indexOf('async function handleClick'));
    expect(analysed.indexOf('if (isModifiedClick(e)) return;')).toBeGreaterThan(-1);
    expect(analysed.indexOf('if (isModifiedClick(e)) return;')).toBeLessThan(analysed.indexOf('openImpact('));
  });
});
