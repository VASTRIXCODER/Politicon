import { describe, expect, it, vi } from 'vitest';

// lib/claude.ts is server-only and records usage through Supabase; stub both
// so the pure helpers can be tested in isolation.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/aiGuard', () => ({ recordAiUsage: vi.fn() }));

const { normalizeHistory, rankCandidates, recordForRef } = await import('@/lib/claude');
type Item = Parameters<typeof rankCandidates>[0][number];

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

function item(id: string, region: string, status: Item['status'], latestActionDate: string): Item {
  return {
    id, region, status, latestActionDate, source: region === 'Federal' ? 'congress.gov' : 'openstates',
    billNumber: id, title: id, latestActionText: null, sourceUrl: 'https://example.gov',
  };
}

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86400_000).toISOString().slice(0, 10);

describe('rankCandidates', () => {
  it('keeps state records separate, most recent first, at most 60', () => {
    const state = Array.from({ length: 70 }, (_, i) => item(`oh-${i}`, 'Ohio', 'proposed', day(i)));
    const { state: ranked } = rankCandidates(state);
    expect(ranked).toHaveLength(60);
    expect(ranked[0].id).toBe('oh-69');
  });

  it('reserves places for the most recent enacted laws ahead of newer bills', () => {
    // 200 bills with recent action, and 80 laws enacted earlier.
    const bills = Array.from({ length: 200 }, (_, i) => item(`bill-${i}`, 'Federal', 'proposed', day(200 + i)));
    const laws = Array.from({ length: 80 }, (_, i) => item(`law-${i}`, 'Federal', 'enacted', day(i)));
    const { federal } = rankCandidates([...bills, ...laws]);

    expect(federal).toHaveLength(180); // 240 in all, with 60 kept for state records
    expect(federal.slice(0, 60).every((r) => r.status === 'enacted')).toBe(true);
    expect(federal[0].id).toBe('law-79'); // most recent law first
    expect(federal[60].id).toBe('bill-199'); // then everything else by recent action
    expect(new Set(federal.map((r) => r.id)).size).toBe(180);
  });

  it('gives every user the same federal list, whatever their state records', () => {
    const federal = Array.from({ length: 300 }, (_, i) => item(`f-${i}`, 'Federal', i % 7 ? 'proposed' : 'enacted', day(i % 50)));
    const ohio = Array.from({ length: 60 }, (_, i) => item(`oh-${i}`, 'Ohio', 'proposed', day(i)));
    expect(rankCandidates([...ohio, ...federal]).federal).toEqual(rankCandidates(federal).federal);
  });
});

describe('recordForRef', () => {
  const ranked = {
    federal: [item('f-1', 'Federal', 'enacted', day(1)), item('f-2', 'Federal', 'proposed', day(2))],
    state: [item('s-1', 'Ohio', 'proposed', day(3))],
  };

  it.each([
    ['F1', 'f-1'],
    ['f2', 'f-2'],
    [' S1 ', 's-1'],
    ['P3', 's-1'], // older combined numbering, counted in display order
    ['F3', undefined],
    ['S0', undefined],
    ['X1', undefined],
    ['F1a', undefined],
  ])('%s → %s', (ref, id) => {
    expect(recordForRef(ref, ranked)?.id).toBe(id);
  });
});
