import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { FILM_SHOTS, shotAt } from '@/lib/three/filmStore';
import { FILM_LEDGER_EXAMPLE, TIMELINE } from '@/components/three/scenes/filmShots';
import {
  duskProgress,
  scrollTopForProgress,
  segmentFill,
  shotRestProgress,
  snapTarget,
  trackProgress,
} from '@/components/landing/film/filmMath';
import { anchorCorrection, anchorFor } from '@/components/landing/film/filmAnchor';
import { EXAMPLE_TOTAL, EXAMPLE_TOTAL_TEXT, buildFilmShots } from '@/components/landing/film/shots';
import FilmSection from '@/components/landing/film/FilmSection';
import ImpactCard from '@/components/landing/hero/ImpactCard';
import { buildImpactExamples } from '@/components/landing/hero/impactExamples';
import HeroPoster from '@/components/landing/hero/HeroPoster';
import KineticHeadline from '@/components/landing/KineticHeadline';

/** Visible text of an HTML string, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

describe('film progress', () => {
  // A 4000px track with an 800px sticky stage: 3200px of pinned scrolling.
  it('runs 0 → 1 across the pinned stretch only', () => {
    expect(trackProgress(200, 4000, 800)).toBe(0); // track still below the top
    expect(trackProgress(0, 4000, 800)).toBe(0);
    expect(trackProgress(-1600, 4000, 800)).toBe(0.5);
    expect(trackProgress(-3200, 4000, 800)).toBe(1);
    expect(trackProgress(-5000, 4000, 800)).toBe(1); // scrolled past
  });

  it('is 0 when nothing can pin (a track no taller than the stage)', () => {
    expect(trackProgress(-100, 800, 800)).toBe(0);
    expect(trackProgress(-100, 600, 800)).toBe(0);
    expect(trackProgress(Number.NaN, 4000, 800)).toBe(0);
  });

  it('rests each shot inside its own share of the film, in order', () => {
    let previous = -1;
    for (let i = 0; i < FILM_SHOTS; i++) {
      const rest = shotRestProgress(i);
      expect(shotAt(rest), `shot ${i} rests in its own share`).toBe(i);
      expect(rest).toBeGreaterThan(previous);
      previous = rest;
    }
    // Out-of-range shots clamp to the ends.
    expect(shotRestProgress(-3)).toBe(shotRestProgress(0));
    expect(shotRestProgress(99)).toBe(shotRestProgress(FILM_SHOTS - 1));
  });

  it('maps progress back to a document scroll position', () => {
    expect(scrollTopForProgress(0, 1000, 4000, 800)).toBe(1000);
    expect(scrollTopForProgress(0.5, 1000, 4000, 800)).toBe(2600);
    expect(scrollTopForProgress(1, 1000, 4000, 800)).toBe(4200);
    expect(scrollTopForProgress(2, 1000, 4000, 800)).toBe(4200);
    // Round trip: scrolled to a shot's rest, the film is on that shot.
    for (let i = 0; i < FILM_SHOTS; i++) {
      const y = scrollTopForProgress(shotRestProgress(i), 1000, 4000, 800);
      expect(shotAt(trackProgress(1000 - y, 4000, 800))).toBe(i);
    }
  });

  it('lights the rail one segment after another', () => {
    expect(segmentFill(0, 0)).toBe(0);
    expect(segmentFill(0.1, 0)).toBeCloseTo(0.5);
    expect(segmentFill(0.1, 1)).toBe(0);
    expect(segmentFill(0.5, 1)).toBe(1);
    expect(segmentFill(0.5, 2)).toBeCloseTo(0.5);
    expect(segmentFill(1, FILM_SHOTS - 1)).toBe(1);
  });

  it('snaps only a short way, and never while arriving or leaving', () => {
    const distance = 3200;
    const rest = shotRestProgress(2);
    expect(snapTarget(rest + 0.02, distance)).toBe(rest);
    expect(snapTarget(rest - 0.02, distance)).toBe(rest);
    expect(snapTarget(rest + 0.1, distance), 'too far from any shot').toBeNull();
    expect(snapTarget(rest + 0.0001, distance), 'already there').toBeNull();
    expect(snapTarget(shotRestProgress(0) / 2, distance), 'before the first shot settles').toBeNull();
    expect(snapTarget(1, distance), 'leaving the film').toBeNull();
    expect(snapTarget(rest + 0.02, 0)).toBeNull();
  });
});

describe('the page dips into night with the scene', () => {
  it('turns night part-way into the dusk shot, after its caption is up and before its resting frame', () => {
    const at = duskProgress(4);
    // Most of the way through the scene's own dusk (filmShots TIMELINE.dusk).
    expect(at).toBeCloseTo(TIMELINE.dusk.start + 0.65 * (TIMELINE.dusk.end - TIMELINE.dusk.start), 5);
    expect(shotAt(at)).toBe(4);
    expect(at).toBeGreaterThan(4 / FILM_SHOTS);
    expect(at).toBeLessThan(shotRestProgress(4));
  });

  it('never turns night without a night shot', () => {
    expect(duskProgress(-1)).toBe(Infinity);
  });
});

describe('switching layouts keeps the reader in place', () => {
  const vh = 800;

  it('leaves the page alone when the film starts on or below the top of the screen', () => {
    const anchor = anchorFor(120, 3000, vh);
    expect(anchor).toEqual({ kind: 'none' });
    expect(anchorCorrection(anchor, 120, 4000, vh)).toBe(0);
  });

  it('keeps the same fraction of the way through the film', () => {
    // A quarter of the way through a 3000px static sequence…
    const anchor = anchorFor(-550, 3000, vh);
    expect(anchor).toEqual({ kind: 'inside', fraction: 0.25 });
    // …is a quarter of the way through the 4000px film after the switch.
    const dy = anchorCorrection(anchor, -550, 4000, vh);
    const top = -550 - dy;
    expect(trackProgress(top, 4000, vh)).toBeCloseTo(0.25);
  });

  it('keeps the content after the film exactly where it was', () => {
    const anchor = anchorFor(-5000, 3000, vh); // the film ended 2000px above the screen
    expect(anchor).toEqual({ kind: 'past', bottom: -2000 });
    const dy = anchorCorrection(anchor, -5000, 4000, vh); // now 1000px taller
    expect(dy).toBe(1000);
  });
});

describe('the film’s words', () => {
  it('has one caption per shot, numbered in order', () => {
    const shots = buildFilmShots(true);
    expect(shots).toHaveLength(FILM_SHOTS);
    expect(shots.map((s) => s.numeral)).toEqual(['01', '02', '03', '04', '05']);
    expect(new Set(shots.map((s) => s.id)).size).toBe(FILM_SHOTS);
  });

  it('starts from the official record, and names Open States only when it is configured', () => {
    const withState = JSON.stringify(buildFilmShots(true)[0]);
    const federalOnly = JSON.stringify(buildFilmShots(false)[0]);
    expect(withState).toContain('Congress.gov');
    expect(withState).toContain('Open States');
    expect(federalOnly).toContain('Congress.gov');
    expect(federalOnly).not.toContain('Open States');
    expect(JSON.stringify(buildFilmShots(false))).not.toMatch(/state legislature/i);
  });

  it('marks only the official sources as the record (archive gold)', () => {
    const recordTags = buildFilmShots(true).flatMap((s) => s.tags ?? []).filter((t) => t.record);
    expect(recordTags.map((t) => t.text)).toEqual(['Congress.gov', 'Open States']);
  });

  it('quotes the same example ledger as the 3D film, with signs and words', () => {
    const example = buildFilmShots(true).find((s) => s.example)?.example;
    expect(example).toBeDefined();
    expect(example!.lines.map((l) => l.amount)).toEqual(FILM_LEDGER_EXAMPLE.map((e) => e.amount));
    for (const line of example!.lines) {
      expect(line.direction).toBe(line.amount < 0 ? 'Costs you' : 'Saves you');
    }
    expect(example!.total).toBe(EXAMPLE_TOTAL);
    expect(EXAMPLE_TOTAL_TEXT).toBe('+$1,240/yr');
    expect(example!.totalWords).toMatch(/save/i);
    expect(example!.note).toMatch(/illustrative/i);
  });

  it('words its links unlike the hero buttons (one "Get My Impact Report" per page)', () => {
    const links = buildFilmShots(true).flatMap((s) => s.links ?? []);
    expect(links.map((l) => l.href)).toEqual(['/auth/signup', '/explorer']);
    for (const link of links) {
      expect(link.text).not.toMatch(/get my impact report/i);
      expect(link.text).not.toMatch(/try the explorer/i);
    }
  });

  it('stays non-partisan and educational', () => {
    const all = JSON.stringify(buildFilmShots(true));
    expect(all).toMatch(/non-partisan/i);
    expect(all).toMatch(/not advice/i);
    expect(all).not.toMatch(/democrat|republican|liberal|conservative/i);
  });
});

describe('server render', () => {
  const html = renderToString(h(FilmSection, { stateBills: true }));

  it('is the complete static sequence: heading, all five captions, nothing hidden', () => {
    expect(html).toContain('id="how-it-works"');
    expect(html).toContain('data-film-mode="static"');
    expect(html).toContain('id="how-it-works-end"');
    expect(text(html)).toContain('From the Capitol to your kitchen table.');
    for (const shot of buildFilmShots(true)) {
      expect(text(html)).toContain(`${shot.title.lead} ${shot.title.accent}`);
    }
    expect(html.match(/<h3/g)).toHaveLength(FILM_SHOTS);
    // Nothing transparent, inert or hidden from assistive tech but the drawings.
    expect(html).not.toMatch(/(?<![\w-])opacity(?::\s*|-)0(?![.\d])|\binert\b|visibility:\s*hidden/);
    const hidden = html.match(/<[^>]+aria-hidden="true"[^>]*>/g) ?? [];
    for (const tag of hidden) expect(tag, 'only decoration is aria-hidden').not.toMatch(/<(article|h3|p|a)\b/);
  });

  it('labels the example figure as an example', () => {
    expect(text(html)).toContain('Example');
    expect(text(html)).toContain('+$1,240/yr');
    expect(text(html)).toMatch(/could save you/i);
  });

  it('renders the stills as decoration', () => {
    expect(html.match(/data-decorative=""/g)?.length ?? 0).toBeGreaterThanOrEqual(FILM_SHOTS);
  });

  it('starts kinetic headlines visible (no style, no split) on the server', () => {
    const heading = renderToString(
      h(KineticHeadline, { id: 'x', className: 'font-display', children: ['Plain ', h('em', { key: 'em' }, 'words')] })
    );
    expect(heading).toBe('<h2 id="x" class="font-display">Plain <em>words</em></h2>');
  });
});

describe('the hero receipt and poster', () => {
  const examples = buildImpactExamples();

  it('formats every example on the server, signed, with words', () => {
    expect(examples.length).toBeGreaterThanOrEqual(2);
    expect(examples.some((e) => e.direction === 'positive')).toBe(true);
    expect(examples.some((e) => e.direction === 'negative')).toBe(true);
    for (const e of examples) {
      expect(e.headline).toMatch(e.direction === 'negative' ? /^−\$/ : /^\+\$/);
      expect(e.verdict).toMatch(e.direction === 'negative' ? /cost/ : /save/);
      expect(e.projection.map((p) => p.label)).toEqual(['Year 1', 'Year 3', 'Year 5']);
      expect(Math.max(...e.projection.map((p) => p.width))).toBe(100);
    }
  });

  it('renders the receipt labelled as an example, paused until it knows the motion preference', () => {
    const html = renderToString(h(ImpactCard, { examples }));
    expect(text(html)).toContain('Example');
    expect(html).toContain('aria-label="Play examples"');
    expect(html).toContain('data-day=""');
    expect(text(html)).toContain(examples[0].headline);
  });

  it('draws the poster as decoration with gradient ids unique to each drawing', () => {
    const html = renderToString(h('div', null, h(HeroPoster), h(HeroPoster)));
    expect(html).toContain('aria-hidden="true"');
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
