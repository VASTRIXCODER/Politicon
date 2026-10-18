import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';

// The page chrome needs the Next app router; these tests look at the page
// bodies, so the navbar and footer stand aside.
vi.mock('@/components/layout/Navbar', () => ({ default: () => null }));
vi.mock('@/components/layout/Footer', () => ({ default: () => null }));

const { default: LegalPage, Section, sectionId, withAnchors } = await import('@/components/legal/LegalPage');
const { default: PrivacyPage } = await import('@/app/privacy/page');
const { default: TermsPage } = await import('@/app/terms/page');
const { default: DisclaimerPage } = await import('@/app/disclaimer/page');
const { default: HelpPage } = await import('@/app/help/page');
const { default: NotFound } = await import('@/app/not-found');
const { default: AuthPanel } = await import('@/components/auth/AuthPanel');
const { default: AuthCard } = await import('@/components/auth/AuthCard');

/** Visible text of an HTML string, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** The text of every <h1>, without the parts hidden from assistive tech. */
const h1s = (html: string) =>
  [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => text(m[1].replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, '')));

/** The ids that same-page links point at, and the ids on the page. */
function anchors(html: string) {
  const links = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  return { links, ids };
}

describe('reading pages', () => {
  const PAGES = [
    { name: 'Privacy', render: () => h(PrivacyPage), h1: /^privacy policy$/i },
    { name: 'Terms', render: () => h(TermsPage), h1: /^terms of service$/i },
    { name: 'Disclaimer', render: () => h(DisclaimerPage), h1: /^disclaimer$/i },
    { name: 'Help', render: () => h(HelpPage), h1: /^help$/i },
  ];

  for (const page of PAGES) {
    it(`${page.name} has exactly one h1, reading only the page's name`, () => {
      const titles = h1s(renderToString(page.render()));
      expect(titles).toHaveLength(1);
      expect(titles[0]).toMatch(page.h1);
    });

    it(`${page.name}: every table-of-contents link lands on a section`, () => {
      const { links, ids } = anchors(renderToString(page.render()));
      for (const id of links) expect(ids.has(id), `#${id}`).toBe(true);
    });
  }

  it('builds the contents from the sections, numbered and with unique anchors', () => {
    const { entries } = withAnchors([
      h(Section, { key: 'a', title: 'What we collect', children: 'a' }),
      h('p', { key: 'p' }, 'not a section'),
      h(Section, { key: 'b', title: 'Contact', children: 'b' }),
      h(Section, { key: 'c', title: 'Contact', children: 'c' }),
    ]);
    expect(entries).toEqual([
      { id: 'what-we-collect', title: 'What we collect' },
      { id: 'contact', title: 'Contact' },
      { id: 'contact-2', title: 'Contact' },
    ]);
    expect(sectionId('Who processes your data?')).toBe('who-processes-your-data');
  });

  it('lists every privacy section in the contents, in order', () => {
    const html = renderToString(h(PrivacyPage));
    const { links } = anchors(html);
    // Twice: the sticky contents on wide screens and the folded one on phones.
    expect(links.filter((id) => id === 'who-can-use-politicon')).toHaveLength(2);
    expect([...new Set(links)].slice(0, 3)).toEqual(['who-can-use-politicon', 'what-we-collect', 'how-we-use-it']);
  });

  it('stamps the last-updated date beside a decorative record seal', () => {
    const html = renderToString(
      h(LegalPage, { title: 'Terms of Service', intro: 'Intro.', updated: '2026-10-07', children: h(Section, { title: 'One', children: 'x' }) })
    );
    expect(text(html)).toMatch(/Last updated October 7, 2026/);
    expect(html).toMatch(/<time dateTime="2026-10-07"/i);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-decorative=""[^>]*class="[^"]*text-gold/);
  });

  it('asks Help questions as native disclosures and keeps the support address', () => {
    const html = renderToString(h(HelpPage));
    expect((html.match(/<details\b/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((html.match(/<summary\b/g) ?? []).length).toBe((html.match(/<details\b/g) ?? []).length);
    expect(text(html)).toMatch(/Will Politicon tell me how to vote\?/);
    expect(text(html)).toMatch(/Contact support/);
    expect(html).toMatch(/href="mailto:[^"]+@[^"]+"/);
  });
});

describe('404 page', () => {
  const html = renderToString(h(NotFound));

  it('says so in its only h1 and links home', () => {
    const titles = h1s(html);
    expect(titles).toHaveLength(1);
    expect(titles[0]).toMatch(/couldn.t find that page/i);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>[^<]*home page/i);
  });

  it('draws its lost bill as decoration, with the caption in the DOM', () => {
    expect(html).toMatch(/data-scene-view="poster"/);
    expect(html).toMatch(/<div[^>]*aria-hidden="true"[^>]*data-decorative=""[^>]*data-scene-view=/);
    expect(text(html)).toMatch(/Fig\. 404/);
  });

  it('marks the page’s place in the bill-style progress', () => {
    expect(html).toMatch(/<li aria-current="step"[^>]*>[\s\S]*?In committee/);
  });
});

describe('sign-in and sign-up night panel', () => {
  for (const kind of ['signin', 'signup'] as const) {
    const html = renderToString(h(AuthPanel, { kind }));
    const t = text(html);

    it(`${kind}: labels its figures as examples, with a gain and a cost in words`, () => {
      expect(t).toMatch(/Example/);
      expect(t).toMatch(/Hypothetical policies, illustrative figures\./);
      expect(t).toMatch(/\+\$[\d,]+\/yr could save/);
      expect(t).toMatch(/−\$[\d,]+\/yr could cost/);
    });

    it(`${kind}: renders the seal as a server poster, with no 3D or night-field claim before the page knows its width`, () => {
      expect(html).not.toMatch(/data-scene-night/);
      expect(html).not.toMatch(/data-scene-view/);
      expect(html).toMatch(/data-night=""/);
    });

    it(`${kind}: has no h1 (the form's heading is the page's only one) and nothing focusable`, () => {
      expect(html).not.toMatch(/<h1\b/);
      expect(html).not.toMatch(/<(a|button|input|select|textarea)\b|tabindex="0"/);
    });
  }
});

describe('AuthCard', () => {
  it('puts the title in its h1 and the eyebrow above it', () => {
    const html = renderToString(h(AuthCard, { title: 'Reset your password', eyebrow: 'Account recovery', subtitle: 'Sub.', children: 'form' }));
    expect(h1s(html)).toEqual(['Reset your password']);
    expect(text(html)).toMatch(/Account recovery Reset your password Sub\./);
    expect(html).toMatch(/<main id="main" tabindex="-1"/i);
  });
});
