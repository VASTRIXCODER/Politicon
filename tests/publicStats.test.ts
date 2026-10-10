import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const admin = vi.hoisted(() => ({
  rpc: vi.fn(),
  configured: true,
}));

vi.mock('server-only', () => ({}));
// Outside Next there is no incremental cache; run the loader directly.
vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (!admin.configured) throw new Error('Supabase admin client is not configured');
    return { rpc: admin.rpc };
  },
}));

const S = await import('@/lib/server/publicStats');

const C = S.MIN_CONTRIBUTORS;

describe('publishableStats', () => {
  it('passes figures at or above the thresholds, in whole dollars', () => {
    expect(S.publishableStats({ members: S.MIN_MEMBERS, analyses: S.MIN_ANALYSES, contributors: C, median_abs_annual_impact: 412.6 }))
      .toEqual({ members: S.MIN_MEMBERS, analyses: S.MIN_ANALYSES, medianAnnualImpact: 413 });
  });

  it('hides each figure below its threshold; the median follows the analysis count', () => {
    expect(S.publishableStats({ members: S.MIN_MEMBERS - 1, analyses: 500, contributors: 60, median_abs_annual_impact: 300 }))
      .toEqual({ members: null, analyses: 500, medianAnnualImpact: 300 });
    expect(S.publishableStats({ members: 5000, analyses: S.MIN_ANALYSES - 1, contributors: 40, median_abs_annual_impact: 300 }))
      .toEqual({ members: 5000, analyses: null, medianAnnualImpact: null });
  });

  it('withholds the analysis count and median when too few members made them', () => {
    // One busy account (or a handful) can pass the analysis count on its own.
    for (const contributors of [1, 3, C - 1]) {
      expect(S.publishableStats({ members: 4, analyses: 70, contributors, median_abs_annual_impact: 900 }))
        .toEqual(S.NO_PUBLIC_STATS);
      expect(S.publishableStats({ members: 5000, analyses: 5000, contributors, median_abs_annual_impact: 900 }))
        .toEqual({ members: 5000, analyses: null, medianAnnualImpact: null });
    }
  });

  it('withholds them when public_stats() predates the contributors column', () => {
    expect(S.publishableStats({ members: 5000, analyses: 5000, median_abs_annual_impact: 900 }))
      .toEqual({ members: 5000, analyses: null, medianAnnualImpact: null });
  });

  it('accepts numeric strings (bigint/numeric over JSON)', () => {
    expect(S.publishableStats({ members: '250', analyses: '75', contributors: '30', median_abs_annual_impact: '1200.4' }))
      .toEqual({ members: 250, analyses: 75, medianAnnualImpact: 1200 });
  });

  it('treats malformed or missing values as unknown, never as zero', () => {
    for (const row of [null, undefined, 'x', 42, {}, { members: -1, analyses: 1.5, contributors: -2, median_abs_annual_impact: -3 }]) {
      expect(S.publishableStats(row)).toEqual(S.NO_PUBLIC_STATS);
    }
    expect(S.publishableStats({ members: Number.NaN, analyses: 80, contributors: C, median_abs_annual_impact: null }))
      .toEqual({ members: null, analyses: 80, medianAnnualImpact: null });
    expect(S.publishableStats({ members: 300, analyses: 80, contributors: 'many', median_abs_annual_impact: 500 }))
      .toEqual({ members: 300, analyses: null, medianAnnualImpact: null });
  });
});

describe('getPublicStats', () => {
  // Each test starts a day after the previous one, clear of any failure backoff.
  let clock = Date.parse('2026-10-09T12:00:00Z');
  beforeEach(() => {
    vi.useFakeTimers();
    clock += 24 * 60 * 60 * 1000;
    vi.setSystemTime(clock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.rpc.mockReset();
    admin.configured = true;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reads the first row of public_stats() through the service role', async () => {
    admin.rpc.mockResolvedValue({ data: [{ members: 120, analyses: 60, contributors: 40, median_abs_annual_impact: 850 }], error: null });
    await expect(S.getPublicStats()).resolves.toEqual({ members: 120, analyses: 60, medianAnnualImpact: 850 });
    expect(admin.rpc).toHaveBeenCalledWith('public_stats');
  });

  it('returns nulls when the function is missing (migration not applied)', async () => {
    admin.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.public_stats' } });
    await expect(S.getPublicStats()).resolves.toEqual(S.NO_PUBLIC_STATS);
  });

  it('returns nulls when the admin client is not configured or the call throws', async () => {
    admin.configured = false;
    await expect(S.getPublicStats()).resolves.toEqual(S.NO_PUBLIC_STATS);
    vi.advanceTimersByTime(60_000);
    admin.configured = true;
    admin.rpc.mockRejectedValue(new Error('fetch failed'));
    await expect(S.getPublicStats()).resolves.toEqual(S.NO_PUBLIC_STATS);
  });

  it('backs off for 30 seconds after a failure instead of querying again', async () => {
    admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
    await S.getPublicStats();
    expect(admin.rpc).toHaveBeenCalledTimes(1);

    admin.rpc.mockResolvedValue({ data: [{ members: 300, analyses: 90, contributors: 45, median_abs_annual_impact: 500 }], error: null });
    vi.advanceTimersByTime(29_000);
    await expect(S.getPublicStats()).resolves.toEqual(S.NO_PUBLIC_STATS);
    expect(admin.rpc).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000);
    await expect(S.getPublicStats()).resolves.toEqual({ members: 300, analyses: 90, medianAnnualImpact: 500 });
    expect(admin.rpc).toHaveBeenCalledTimes(2);
  });
});
