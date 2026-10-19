import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import type { DiscoveredPolicy } from '@/types';

// The analysed card's "View full impact" link reads the App Router.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));

const { default: PolicyFeedCard, FeedSkeletonCard } = await import('@/components/PolicyFeedCard');
const { default: PolicyDocket } = await import('@/components/feed/PolicyDocket');
const { default: BillPath } = await import('@/components/feed/BillPath');
const { default: PolicyProvenance } = await import('@/components/PolicyProvenance');

const AS_OF = '2026-10-18T09:00:00.000Z';

const VERIFIED: DiscoveredPolicy = {
  id: 'us-119-hr-1001',
  title: 'Working Families Tax Credit Act',
  billNumber: 'H.R. 1001',
  status: 'proposed',
  category: 'taxes',
  relevanceScore: 86,
  relevance: 'High',
  summary: 'Raises the refundable credit for households with children under 17.',
  description: 'Raises the refundable credit for households with children under 17.',
  direction: 'positive',
  estimatedImpact: '+$1,200/yr',
  reasons: ['You file as head of household', 'Your income is in the phase-in range', 'You have dependents'],
  region: 'Federal',
  record: {
    verified: true, source: 'congress.gov', sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1001',
    latestActionDate: '2026-09-15', latestAction: 'Referred to the Committee on Ways and Means.', asOf: AS_OF,
    status: 'proposed', billNumber: 'H.R. 1001', region: 'Federal', congress: 119, billType: 'hr', number: '1001',
  },
};

// An AI fallback item: no official record, whatever status the model gave it.
const UNVERIFIED: DiscoveredPolicy = {
  ...VERIFIED,
  id: 'us-hr-77',
  title: 'Home Energy Rebate Expansion',
  billNumber: 'H.R. 77',
  status: 'enacted',
  reasons: [],
  record: { verified: false, source: 'ai', asOf: AS_OF },
};

const noop = () => {};
const card = (policy: DiscoveredPolicy, extra: { analyzed?: boolean; impact?: number | null; analyzing?: boolean } = {}) =>
  renderToString(
    h(PolicyFeedCard, {
      policy,
      analyzed: !!extra.analyzed,
      impact: extra.impact,
      onAnalyze: noop,
      onAskAdvisor: noop,
      onDismiss: async () => null,
      analyzingIds: new Set(extra.analyzing ? [policy.id] : []),
    })
  );

/** Visible text of an HTML string, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** The markup of the first element carrying `attr`, through its matching close tag. */
function element(html: string, attr: string): string {
  const open = new RegExp(`<(\\w+)\\b[^>]*\\b${attr}[^>]*>`).exec(html);
  if (!open) return '';
  const tag = open[1];
  let depth = 0;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = open.index;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open.index, m.index + m[0].length);
  }
  return html.slice(open.index);
}

describe('PolicyFeedCard (the docket card)', () => {
  it('keeps the hooks the journey tests use: data-feed-card, an article named by its title, the bill number first', () => {
    const html = card(VERIFIED);
    expect(html).toMatch(/<div[^>]*data-feed-card=""[^>]*role="article"/);
    expect(html).toContain(`data-docket-key="${VERIFIED.id}"`);
    const title = element(html, 'data-feed-card-title=""');
    expect(title).toMatch(/^<h3 /);
    expect(title).toContain('tabindex="-1"');
    // The first span is the bill number; the title follows it (journey-steps cardTitle).
    expect(title).toMatch(/^<h3[^>]*><span[^>]*>H\.R\. 1001<\/span>Working Families Tax Credit Act<\/h3>$/);
    const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(title).toContain(`id="${labelledBy}"`);
  });

  it('offers "Analyze Impact", then "Analyzing..." while it runs, and "Ask the Guide"', () => {
    expect(text(card(VERIFIED))).toMatch(/Analyze Impact.*Ask the Guide/);
    const busy = card(VERIFIED, { analyzing: true });
    expect(text(busy)).toContain('Analyzing...');
    expect(busy).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"|<button[^>]*aria-busy="true"[^>]*disabled=""/);
    expect(text(card(VERIFIED))).toContain('Not relevant to me');
  });

  it('a verified record gets the gold seal and its source and chamber; never an "Unverified" chip', () => {
    const html = card(VERIFIED);
    expect(text(html)).toContain('Congress.gov · Federal · House');
    expect(html).toMatch(/data-decorative=""[^>]*class="[^"]*seal/);
    expect(text(html)).not.toContain('Unverified');
  });

  it('an unverified policy gets the "Unverified" chip, no seal, and no stage (its AI status is not shown)', () => {
    const html = card(UNVERIFIED);
    expect(text(html)).toContain('Unverified');
    expect(html).not.toMatch(/class="[^"]*seal/);
    expect(text(html)).toContain('Stage not shown');
    expect(text(html)).toContain('Not verified against an official source');
    expect(text(html)).not.toMatch(/became law|enacted/i);
    // No sheet travels a path it has no record of.
    expect(element(html, 'data-bill-path=""')).not.toMatch(/class="[^"]*sheet/);
  });

  it('shows why the policy is in the feed, when the feed says', () => {
    const html = card(VERIFIED);
    expect(text(html)).toContain('Why it\'s in your feed');
    for (const reason of VERIFIED.reasons) expect(text(html)).toContain(reason);
    expect(text(card(UNVERIFIED))).not.toContain('Why it');
  });

  it('shows where the bill stands from the record, with the date it was read', () => {
    const t = text(card(VERIFIED));
    expect(t).toContain('Where it stands: In committee');
    expect(t).toContain('stage 2 of 5');
    expect(t).toContain('as of Oct 18, 2026');
    expect(t).toMatch(/Latest action \(Sep 15, 2026\)\s*:\s*Referred to the Committee on Ways and Means\./);
  });

  it('after analysis: the signed figure with words, one "Analyzed" label, and "View Full Impact"', () => {
    const html = card(VERIFIED, { analyzed: true, impact: 1200 });
    const t = text(html);
    expect(t).toContain('+$1,200/yr for you');
    // One element holds the whole figure (the journey test finds it by its text).
    expect(html).toMatch(/<p[^>]*text-gain[^>]*>(<svg[\s\S]*?<\/svg>)?\+\$1,200\/yr<!-- --> for you<\/p>/);
    expect(t).toContain('saves you money');
    expect(t.match(/analyzed/gi)).toHaveLength(1);
    expect(t).toContain('View Full Impact');
    expect(t).not.toContain('Analyze Impact');

    const cost = text(card(VERIFIED, { analyzed: true, impact: -300 }));
    expect(cost).toContain('−$300/yr for you');
    expect(cost).toContain('costs you money');
    expect(card(VERIFIED, { analyzed: true, impact: -300 })).toMatch(/text-loss/);
  });

  it('before analysis, the feed estimate is marked as an estimate, and words stay words', () => {
    expect(text(card(VERIFIED))).toContain('+$1,200/yr est. impact');
    expect(text(card({ ...VERIFIED, estimatedImpact: 'Depends on local rents' }))).toContain('Estimated impact: Depends on local rents');
  });

  it('relevance is violet, never the gain/loss colours or gold', () => {
    const html = card(VERIFIED);
    const meter = html.match(/<p class="([^"]*)">(?:(?!<\/p>).)*relevance<\/span><\/p>/);
    expect(meter?.[1]).toContain('text-primary-300');
    expect(meter?.[0]).not.toMatch(/text-(gain|loss|gold)|bg-(gain|loss|gold)/);
    expect(text(meter?.[0] ?? '')).toMatch(/86 · High relevance/);
  });

  it('the skeleton is hidden from assistive tech', () => {
    expect(renderToString(h(FeedSkeletonCard))).toMatch(/^<div[^>]*aria-hidden="true"/);
  });
});

describe('PolicyDocket', () => {
  it('lays the cards out as direct children, in a stack or a grid', () => {
    const stack = renderToString(h(PolicyDocket, { layout: 'stack', children: [h('div', { key: 'a', 'data-docket-key': 'a' }, 'A')] }));
    expect(stack).toMatch(/^<div data-docket="stack" class="[^"]*flex-col/);
    expect(stack).toContain('<div data-docket-key="a">A</div></div>');
    const grid = renderToString(h(PolicyDocket, { layout: 'grid', children: [h('div', { key: 'a' }, 'A')] }));
    expect(grid).toMatch(/data-docket="grid" class="[^"]*grid-cols-1[^"]*md:grid-cols-2[^"]*xl:grid-cols-3/);
  });
});

describe('BillPath', () => {
  it('draws the lane decoratively and says where the bill stands in words', () => {
    const html = renderToString(h(BillPath, { record: VERIFIED.record }));
    expect(html).toMatch(/data-outcome="in-progress"/);
    expect(html).toMatch(/--n:5;--reached:1/);
    // The lane, the markers and the stage names are aria-hidden; the caption is what's read.
    expect(html).toMatch(/<div aria-hidden="true" data-decorative="">/);
    expect(text(html)).toContain('Where it stands: In committee');
  });

  it('a law is every stage done, ending in gold; an unknown record shows no stage', () => {
    const law = renderToString(h(BillPath, { record: { ...VERIFIED.record!, status: 'enacted', latestAction: 'Became Public Law No: 119-21.' } }));
    expect(law).toContain('data-outcome="enacted"');
    expect(text(law)).toContain('Became law');
    expect(law.match(/data-state="done"/g)).toHaveLength(5);
    const unknown = renderToString(h(BillPath, {}));
    expect(unknown).toContain('data-outcome="unknown"');
    expect(unknown.match(/data-state="upcoming"/g)).toHaveLength(5);
  });

  it('moves only with transforms, so nothing is ever left transparent', () => {
    for (const file of ['billPath.module.css', 'docket.module.css']) {
      const css = readFileSync(path.resolve(__dirname, '../components/feed', file), 'utf8');
      const keyframes = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g) ?? [];
      for (const k of keyframes) expect(k, file).not.toMatch(/opacity/);
      expect(css, file).not.toMatch(/transition:[^;]*opacity/);
    }
  });
});

describe('PolicyProvenance', () => {
  it('marks the official record in gold and prints dates the same in every time zone', () => {
    const html = renderToString(h(PolicyProvenance, { record: VERIFIED.record }));
    expect(html).toMatch(/text-gold/);
    expect(html).not.toMatch(/text-gain/);
    expect(text(html)).toContain('as of Oct 18, 2026');
    expect(text(html)).toContain('Latest action (Sep 15, 2026)');
  });
});
