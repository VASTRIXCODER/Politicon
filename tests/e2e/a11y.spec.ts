import AxeBuilder from '@axe-core/playwright';
import { MISSING_PATH, NOT_FOUND_H1, PUBLIC_PAGES, expect, openPage, test } from './support';

// axe-core scan of every public page against WCAG 2.0/2.1/2.2 A and AA.
// Serious and critical violations fail; moderate and minor ones are attached
// to the report for review.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);

interface KnownIssue {
  /** axe rule id. */
  rule: string;
  /** Matched against each failing node's selector; only those nodes are let through. */
  target: RegExp;
  /** What's wrong and where, for whoever fixes it. */
  why: string;
}

/**
 * Known violations still to fix, by path. Only the listed rule on the matching
 * nodes is let through, so the rest of the page stays checked; each is noted
 * on the test as a "fixme" annotation. Delete an entry once it's fixed (a
 * stale entry is reported as a "stale-known-issue" annotation, not a failure).
 */
const KNOWN: Record<string, KnownIssue[]> = {};

// Scan the final layout: reduced motion shows scroll-reveal sections at once
// (they are otherwise transparent until scrolled to, and axe skips them).
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const PAGES = [...PUBLIC_PAGES, { path: MISSING_PATH, h1: NOT_FOUND_H1 }];

for (const { path, h1 } of PAGES) {
  test(`${path === MISSING_PATH ? 'the 404 page' : path} has no serious WCAG 2.2 AA violations`, async ({ page }, testInfo) => {
    await openPage(page, path, h1);
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      // Pure decoration (aria-hidden and marked data-decorative) is exempt from
      // contrast requirements under WCAG 1.4.3.
      .exclude('[aria-hidden="true"][data-decorative]')
      // No CSSOM preload: axe would re-fetch cross-origin stylesheets (Fontshare),
      // which the CSP's connect-src rightly refuses. It only feeds css-orientation-lock.
      .options({ preload: false })
      .analyze();

    const known = KNOWN[path] ?? [];
    const seen = new Set<KnownIssue>();
    const blocking = results.violations
      .filter((v) => BLOCKING.has(v.impact ?? ''))
      .map((v) => ({
        ...v,
        nodes: v.nodes.filter((n) => {
          const issue = known.find((k) => k.rule === v.id && k.target.test(n.target.join(' ')));
          if (issue) seen.add(issue);
          return !issue;
        }),
      }))
      .filter((v) => v.nodes.length);

    for (const issue of known) {
      testInfo.annotations.push(
        seen.has(issue)
          ? { type: 'fixme', description: `${issue.rule}: ${issue.why}` }
          : { type: 'stale-known-issue', description: `${issue.rule} no longer found on ${path}; remove it from KNOWN in a11y.spec.ts` },
      );
    }

    const minor = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ''));
    if (minor.length) {
      await testInfo.attach('axe-minor-violations.json', { body: JSON.stringify(minor, null, 2), contentType: 'application/json' });
    }

    const summary = blocking.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} ${v.helpUrl}\n` +
        v.nodes
          .slice(0, 5)
          .map((n) => `    ${n.target.join(' ')}: ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`)
          .join('\n'),
    );
    expect(blocking.map((v) => v.id), summary.join('\n')).toEqual([]);
  });
}
