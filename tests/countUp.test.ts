import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import CountUp from '@/components/ui/CountUp';

// What a no-JS visitor or a crawler reads: the server HTML, before any effect runs.
const visibleText = (html: string) =>
  (html.match(/<span aria-hidden="true">(.*?)<\/span>/)?.[1] ?? '').replace(/<!-- -->/g, '');

describe('CountUp server HTML', () => {
  it('shows the real value, not the starting 0', () => {
    expect(visibleText(renderToString(createElement(CountUp, { value: 1240 })))).toBe('1,240');
    expect(visibleText(renderToString(createElement(CountUp, { value: 412, prefix: '$', from: 0 })))).toBe('$412');
  });

  it('keeps custom formatting and the screen-reader label', () => {
    const html = renderToString(
      createElement(CountUp, { value: -80, format: (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(n)}`, srLabel: '−$80 per year' })
    );
    expect(visibleText(html)).toBe('−$80');
    expect(html).toContain('<span class="sr-only">−$80 per year</span>');
  });
});
