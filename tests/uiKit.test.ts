import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import GlassCard, { type GlassCardProps } from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Skeleton from '@/components/ui/Skeleton';
import StatTile, { describeDelta } from '@/components/ui/StatTile';
import Surface from '@/components/ui/Surface';
import ThemeChoice from '@/components/ui/ThemeChoice';
import ThemeToggle from '@/components/ui/ThemeToggle';

// What the server sends: these components must render meaningful, stable HTML
// before any effect runs (and the same HTML the first client render produces).

const attr = (html: string, tag: string, name: string) =>
  [...html.matchAll(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`, 'g'))].map((m) => m[1]);

describe('Button', () => {
  it('is a type="button" <button> by default', () => {
    const html = renderToString(h(Button, null, 'Save'));
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain('>Save</button>');
  });

  it('renders a link with href, and an inert disabled link without one', () => {
    expect(renderToString(h(Button, { href: '/explorer', variant: 'ghost' }, 'Try the Explorer'))).toMatch(
      /^<a [^>]*href="\/explorer"/
    );
    const disabled = renderToString(h(Button, { href: '/explorer', disabled: true }, 'Try'));
    expect(disabled).toMatch(/^<a /);
    expect(disabled).not.toContain('href=');
    expect(disabled).toContain('role="link"');
    expect(disabled).toContain('aria-disabled="true"');
  });

  it('lets a caller override the shape and padding', () => {
    const [cls] = attr(renderToString(h(Button, { className: 'rounded-2xl px-5' }, 'Go')), 'button', 'class');
    expect(cls.split(' ')).toContain('rounded-2xl');
    expect(cls.split(' ')).not.toContain('rounded-full');
    expect(cls.split(' ')).toContain('px-5');
    expect(cls.split(' ')).not.toContain('px-6');
  });

  it('keeps md and lg at a 44px+ touch target', () => {
    for (const size of ['md', 'lg'] as const) {
      const [cls] = attr(renderToString(h(Button, { size }, 'Go')), 'button', 'class');
      expect(cls, size).toMatch(/\bmin-h-1[12]\b/);
    }
  });

  it('draws primary as violet light, and leaves hover styles off while disabled', () => {
    const [on] = attr(renderToString(h(Button, null, 'Go')), 'button', 'class');
    expect(on).toContain('shimmer-btn');
    expect(on).toContain('text-white');
    const [off] = attr(renderToString(h(Button, { disabled: true }, 'Go')), 'button', 'class');
    expect(off).not.toMatch(/(^|\s)hover:/);
    expect(off).toContain('opacity-50');
  });

  it('hides the icon from assistive tech', () => {
    const html = renderToString(h(Button, { icon: h('svg') }, 'Next'));
    expect(html).toContain('<span class="flex-shrink-0" aria-hidden="true"><svg></svg></span>');
  });
});

describe('ThemeToggle', () => {
  it('ships both states so CSS can show the right one before hydration', () => {
    const html = renderToString(h(ThemeToggle));
    expect(html).toContain('Switch to dark theme');
    expect(html).toContain('Switch to light theme');
    // The light-state label hides in the dark theme, the dark-state label shows only there.
    expect(html).toMatch(/class="sr-only \[\[data-theme=dark\]_&amp;\]:hidden">Switch to dark theme/);
    expect(html).toMatch(/class="sr-only hidden \[\[data-theme=dark\]_&amp;\]:inline">Switch to light theme/);
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('aria-label');
  });

  it('renders identically every time (no theme read during render)', () => {
    expect(renderToString(h(ThemeToggle))).toBe(renderToString(h(ThemeToggle)));
  });

  it('offers Light, Dark and System as a radio group in settings (ThemeChoice)', () => {
    const html = renderToString(h(ThemeChoice));
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Theme"');
    expect(attr(html, 'button', 'role')).toEqual(['radio', 'radio', 'radio']);
    // The server assumes the default (light) preference.
    expect(attr(html, 'button', 'aria-checked')).toEqual(['true', 'false', 'false']);
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B', disabled: true },
    { value: 'c', label: 'C' },
  ] as const;
  const render = (value: string | undefined) =>
    renderToString(h(SegmentedControl<string>, { label: 'Pick', options, value, onValueChange: () => {} }));

  it('makes only the selected option a Tab stop', () => {
    const html = render('c');
    expect(attr(html, 'button', 'tabindex')).toEqual(['-1', '-1', '0']);
    expect(attr(html, 'button', 'aria-checked')).toEqual(['false', 'false', 'true']);
  });

  it('falls back to the first enabled option when nothing is selected', () => {
    const html = render(undefined);
    expect(attr(html, 'button', 'tabindex')).toEqual(['0', '-1', '-1']);
    // No thumb without a selection.
    expect(html).not.toContain('translateX');
  });

  it('places the thumb under the selected segment', () => {
    expect(render('c')).toContain('transform:translateX(200%)');
  });
});

describe('StatTile', () => {
  it('describes a change with a sign and words', () => {
    expect(describeDelta({ value: 120 })).toMatchObject({ sign: '+', figure: '120', words: 'up', direction: 'up' });
    expect(describeDelta({ value: -1240, format: (n) => `$${n.toLocaleString('en-US')}` })).toMatchObject({
      sign: '−',
      figure: '$1,240',
      words: 'down',
    });
    expect(describeDelta({ value: -5, words: { up: 'saves you', down: 'costs you' } }).words).toBe('costs you');
    expect(describeDelta({ value: 0 })).toMatchObject({ sign: '', words: 'no change', direction: 'flat' });
  });

  it('prints the delta in text, not only in colour', () => {
    const html = renderToString(
      h(StatTile, { label: 'Net', value: '$1,240', delta: { value: -80, words: { up: 'saves you', down: 'costs you' } } })
    );
    expect(html).toContain('−<!-- -->80');
    expect(html).toContain('costs you');
    expect(html).toContain('text-loss');
  });

  it('colours a rise as a cost when down is the good direction', () => {
    expect(renderToString(h(StatTile, { label: 'Tax', value: '$9', delta: { value: 3, good: 'down' } }))).toContain('text-loss');
    expect(renderToString(h(StatTile, { label: 'Tax', value: '$9', delta: { value: 3, good: 'none' } }))).not.toMatch(
      /text-(gain|loss)/
    );
  });
});

describe('Surface', () => {
  it('flips tokens to night inside a night pane', () => {
    const html = renderToString(h(Surface, { variant: 'night', as: 'section' }, 'x'));
    expect(html).toMatch(/^<section data-night=""/);
  });

  it('adds the spotlight only to interactive panes', () => {
    expect(renderToString(h(Surface, null, 'x'))).not.toContain('data-decorative');
    const html = renderToString(h(Surface, { interactive: true }, 'x'));
    expect(html).toContain('aria-hidden="true" data-decorative=""');
    expect(html).toContain('isolate');
  });

  it('uses the padding and radius scale', () => {
    const [cls] = attr(renderToString(h(Surface, { pad: 'none', radius: 'tile' }, 'x')), 'div', 'class');
    expect(cls).toContain('rounded-tile');
    expect(cls).not.toMatch(/\bp-\d/);
  });
});

describe('GlassCard (compatibility)', () => {
  it('draws a solid paper pane and keeps the caller radius', () => {
    const [cls] = attr(renderToString(h(GlassCard, { animate: false, className: 'rounded-3xl p-7', children: 'x' })), 'div', 'class');
    expect(cls).toContain('bg-surface');
    expect(cls).toContain('rounded-3xl');
    expect(cls).not.toContain('rounded-2xl');
    expect(cls).toContain('p-7');
  });

  it('passes data attributes and roles through', () => {
    // data-* attributes are only typed in JSX, hence the cast.
    const props = { animate: false, role: 'article', 'data-feed-card': '', children: 'x' } as GlassCardProps;
    const html = renderToString(h(GlassCard, props));
    expect(html).toContain('role="article"');
    expect(html).toContain('data-feed-card=""');
  });
});

describe('PageHeader', () => {
  it('sets the title in the display face at the display size', () => {
    const html = renderToString(h(PageHeader, { title: h('span', null, 'What this bill ', h('em', null, 'means for you')) }));
    const [cls] = attr(html, 'h1', 'class');
    expect(cls).toContain('text-display-md');
    expect(cls).toContain('font-display');
    expect(html).toContain('<em>means for you</em>');
  });

  it('renders an h2 for section headers', () => {
    const [cls] = attr(renderToString(h(PageHeader, { as: 'h2', title: 'Settings' })), 'h2', 'class');
    expect(cls).toContain('text-display-sm');
  });
});

describe('Skeleton and ConfirmDialog', () => {
  it('hides skeletons from assistive tech', () => {
    expect(renderToString(h(Skeleton))).toMatch(/^<span aria-hidden="true" data-decorative=""/);
  });

  it('server-renders the dialog closed, named and described', () => {
    const html = renderToString(
      h(ConfirmDialog, {
        open: false,
        title: 'Delete this analysis?',
        body: "This can't be undone.",
        confirmLabel: 'Delete',
        tone: 'danger',
        onConfirm: () => {},
        onCancel: () => {},
      })
    );
    expect(html).toMatch(/^<dialog\b/);
    expect(html).not.toMatch(/<dialog[^>]*\sopen/);
    expect(html).toContain('role="alertdialog"');
    const [labelledBy] = attr(html, 'dialog', 'aria-labelledby');
    expect(html).toContain(`id="${labelledBy}"`);
    expect(html).toContain('>Cancel</button>');
    expect(html).toContain('>Delete</button>');
  });
});
