import { describe, expect, it, vi } from 'vitest';

// lib/claude.ts is server-only and records usage through Supabase; stub both
// so the pure helpers can be tested in isolation.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/aiGuard', () => ({ recordAiUsage: vi.fn() }));

const { normalizeHistory, thinkingParams } = await import('@/lib/claude');

describe('normalizeHistory', () => {
  it('drops a leading assistant greeting so the history starts with the user', () => {
    const out = normalizeHistory([
      { role: 'assistant', content: 'Hi! I am your advisor.' },
      { role: 'user', content: 'How do tariffs affect me?' },
    ]);
    expect(out).toEqual([{ role: 'user', content: 'How do tariffs affect me?' }]);
  });

  it('merges consecutive turns from the same role and skips empty ones', () => {
    const out = normalizeHistory([
      { role: 'user', content: 'first' },
      { role: 'user', content: '  ' },
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'answer' },
      { role: 'assistant', content: 'more' },
      { role: 'user', content: 'third' },
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'first\n\nsecond' },
      { role: 'assistant', content: 'answer\n\nmore' },
      { role: 'user', content: 'third' },
    ]);
  });

  it('keeps at most the last 20 turns and still starts with a user turn', () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `m${i}`,
    }));
    const out = normalizeHistory(turns);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out[0].role).toBe('user');
    expect(out[out.length - 1].content).toBe('m29');
  });
});

describe('thinkingParams', () => {
  it('never goes below the 1024-token minimum thinking budget', () => {
    const p = thinkingParams(2000, true);
    expect(p.budget).toBeGreaterThanOrEqual(1024);
    expect(p.maxTokens).toBeGreaterThan(p.budget);
  });

  it('caps the budget and leaves room for the answer on large requests', () => {
    const p = thinkingParams(18000, true);
    expect(p.budget).toBe(8000);
    expect(p.maxTokens).toBe(18000);
  });

  it('is a no-op when thinking is off', () => {
    expect(thinkingParams(600, false)).toEqual({ maxTokens: 600, budget: 0 });
  });
});
