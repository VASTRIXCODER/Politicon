import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createElement as h, createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { timeAgo } from '@/lib/utils';
import { RADAR_LABELS } from '@/lib/simpleMode';
import { TABS, TAB_LABELS } from '@/app/impact/[policyId]/_components/detailModel';
import { QUICK_PROMPTS } from '@/app/advisor/_components/types';
import ConversationList from '@/app/advisor/_components/ConversationList';
import FeedSection from '@/app/dashboard/_components/FeedSection';
import type { DashboardData } from '@/app/dashboard/_components/useDashboardData';

// One product voice (README, "Design system: Civic Light" → Copy): the
// mechanical parts of it, checked across every page and component. The
// legal pages are counsel's text and are left out.

const ROOT = path.resolve(__dirname, '..');
const LEGAL = /^app\/(privacy|terms|disclaimer)\//;

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name) && !LEGAL.test(rel)) out.push(rel);
    }
  };
  walk('app');
  walk('components');
  return out;
}

/** The file without its comments (JSX comment blocks included), so notes about copy don't count as copy. */
function code(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const FILES = sourceFiles().map((rel) => ({ rel, src: code(rel) }));

/** "Loading..." at the end of a string or a JSX text: the three dots of a loading state. */
const THREE_DOTS = /[A-Za-z]\.\.\.(?=\s*['"`<]|\s*$)/gm;
/** An exclamation mark in a string literal or in JSX text ("Start chatting!"), never `!==` or a non-null `x!`. */
const EXCLAIMED = [/(['"`])(?:(?!\1)[^\n\\])*?[A-Za-z]!(?=\s|\1)(?:(?!\1)[^\n\\])*\1/g, />[^<>{}\n]*[A-Za-z]![^<>{}\n=]*</g];

/** Words that keep their capital inside a sentence-case label. */
const PROPER = new Set(['AI', 'Policy', 'Guide', 'My', 'Impact', 'Politicon', 'Congress', 'English', 'GDP', 'IRS']);

function sentenceCase(label: string): boolean {
  return label
    .split(/\s+/)
    .slice(1)
    .every((word) => !/^[A-Z][a-z]/.test(word) || PROPER.has(word.replace(/[^A-Za-z]/g, '')));
}

describe('copy', () => {
  it('writes loading states with the ellipsis character, never three dots', () => {
    const found = FILES.flatMap(({ rel, src }) =>
      [...src.matchAll(THREE_DOTS)].map((m) => `${rel}: …${m[0]}`)
    );
    expect(found).toEqual([]);
  });

  it('never exclaims in system copy', () => {
    const found = FILES.flatMap(({ rel, src }) => EXCLAIMED.flatMap((re) => [...src.matchAll(re)].map((m) => `${rel}: ${m[0]}`)));
    expect(found).toEqual([]);
  });

  it('names the pages one way: "My Impact" for /impact, the (AI) Policy Guide for /advisor', () => {
    const links = FILES.flatMap(({ src }) => [...src.matchAll(/label:\s*'([^']+)',\s*href:\s*'\/(impact|advisor)'/g)]);
    expect(links.length).toBeGreaterThanOrEqual(4); // the navbar's and the footer's
    for (const [, label, route] of links) {
      if (route === 'impact') expect(label).toBe('My Impact');
      else expect(label).toMatch(/^(AI )?Policy Guide$/);
    }
    const navbar = FILES.find((f) => f.rel === 'components/layout/Navbar.tsx')!.src;
    const appLinks = [...navbar.matchAll(/\{ label: '([^']+)', href: '\/(?:dashboard|policies|impact|advisor)' \}/g)].map((m) => m[1]);
    expect(appLinks).toEqual(['Dashboard', 'Policies', 'My Impact', 'Policy Guide']);
  });

  it('labels tabs, quick prompts and chart axes in sentence case', () => {
    const labels = [...TABS.map((t) => TAB_LABELS[t]), ...QUICK_PROMPTS.map((p) => p.label), ...Object.values(RADAR_LABELS.expert)];
    expect(labels.filter((l) => !sentenceCase(l))).toEqual([]);
  });

  it('says when the feed was updated in running text: "Updated today", "1 week ago"', () => {
    const day = 24 * 60 * 60 * 1000;
    const ago = (days: number) => timeAgo(new Date(Date.now() - days * day - 60_000).toISOString());
    expect([0, 1, 3, 7, 13, 14, 29, 30, 59, 60].map(ago)).toEqual([
      'Today', 'Yesterday', '3 days ago', '1 week ago', '1 week ago', '2 weeks ago', '4 weeks ago', '1 month ago', '1 month ago', '2 months ago',
    ]);

    const feed: DashboardData['feed'] = {
      policies: [],
      loading: false,
      refreshing: false,
      updatedAt: new Date().toISOString(),
      error: null,
      needsOnboarding: false,
      analyzingIds: new Set(),
      analyzedIds: new Set(),
      impactById: new Map(),
      headingRef: createRef<HTMLHeadingElement>(),
      load: async () => {},
      analyze: async () => {},
      askAdvisor: () => {},
      dismiss: async () => null,
    };
    // (React marks the seam between the literal and the expression with an empty comment.)
    const html = renderToString(h(FeedSection, { feed })).replace(/<!-- -->/g, '');
    expect(html).toContain('Updated today');
    expect(html).toMatch(/<h2[^>]*>\s*Policy feed\s*<\/h2>/);
  });

  it('dates saved conversations the way the rest of the app dates things ("Oct 19, 2026")', () => {
    const session = { id: 's1', title: 'Rent and the housing bill', messages: [], created_at: '2026-10-19T12:00:00Z' };
    const html = renderToString(h(ConversationList, { sessions: [session], loading: false, activeId: null, onOpen: () => {}, onDelete: () => {} }));
    expect(html).toContain('Oct 19, 2026');
    const empty = renderToString(h(ConversationList, { sessions: [], loading: false, activeId: null, onOpen: () => {}, onDelete: () => {} }));
    expect(empty).toContain('No conversations yet.');
  });
});
