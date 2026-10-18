import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import StatsSection from '@/components/landing/StatsSection';
import FeatureShowcase from '@/components/landing/FeatureShowcase';
import ShareableCards from '@/components/landing/ShareableCards';
import PublicExplorer from '@/components/landing/PublicExplorer';
import NewsletterSection from '@/components/landing/NewsletterSection';
import ClosingCta from '@/components/landing/ClosingCta';
import {
  FEED_EXAMPLES,
  GUIDE_EXAMPLE,
  LEDGER_LINES,
  LEDGER_NET,
  POLICY_EXAMPLE,
  SHARE_EXAMPLES,
  scalePct,
} from '@/components/landing/mockups/data';
import { BRACKETS, CHART_SCALE, ILLUSTRATIVE_NOTE } from '@/lib/explorerData';

/** No measured figures (lib/server/publicStats NO_PUBLIC_STATS; that module is server-only). */
const NO_PUBLIC_STATS = { members: null, analyses: null, medianAnnualImpact: null };

/** Visible text of an HTML string, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim();

/** The markup of every element carrying aria-hidden="true", outermost first (nested ones are inside). */
function hiddenBlocks(html: string): string[] {
  const blocks: string[] = [];
  const open = /<(\w+)\b[^>]*\baria-hidden="true"[^>]*>/g;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const tag = m[1];
    // Walk forward to the matching close tag of the same name.
    const re = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, 'g');
    re.lastIndex = m.index;
    let depth = 0;
    let end = html.length;
    for (let t = re.exec(html); t; t = re.exec(html)) {
      if (t[0].startsWith('</')) depth--;
      else if (!t[1]) depth++;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    blocks.push(html.slice(m.index, end));
    open.lastIndex = end;
  }
  return blocks;
}

const FOCUSABLE = /<(a|button|input|select|textarea)\b|tabindex="0"/;
/** The hero's sign-up link; the landing page must have exactly one link by this name, and it's the hero's. */
const HERO_CTA = /get my impact report/i;

const ALL_SECTIONS = [
  () => h(StatsSection, { stats: NO_PUBLIC_STATS, stateBills: true }),
  () => h(FeatureShowcase, { stateBills: true }),
  () => h(ShareableCards),
  () => h(PublicExplorer),
  () => h(NewsletterSection),
  () => h(ClosingCta, { stateBills: true }),
];

describe('landing sections', () => {
  it('never repeat the hero’s “Get My Impact Report” link, and hide nothing focusable from assistive tech', () => {
    for (const section of ALL_SECTIONS) {
      const html = renderToString(section());
      expect(text(html)).not.toMatch(HERO_CTA);
      for (const block of hiddenBlocks(html)) expect(block).not.toMatch(FOCUSABLE);
    }
  });

  it('render no transparent text in the server HTML', () => {
    for (const section of ALL_SECTIONS) {
      const html = renderToString(section());
      expect(html).not.toMatch(/opacity:\s*0[;"]/);
      expect(html).not.toMatch(/data-reveal=/);
    }
  });
});

describe('StatsSection', () => {
  it('shows only the plain rules when there are no measured figures', () => {
    const t = text(renderToString(h(StatsSection, { stats: NO_PUBLIC_STATS, stateBills: false })));
    expect(t).toMatch(/Built on official records/);
    expect(t).not.toMatch(/Politicon in numbers|Members|Personal analyses/);
    expect(t).toMatch(/Ranges only/);
    // State coverage is claimed only when Open States is configured.
    expect(t).not.toMatch(/50 states|Open States/);
    expect(text(renderToString(h(StatsSection, { stats: NO_PUBLIC_STATS, stateBills: true })))).toMatch(/50 states/);
  });

  it('shows exactly the measured figures it is given, with their source note', () => {
    const t = text(
      renderToString(h(StatsSection, { stats: { members: 1234, analyses: null, medianAnnualImpact: 410 }, stateBills: true }))
    );
    expect(t).toMatch(/Politicon in numbers/);
    expect(t).toMatch(/1,234/);
    expect(t).toMatch(/\$410 per year/);
    expect(t).not.toMatch(/Personal analyses/);
    expect(t).toMatch(/refreshed every 15 minutes/);
  });
});

describe('FeatureShowcase', () => {
  const html = renderToString(h(FeatureShowcase, { stateBills: false }));
  const t = text(html);

  it('captions every mockup, in the DOM, as an illustrative example', () => {
    const captions = html.match(/<figcaption[\s\S]*?<\/figcaption>/g) ?? [];
    expect(captions).toHaveLength(3);
    for (const caption of captions) {
      expect(text(caption)).toMatch(/^Example\b/);
      expect(text(caption)).toMatch(/Illustrative figures, not a real analysis\./);
    }
  });

  it('draws the mockups as decoration only', () => {
    const stages = html.match(/<div[^>]*aria-hidden="true"[^>]*data-decorative=""[^>]*data-facing=/g) ?? [];
    expect(stages).toHaveLength(3);
    // …and the decorative blocks the focus check walks really are those stages.
    expect(hiddenBlocks(html).filter((b) => b.includes('data-facing=')).length).toBe(3);
  });

  it('claims state bills only when they are loaded', () => {
    expect(t).not.toMatch(/state legislature/);
    expect(text(renderToString(h(FeatureShowcase, { stateBills: true })))).toMatch(/state legislature/);
  });

  it('labels the record’s gold seal with an example bill, never a real bill number', () => {
    expect(t).toMatch(/Example bill/);
    expect(t).not.toMatch(/\b(H\.R\.|S\.)\s?\d/);
  });
});

describe('ShareableCards', () => {
  it('says the feature is not built yet and labels every card an example', () => {
    const html = renderToString(h(ShareableCards));
    const t = text(html);
    expect(t).toMatch(/Coming soon/);
    expect(t).toMatch(/isn't available yet/);
    expect(t.match(/Example/g)?.length ?? 0).toBeGreaterThanOrEqual(SHARE_EXAMPLES.length);
    expect(html).toMatch(/href="\/auth\/signup"/);
  });
});

describe('PublicExplorer teaser', () => {
  const html = renderToString(h(PublicExplorer));
  const t = text(html);

  it('is labelled illustrative and links to the explorer', () => {
    expect(t).toMatch(/Illustrative/);
    expect(t).toContain(ILLUSTRATIVE_NOTE);
    expect(html).toMatch(/<a[^>]*href="\/explorer"[^>]*>[\s\S]*?Try the Explorer/);
  });

  it('offers every bracket as a native radio, one of them checked, with a panel each', () => {
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(BRACKETS.length);
    expect(radios.filter((r) => /\bchecked=""/.test(r))).toHaveLength(1);
    for (const b of BRACKETS) {
      expect(html).toContain(`value="${b.key}"`);
      expect(html).toContain(`data-bracket="${b.key}"`);
    }
    expect(html).toMatch(/<legend[^>]*>Income bracket<\/legend>/);
  });

  it('has a CSS rule for every bracket (the picker works through :has)', () => {
    const css = readFileSync(path.resolve(__dirname, '../components/landing/mockups/explorer.module.css'), 'utf8');
    for (const b of BRACKETS) {
      expect(css).toContain(`input[value='${b.key}']:checked) .panel[data-bracket='${b.key}']`);
      expect(css).toContain(`input[value='${b.key}']:checked) .district[data-bracket='${b.key}']`);
    }
  });
});

describe('NewsletterSection', () => {
  it('keeps its label, live regions and the field wiring', () => {
    const html = renderToString(h(NewsletterSection));
    expect(html).toMatch(/<label[^>]*for="newsletter-email"[^>]*>Email address<\/label>/);
    expect(html).toMatch(/<input[^>]*id="newsletter-email"[^>]*type="email"/);
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/id="newsletter-error"[^>]*role="alert"/);
    expect(text(html)).toMatch(/Join the list/);
  });
});

describe('ClosingCta', () => {
  it('is a night section the stage can paint, with its own background', () => {
    const html = renderToString(h(ClosingCta, { stateBills: false }));
    const section = html.match(/<section[^>]*>/)?.[0] ?? '';
    expect(section).toMatch(/data-night=""/);
    expect(section).toMatch(/data-scene-night=""/);
    expect(section).toMatch(/\bbg-canvas\b/);
  });

  it('links to sign-up and the explorer with honest microcopy', () => {
    const html = renderToString(h(ClosingCta, { stateBills: false }));
    const t = text(html);
    expect(html).toMatch(/<a[^>]*href="\/auth\/signup"[^>]*>[\s\S]*?Create your free report/);
    expect(html).toMatch(/<a[^>]*href="\/explorer"[^>]*>[\s\S]*?Try the Explorer/);
    expect(t).toMatch(/Free/);
    expect(t).toMatch(/Not financial, tax or legal advice/);
    expect(t).toMatch(/18\+/);
    expect(t).not.toMatch(/state legislature/);
    expect(text(renderToString(h(ClosingCta, { stateBills: true })))).toMatch(/state legislature/);
  });
});

describe('mockup examples', () => {
  it('show gains and costs side by side', () => {
    const signs = (xs: number[]) => [xs.some((x) => x > 0), xs.some((x) => x < 0)];
    expect(signs(FEED_EXAMPLES.map((f) => f.impact.annual))).toEqual([true, true]);
    expect(signs(LEDGER_LINES.map((l) => l.amount))).toEqual([true, true]);
    expect(signs(SHARE_EXAMPLES.map((s) => s.annual))).toEqual([true, true]);
    expect(signs([GUIDE_EXAMPLE.asker.annual, GUIDE_EXAMPLE.contrast.annual])).toEqual([true, true]);
    expect(LEDGER_NET).toBe(LEDGER_LINES.reduce((s, l) => s + l.amount, 0));
    expect(FEED_EXAMPLES[0].impact).toBe(POLICY_EXAMPLE);
  });

  it('draw on the explorer chart’s one linear scale', () => {
    expect(scalePct(0)).toBe(0);
    expect(scalePct(CHART_SCALE)).toBe(100);
    expect(scalePct(-CHART_SCALE / 2)).toBe(50);
    // A small amount keeps a visible sliver.
    expect(scalePct(1)).toBeGreaterThan(0);
  });
});
