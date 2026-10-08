import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { AnalysisOutput, FeedOutput, PolicyReplyOutput, toStrictJsonSchema } = await import('@/lib/server/aiSchemas');

function walk(node: unknown, visit: (n: Record<string, unknown>) => void) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return; }
  visit(node as Record<string, unknown>);
  Object.values(node).forEach((v) => walk(v, visit));
}

describe('JSON schemas sent to the API', () => {
  const schemas = { AnalysisOutput, FeedOutput, PolicyReplyOutput };

  it.each(Object.entries(schemas))('%s: objects closed, every field required, no unsupported keywords', (_name, schema) => {
    const json = toStrictJsonSchema(schema);
    walk(json, (n) => {
      if (n.type === 'object' && n.properties) {
        expect(n.additionalProperties).toBe(false);
        expect(new Set(n.required as string[])).toEqual(new Set(Object.keys(n.properties as object)));
      }
      for (const k of ['$schema', 'minimum', 'maximum', 'default']) expect(n).not.toHaveProperty(k);
    });
  });

  it('keeps enums so the API constrains them', () => {
    const feed = JSON.stringify(toStrictJsonSchema(FeedOutput));
    expect(feed).toContain('"enum":["proposed","passed","enacted","repealed","rejected"]');
    expect(feed).toContain('"enum":["positive","negative","neutral"]');
    const analysis = JSON.stringify(toStrictJsonSchema(AnalysisOutput));
    expect(analysis).toContain('"enum":["expanding","neutral","pulling_back"]');
    expect(analysis).toContain('"enum":["high","medium","low"]');
  });
});

describe('zod parsing', () => {
  it('rejects an analysis that is missing a section', () => {
    expect(AnalysisOutput.safeParse({ plainEnglishSummary: 'x' }).success).toBe(false);
  });

  it('falls back to safe defaults for unexpected enum values instead of failing', () => {
    const r = FeedOutput.parse({ policies: [{
      title: 'T', billNumber: '', status: 'final rule', category: 'tariffs', relevanceScore: 50, summary: 's',
      direction: 'mixed', estimatedImpact: '', region: 'Federal', reasons: [],
    }] });
    expect(r.policies[0]).toMatchObject({ status: 'proposed', category: 'other', direction: 'neutral' });
  });
});
