import { describe, expect, it, vi } from 'vitest';
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';

// next/form needs the app router; here it is only the <form> it renders.
vi.mock('next/form', () => ({
  default: ({ children, action, prefetch: _prefetch, ...props }: { children: ReactNode; action: string; prefetch?: boolean }) =>
    h('form', { action, ...props }, children),
}));

const { default: HeroSection, HERO_END } = await import('@/components/landing/HeroSection');

describe('the hero’s first paint', () => {
  const html = renderToString(h(HeroSection, { stateBills: false }));

  it('sends the receipt in the HTML right after the copy, before the heavy Capitol drawing', () => {
    // A slow phone can paint the part of the page parsed so far: the receipt
    // must not wait behind the drawing (its place on screen is the grid's).
    const h1 = html.indexOf('id="hero-heading"');
    const receipt = html.indexOf('aria-roledescription="carousel"');
    const drawing = html.indexOf('viewBox="0 0 640 600"');
    expect(h1).toBeGreaterThan(-1);
    expect(receipt).toBeGreaterThan(h1);
    expect(drawing).toBeGreaterThan(receipt);
    // The first example in full, in the server HTML.
    expect(html).toContain('Policy receipt');
    expect(html).toContain('Cumulative estimate');
  });

  it('holds the first render until the whole hero is parsed, and marks where it ends', () => {
    expect(html).toMatch(new RegExp(`<link rel="expect" href="#${HERO_END}" blocking="render"/>`));
    const end = html.indexOf(`id="${HERO_END}"`);
    expect(end).toBeGreaterThan(html.indexOf('viewBox="0 0 640 600"'));
    expect(end).toBeGreaterThan(html.indexOf('aria-roledescription="carousel"'));
    // Exactly one target, so the hint can never wait for the whole page.
    expect(html.split(`id="${HERO_END}"`)).toHaveLength(2);
  });
});
