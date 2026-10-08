import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestAnalysis } from '@/lib/analysisClient';

type Reply = { status: number; body: unknown };

function mockFetch(replies: Reply[]) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method || 'GET'} ${url}`);
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const r = replies.shift() ?? { status: 200, body: { status: 'pending' } };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }));
  return calls;
}

const analysis = { policyTitle: 'Test Act', netAnnualImpact: -100 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('requestAnalysis', () => {
  it('returns a stored analysis without polling', async () => {
    const calls = mockFetch([{ status: 200, body: { status: 'ready', analysis, profileSnapshot: null } }]);
    const res = await requestAnalysis('us-hr-1');
    expect(res).toMatchObject({ ok: true, fresh: false });
    expect(calls).toEqual(['POST /api/analyze']);
  });

  it('follows a background job until it is ready', async () => {
    vi.useFakeTimers();
    const calls = mockFetch([
      { status: 202, body: { status: 'pending' } },
      { status: 200, body: { status: 'pending' } },
      { status: 200, body: { status: 'ready', analysis, profileSnapshot: { state: 'Ohio' } } },
    ]);
    const pending = requestAnalysis('us-hr-1');
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    const res = await pending;
    expect(res).toMatchObject({ ok: true, fresh: true, profileSnapshot: { state: 'Ohio' } });
    expect(calls).toEqual(['POST /api/analyze', 'GET /api/analyze?policyId=us-hr-1', 'GET /api/analyze?policyId=us-hr-1']);
  });

  it('follow-only never starts a job and reports a dead one immediately', async () => {
    const calls = mockFetch([{ status: 200, body: { status: 'failed', error: 'The analysis stopped unexpectedly. Please try again.' } }]);
    const res = await requestAnalysis('us-hr-1', { followOnly: true });
    expect(res).toEqual({ ok: false, cancelled: false, message: 'The analysis stopped unexpectedly. Please try again.' });
    expect(calls).toEqual(['GET /api/analyze?policyId=us-hr-1']);
  });

  it('keeps waiting through transient server errors', async () => {
    vi.useFakeTimers();
    mockFetch([
      { status: 202, body: { status: 'pending' } },
      { status: 503, body: { error: { code: 'lookup_failed', message: 'x' } } },
      { status: 200, body: { status: 'ready', analysis } },
    ]);
    const pending = requestAnalysis('us-hr-1');
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toMatchObject({ ok: true });
  });

  it('is cancelled by its signal, as a typed result', async () => {
    vi.useFakeTimers();
    mockFetch([{ status: 202, body: { status: 'pending' } }]);
    const controller = new AbortController();
    const pending = requestAnalysis('us-hr-1', { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    expect(await pending).toEqual({ ok: false, cancelled: true, message: 'Cancelled.' });
  });

  it('gives up after the server-side job limit', async () => {
    vi.useFakeTimers();
    mockFetch([{ status: 202, body: { status: 'pending' } }]);
    const pending = requestAnalysis('us-hr-1');
    await vi.advanceTimersByTimeAsync(7 * 60 * 1000);
    expect(await pending).toMatchObject({ ok: false, cancelled: false, message: 'The analysis took too long. Please try again.' });
  });
});
