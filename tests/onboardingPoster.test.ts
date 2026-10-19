import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import HouseholdPoster from '@/components/onboarding/HouseholdPoster';
import HouseholdStage from '@/components/onboarding/HouseholdStage';
import StageRail from '@/components/onboarding/StageRail';
import { TileBody, tileClass } from '@/components/onboarding/ChoiceTile';
import { householdArt, plaqueSpot } from '@/components/onboarding/householdArt';
import HouseholdAvatar from '@/components/avatar/HouseholdAvatar';
import RadioGroup from '@/components/forms/RadioGroup';
import { householdPieces, householdProjector, householdShot, PLAQUE } from '@/components/three/kit/dioramaLayout';
import { EMPTY_HOUSEHOLD, describeHousehold, householdFromProfile } from '@/lib/household';

// What the server sends for the household: the poster drawing (never the 3D
// scene), the onboarding stage around it, and the avatar. All must render
// before any effect runs, the same way every time (hydration).

const FULL = householdFromProfile({
  state: 'Ohio',
  housingSituation: 'own_mortgage',
  filingStatus: 'married_joint',
  hasDependents: true,
  dependentsCount: 2,
  dependentAgeBands: ['5_12'],
  debtTypes: ['student_loans', 'auto_loan', 'credit_card'],
});

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('HouseholdPoster', () => {
  it('is decoration: hidden from screen readers, never focusable', () => {
    const html = renderToString(h(HouseholdPoster, { model: FULL }));
    expect(html).toMatch(/^<svg [^>]*aria-hidden="true"/);
    expect(html).toContain('focusable="false"');
    expect(html).toContain('data-decorative=""');
    expect(html).not.toMatch(/<text|role=|tabindex/i);
  });

  it('renders the same markup every time (hydration-safe)', () => {
    expect(renderToString(h(HouseholdPoster, { model: FULL }))).toBe(renderToString(h(HouseholdPoster, { model: FULL })));
  });

  it('draws an empty plinth for an empty household', () => {
    const art = householdArt(EMPTY_HOUSEHOLD, 'build', 5 / 4);
    expect(art.pieces).toEqual([]);
    expect(art.plinth.top).toMatch(/^M/);
    expect(art.plinth.side).toMatch(/^M/);
    expect(renderToString(h(HouseholdPoster, { model: EMPTY_HOUSEHOLD }))).not.toContain('<g');
  });

  it('draws one group per piece, the path and the tree with a building', () => {
    const art = householdArt(FULL, 'build', 5 / 4);
    const ids = art.pieces.map((p) => p.id);
    for (const id of householdPieces(FULL).filter((id) => id !== 'state')) expect(ids).toContain(id);
    expect(ids).toContain('tree');
    expect(ids).toContain('path');
    expect(count(renderToString(h(HouseholdPoster, { model: FULL })), /<g/g)).toBe(art.pieces.length);
  });

  it('draws every kind of building', () => {
    for (const housing of ['rent', 'own_outright', 'live_with_family', 'campus', 'other'] as const) {
      const m = householdFromProfile({ housingSituation: housing });
      const piece = householdArt(m, 'build', 5 / 4).pieces.find((p) => p.id === `dwelling:${m.dwelling}`);
      expect(piece, housing).toBeDefined();
      // Walls, windows and a violet door, at least.
      expect(piece!.shapes.length, housing).toBeGreaterThan(8);
      expect(piece!.shapes.some((s) => s.tone === 'violet'), housing).toBe(true);
      expect(piece!.shapes.some((s) => s.tone === 'pane'), housing).toBe(true);
    }
  });

  it('draws far pieces first, so near ones overlap them', () => {
    const art = householdArt(FULL, 'build', 5 / 4);
    const ids = art.pieces.map((p) => p.id);
    // The tree stands behind the house; the car in front of it.
    expect(ids.indexOf('tree')).toBeLessThan(ids.indexOf('dwelling:house'));
    expect(ids.indexOf('dwelling:house')).toBeLessThan(ids.indexOf('prop:car'));
  });

  it('lifts in only the newest piece, with a pulse under it', () => {
    const quiet = renderToString(h(HouseholdPoster, { model: FULL }));
    expect(quiet).not.toMatch(/class="[^"]*rise/);
    expect(quiet).not.toMatch(/class="[^"]*pulse/);
    const added = renderToString(h(HouseholdPoster, { model: FULL, lastAdded: 'prop:card' }));
    expect(count(added, /<g class="[^"]*rise/g)).toBe(1);
    expect(added).toMatch(/<ellipse [^>]*class="[^"]*pulse/);
    expect(householdArt(FULL, 'build', 5 / 4, 'prop:card').pulse).not.toBeNull();
    expect(householdArt(FULL, 'build', 5 / 4, 'nothing').pulse).toBeNull();
  });

  it('lights the windows for the finished household', () => {
    expect(renderToString(h(HouseholdPoster, { model: FULL, lit: true }))).toMatch(/^<svg [^>]*class="[^"]*lit/);
    expect(renderToString(h(HouseholdPoster, { model: FULL }))).not.toMatch(/^<svg [^>]*class="[^"]*lit/);
  });

  it('fits the box it is drawn for', () => {
    expect(renderToString(h(HouseholdPoster, { model: FULL }))).toContain('viewBox="0 0 1000 800"');
    expect(renderToString(h(HouseholdPoster, { model: FULL, aspect: 2.4 }))).toContain('viewBox="0 0 1000 416.7"');
    expect(renderToString(h(HouseholdPoster, { model: FULL, compact: true }))).toContain('viewBox="0 0 1000 1000"');
  });

  it('keeps every number short (small HTML) and finite', () => {
    const html = renderToString(h(HouseholdPoster, { model: FULL }));
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    // Coordinates are rounded to a tenth of a viewBox unit.
    for (const [, d] of html.matchAll(/ d="([^"]*)"/g)) expect(d).not.toMatch(/\d\.\d{2,}/);
    expect(html.length).toBeLessThan(16_000);
  });

  it('puts the plaque where the scene’s camera sees the drum', () => {
    for (const aspect of [5 / 4, 2.4]) {
      const q = householdProjector(householdShot('build', aspect), aspect)(...PLAQUE);
      expect(plaqueSpot(aspect).x).toBeCloseTo(q.x * 100, 0);
      expect(plaqueSpot(aspect).y).toBeCloseTo(q.y * 100, 0);
      expect(householdArt(FULL, 'build', aspect).plaque).toEqual(plaqueSpot(aspect));
    }
  });
});

describe('HouseholdAvatar', () => {
  it('is an image named by the household’s sentence, with the drawing as its poster', () => {
    const html = renderToString(h(HouseholdAvatar, { model: FULL }));
    expect(html).toMatch(/^<div [^>]*role="img"/);
    expect(html).toContain(`aria-label="Your household: ${describeHousehold(FULL)}"`);
    expect(html).toContain('data-scene-view="poster"');
    expect(html).toContain('viewBox="0 0 1000 1000"');
    // The drawing inside is hidden; the label speaks for it.
    expect(html).toMatch(/<svg [^>]*aria-hidden="true"/);
  });

  it('comes in three sizes, square', () => {
    for (const [size, cls] of [['sm', 'w-[7.5rem]'], ['md', 'w-40'], ['lg', 'w-[12.5rem]']] as const) {
      const html = renderToString(h(HouseholdAvatar, { model: FULL, size }));
      expect(html).toContain(cls);
      expect(html).toContain('aspect-square');
    }
    expect(renderToString(h(HouseholdAvatar, { model: FULL }))).toContain('w-40');
  });

  it('describes an empty household honestly', () => {
    expect(renderToString(h(HouseholdAvatar, { model: EMPTY_HOUSEHOLD }))).toContain('aria-label="Your household: An empty plinth, waiting for your answers."');
  });
});

describe('HouseholdStage (the onboarding diorama)', () => {
  it('says what the diorama shows in a polite live caption', () => {
    const html = renderToString(h(HouseholdStage, { model: FULL, reveal: false }));
    expect(html).toContain(`aria-live="polite"`);
    expect(html).toContain(describeHousehold(FULL));
  });

  it('keeps the 3D box decorative, with both posters for its two shapes', () => {
    const html = renderToString(h(HouseholdStage, { model: FULL, reveal: false }));
    expect(html).toMatch(/data-scene-view="poster"[^>]*>|aria-hidden="true"[^>]*data-scene-view/);
    expect(html).toContain('viewBox="0 0 1000 750"');
    expect(html).toContain('viewBox="0 0 1000 800"');
  });

  it('sets the state on a plate, for sighted readers only, where the poster puts it', () => {
    const html = renderToString(h(HouseholdStage, { model: FULL, reveal: false }));
    const spot = plaqueSpot(5 / 4);
    expect(html).toContain(`--plaque-poster-x:${spot.x}%`);
    expect(html).toMatch(/<span aria-hidden="true" data-decorative="" class="[^"]*">Ohio<\/span>/);
    expect(renderToString(h(HouseholdStage, { model: EMPTY_HOUSEHOLD, reveal: false }))).not.toContain('Ohio');
  });

  it('adds no headings or form controls of its own (the journey e2e scans the page for them)', () => {
    for (const reveal of [false, true]) {
      const html = renderToString(h(HouseholdStage, { model: FULL, reveal }));
      expect(html).not.toMatch(/<h[1-6]|<select|<input|role="(radio|radiogroup|group|status)"/);
      // No controls at all: the reveal is short and stops with "Pause motion", so nothing here can take or drop focus.
      expect(html).not.toMatch(/<button|<a |tabindex/);
    }
  });
});

describe('StageRail', () => {
  const STAGES = [
    { label: 'Location', steps: [0, 1] },
    { label: 'About you', steps: [2, 3, 4, 5] },
    { label: 'Finances', steps: [6, 7, 8, 9] },
    { label: 'Household', steps: [10, 11, 12] },
  ];

  it('is the one progress bar the journey e2e reads, step n of total', () => {
    const html = renderToString(h(StageRail, { stages: STAGES, step: 4, total: 13 }));
    expect(count(html, /role="progressbar"/g)).toBe(1);
    expect(html).toContain('aria-label="Profile setup progress"');
    expect(html).toContain('aria-valuemin="1"');
    expect(html).toContain('aria-valuemax="13"');
    expect(html).toContain('aria-valuenow="5"');
    expect(html).toContain('aria-valuetext="Step 5 of 13"');
  });

  it('marks the current section, and the ones done', () => {
    const html = renderToString(h(StageRail, { stages: STAGES, step: 6, total: 13 }));
    expect(count(html, /aria-current="step"/g)).toBe(1);
    expect(html).toMatch(/aria-current="step"[^>]*>.*Finances/);
    expect(count(html, /\(done\)/g)).toBe(2);
    expect(html).toContain(' (current)');
  });

  it('fills each section as its questions are reached', () => {
    const widths = (step: number) => [...renderToString(h(StageRail, { stages: STAGES, step, total: 13 })).matchAll(/width:(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
    expect(widths(0)).toEqual([50, 0, 0, 0]);
    expect(widths(5)).toEqual([100, 100, 0, 0]);
    expect(widths(12)).toEqual([100, 100, 100, 100]);
  });
});

describe('the answer tiles', () => {
  it('show a choice by shape as well as colour', () => {
    const on = renderToString(h(TileBody, { label: 'Rent', on: true }));
    const off = renderToString(h(TileBody, { label: 'Rent', on: false }));
    expect(on).toContain('bg-white');
    expect(off).not.toContain('bg-white');
    expect(renderToString(h(TileBody, { label: 'Mortgage', on: true, multiple: true }))).toContain('<svg');
  });

  it('keep radio semantics in the shared RadioGroup', () => {
    const html = renderToString(
      h(RadioGroup, {
        options: [
          { value: 'rent', label: 'Rent' },
          { value: 'own', label: 'Own' },
        ],
        value: 'own',
        onChange: () => undefined,
        labelledBy: 'q',
        optionClassName: (selected: boolean) => tileClass(selected),
        renderOption: (o: { label: string }, selected: boolean) => h(TileBody, { label: o.label, on: selected }),
      })
    );
    expect(html).toContain('role="radiogroup"');
    expect(count(html, /role="radio"/g)).toBe(2);
    expect(html).toMatch(/aria-checked="true"[^>]*tabindex="0"|tabindex="0"[^>]*aria-checked="true"/);
    expect(html).toContain('aria-checked="false"');
  });

  it('dim a disabled tile, and never move one under reduced motion', () => {
    expect(tileClass(false)).toContain('disabled:opacity-45');
    expect(tileClass(false)).toMatch(/motion-safe:[^ ]*hover:-translate-y-px/);
    expect(tileClass(true)).toContain('border-primary/60');
  });
});
