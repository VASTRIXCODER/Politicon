import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { AnalysisOutput, FeedOutput } = await import('@/lib/server/aiSchemas');
const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');

describe('structured output schemas', () => {
  it('convert to a JSON schema the API accepts (objects closed, all fields required)', () => {
    for (const schema of [AnalysisOutput, FeedOutput]) {
      const format = zodOutputFormat(schema) as unknown as { type: string; schema: Record<string, unknown> };
      expect(format.type).toBe('json_schema');
      const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        const n = node as Record<string, unknown>;
        if (n.type === 'object' && n.properties) {
          expect(n.additionalProperties).toBe(false);
          expect(new Set(n.required as string[])).toEqual(new Set(Object.keys(n.properties as object)));
        }
        Object.values(n).forEach(walk);
      };
      walk(format.schema);
    }
  });

  it('rejects an analysis that is missing a section', () => {
    expect(AnalysisOutput.safeParse({ plainEnglishSummary: 'x' }).success).toBe(false);
  });
});
