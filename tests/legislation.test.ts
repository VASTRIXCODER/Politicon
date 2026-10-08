import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// An in-memory stand-in for the legislation_cache table.
const db = vi.hoisted(() => {
  const rows = new Map<string, { items: unknown; fetched_at: string }>();
  const client = {
    from: () => ({
      select: () => ({
        eq: (_column: string, key: string) => ({ maybeSingle: async () => ({ data: rows.get(key) ?? null, error: null }) }),
        // like('key', 'prefix%').gt('fetched_at', iso).limit(n)
        like: (_column: string, pattern: string) => ({
          gt: (_c: string, since: string) => ({
            limit: async (n: number) => ({
              data: [...rows.entries()]
                .filter(([key, row]) => key.startsWith(pattern.replace(/%$/, '')) && row.fetched_at > since)
                .slice(0, n)
                .map(([key]) => ({ key })),
              error: null,
            }),
          }),
        }),
      }),
      upsert: async (row: { key: string; items: unknown; fetched_at: string }) => {
        rows.set(row.key, { items: row.items, fetched_at: row.fetched_at });
        return { error: null };
      },
    }),
  };
  return { rows, client };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }));
const L = await import('@/lib/server/legislation');

describe('currentCongress', () => {
  it.each([
    ['2025-01-02', 118],
    ['2025-01-03', 119],
    ['2026-10-08', 119],
    ['2027-01-02', 119],
    ['2027-01-03', 120],
  ])('%s → %i', (d, n) => {
    expect(L.currentCongress(new Date(`${d}T12:00:00Z`))).toBe(n);
  });
});

describe('statusFromAction', () => {
  it.each([
    ['Became Public Law No: 119-21.', 'enacted'],
    ['Signed by President.', 'enacted'],
    ['Chaptered by Secretary of State - Chapter 512, Statutes of 2025', 'enacted'],
    ['Signed by Governor', 'enacted'],
    ['Passed/agreed to in House: On passage Passed by the Yeas and Nays: 218 - 214.', 'passed'],
    ['Presented to President.', 'passed'],
    ['Vetoed by Governor', 'rejected'],
    ['Failed of passage in Senate', 'rejected'],
    ['Referred to the House Committee on Ways and Means.', 'proposed'],
    [null, 'proposed'],
    // Negations are read before "agreed to" / "passed".
    ['Motion to discharge Senate Committee on Foreign Relations not agreed to by Yea-Nay Vote. 47 - 53.', 'proposed'],
    ['On agreeing to the Smith amendment (A001) Failed by recorded vote: 200 - 220.', 'proposed'],
    ['Senate amendment not agreed to', 'proposed'],
    ['Passed Senate; motion to reconsider failed', 'passed'],
    ['On passage Failed by the Yeas and Nays: 200 - 215.', 'rejected'],
    ['Bill as amended by Amendment 1 failed passage', 'rejected'],
    ['Bill not passed by House', 'rejected'],
    // Withdrawals and deaths only when the bill itself is withdrawn or dies.
    ['Withdrawn from Appropriations; Now in Fiscal Policy', 'proposed'],
    ['Withdrawn from further consideration', 'rejected'],
    ['Died in committee', 'rejected'],
    ['Died pursuant to Joint Rule 10', 'rejected'],
    ['Retained in committee to be studied', 'proposed'],
    // State enactment wording.
    ['Approved by the Governor', 'enacted'],
    ['Approved by Governor-Chapter 123 (effective 7/1/25)', 'enacted'],
    ["Became law without Governor's signature", 'enacted'],
    ['SIGNED CHAP.123', 'enacted'],
    ['Public Act . . . . . . . . . 104-0012', 'enacted'],
    ['Act No. 2025-45', 'enacted'],
    ['Chapter 12, Laws of 2025', 'enacted'],
  ])('%s → %s', (text, status) => {
    expect(L.statusFromAction(text)).toBe(status);
  });
});

describe('Congress.gov parsing', () => {
  const fixture = {
    request: { format: 'json' },
    pagination: { count: 3 },
    bills: [
      {
        congress: 119, type: 'HR', number: '1', title: 'One Big Beautiful Bill Act', originChamber: 'House', originChamberCode: 'H',
        latestAction: { actionDate: '2025-07-04', text: 'Became Public Law No: 119-21.' }, updateDate: '2025-07-08',
        url: 'https://api.congress.gov/v3/bill/119/hr/1?format=json',
      },
      { congress: 119, type: 'S', number: '0042', title: 'A bill to expand child care', latestAction: { actionDate: '2026-02-01', text: 'Read twice and referred to the Committee on Finance.' } },
      { congress: 119, type: 'HRES', number: '5', title: 'Recognizing National Pickle Day', latestAction: { actionDate: '2026-01-01', text: 'Agreed to' } },
      { congress: 119, type: 'HR', number: '', title: 'Missing number' },
      'not an object',
    ],
  };

  it('maps lawmaking bills to records with official links, and skips resolutions and junk', () => {
    const items = L.parseCongressBills(fixture);
    expect(items.map((i) => i.billNumber)).toEqual(['H.R. 1', 'S. 42']);
    expect(items[0]).toMatchObject({
      id: 'us-119-hr-1', source: 'congress.gov', region: 'Federal', status: 'enacted',
      latestActionDate: '2025-07-04', sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1',
      congress: 119, billType: 'hr', number: '1',
    });
    expect(items[1]).toMatchObject({ id: 'us-119-s-42', status: 'proposed', sourceUrl: 'https://www.congress.gov/bill/119th-congress/senate-bill/42' });
  });

  it('marks everything from the law endpoint as enacted', () => {
    expect(L.parseCongressBills({ bills: [fixture.bills[1]] }, { enacted: true })[0].status).toBe('enacted');
  });

  it('keeps bill numbers apart across Congresses', () => {
    const next = L.parseCongressBills({ bills: [{ ...(fixture.bills[0] as object), congress: 120 }] });
    expect(next[0].id).toBe('us-120-hr-1');
  });

  it('returns nothing for unexpected shapes', () => {
    expect(L.parseCongressBills(null)).toEqual([]);
    expect(L.parseCongressBills({ bills: [{ congress: 0, type: 'HR', number: '1', title: 'x' }, { congress: 119, type: 'HR', number: '1a', title: 'x' }] })).toEqual([]);
    expect(L.parseCongressBills({ data: [] })).toEqual([]);
  });
});

describe('Open States parsing', () => {
  const fixture = {
    results: [
      {
        id: 'ocd-bill/1', session: '20252026', jurisdiction: { id: 'ocd-jurisdiction/country:us/state:ca/government', name: 'California', classification: 'state' },
        identifier: 'SB 1047', title: 'Safe and Secure Innovation for Frontier Artificial Intelligence Models Act', classification: ['bill'],
        subject: [], openstates_url: 'https://openstates.org/ca/bills/20252026/SB1047/',
        latest_action_date: '2025-09-29T00:00:00', latest_action_description: 'Vetoed by Governor',
        abstracts: [{ abstract: 'Requires developers of covered models to ...', note: '' }],
      },
      { identifier: 'SR 12', title: 'Relative to Teachers Day', classification: ['resolution'] },
      { identifier: '', title: 'No id' },
    ],
    pagination: { per_page: 20, page: 1, max_page: 1, total_items: 3 },
  };

  it('maps bills with their abstract and official page, skipping resolutions', () => {
    const items = L.parseOpenStatesBills(fixture, 'California');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'california-20252026-sb-1047', source: 'openstates', region: 'California', billNumber: 'SB 1047', session: '20252026',
      status: 'rejected', latestActionDate: '2025-09-29', sourceUrl: 'https://openstates.org/ca/bills/20252026/SB1047/',
      abstract: 'Requires developers of covered models to ...',
    });
  });

  it('keeps identifiers the bill-number parser does not know apart, and links only to https pages', () => {
    const items = L.parseOpenStatesBills({
      results: [
        { identifier: 'HF 2', title: 'Omnibus tax bill', session: '2025', openstates_url: 'javascript:alert(1)' },
        { identifier: 'SF 2', title: 'Omnibus tax bill', session: '2025', openstates_url: 'http://openstates.org/mn/bills/2025/SF2/' },
      ],
    }, 'Minnesota');
    expect(items.map((i) => i.id)).toEqual(['minnesota-2025-hf-2', 'minnesota-2025-sf-2']);
    expect(items.map((i) => i.sourceUrl)).toEqual(['https://openstates.org', 'https://openstates.org']);
  });
});

describe('official summaries', () => {
  it('takes the newest summary and strips HTML', () => {
    const text = L.latestCongressSummary({ summaries: [
      { actionDate: '2025-01-03', updateDate: '2025-01-10', text: '<p>Old</p>' },
      { actionDate: '2025-05-22', updateDate: '2025-06-01', text: '<p><strong>One Big Beautiful Bill Act</strong></p><p>This bill extends tax cuts &amp; more.</p>' },
    ] });
    expect(text).toBe('One Big Beautiful Bill Act\nThis bill extends tax cuts & more.');
    expect(L.latestCongressSummary({ summaries: [] })).toBeNull();
  });
});

describe('earlyInCongress', () => {
  it.each([
    ['2026-10-08', false],
    ['2027-01-02', false],
    ['2027-01-03', true],
    ['2027-07-02', true],
    ['2027-07-03', false],
  ])('%s → %s', (d, early) => {
    expect(L.earlyInCongress(new Date(`${d}T12:00:00Z`))).toBe(early);
  });
});

describe('fetching with the shared cache', () => {
  const HOUR = 60 * 60 * 1000;
  let calls: string[] = [];

  /** Stub fetch: the handler returns a JSON body, an HTTP status, or an Error to throw. */
  function mockFetch(handler: (url: string) => unknown) {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      await new Promise((r) => setTimeout(r, 1));
      const out = handler(url);
      if (out instanceof Error) throw out;
      if (typeof out === 'number') return new Response('{}', { status: out });
      return new Response(JSON.stringify(out), { status: 200 });
    }));
  }
  const bill = (congress: number, type: string, number: string, text = 'Referred to committee.') =>
    ({ congress, type, number, title: `${type} ${number}`, latestAction: { actionDate: '2026-09-01', text } });
  const federal = (url: string): unknown => {
    if (url.includes('/law/')) return { bills: [bill(Number(url.match(/\/law\/(\d+)/)![1]), 'HR', '1', 'Became Public Law No: 119-21.')] };
    if (url.includes('/hr?')) return { bills: [bill(119, 'HR', '5')] };
    if (url.includes('/s?')) return { bills: [bill(119, 'S', '7')] };
    return 404;
  };
  const ageOf = (key: string) => Date.now() - new Date(db.rows.get(key)!.fetched_at).getTime();
  const seed = (key: string, items: unknown, age: number) => db.rows.set(key, { items, fetched_at: new Date(Date.now() - age).toISOString() });

  beforeEach(() => {
    db.rows.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('CONGRESS_API_KEY', 'SECRET-CONGRESS-KEY');
    vi.stubEnv('OPENSTATES_API_KEY', 'SECRET-OPENSTATES-KEY');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('asks for House and Senate bills separately, plus the laws of this Congress', async () => {
    mockFetch(federal);
    const items = await L.federalCandidates();
    expect(items.map((i) => i.id).sort()).toEqual(['us-119-hr-1', 'us-119-hr-5', 'us-119-s-7']);
    expect(items.find((i) => i.id === 'us-119-hr-1')!.status).toBe('enacted');
    expect(calls.map((u) => new URL(u).pathname).sort()).toEqual(['/v3/bill/119/hr', '/v3/bill/119/s', '/v3/law/119']);
    expect(calls.every((u) => u.includes('limit=250'))).toBe(true);
    expect(ageOf('federal')).toBeLessThan(HOUR);
  });

  it('also takes the previous Congress\'s laws early in a new Congress', async () => {
    vi.useFakeTimers({ now: new Date('2027-02-01T12:00:00Z'), toFake: ['Date'] });
    mockFetch(federal);
    const items = await L.federalCandidates();
    expect(calls.map((u) => new URL(u).pathname).sort()).toEqual(['/v3/bill/120/hr', '/v3/bill/120/s', '/v3/law/119', '/v3/law/120']);
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(['us-119-hr-1', 'us-120-hr-1']));
  });

  it("doesn't cache a list missing its laws for the full TTL", async () => {
    mockFetch((url) => (url.includes('/law/') ? 503 : federal(url)));
    const items = await L.federalCandidates();
    expect(items.map((i) => i.id).sort()).toEqual(['us-119-hr-5', 'us-119-s-7']);
    // Stored so that it expires in 30 minutes.
    expect(ageOf('federal')).toBeGreaterThan(5.4 * HOUR);
    expect(ageOf('federal')).toBeLessThan(5.6 * HOUR);
  });

  it('prefers a recent complete copy to a partial or failed refresh', async () => {
    const complete = [{ id: 'us-119-hr-99' }];
    seed('federal', complete, 7 * HOUR);
    mockFetch((url) => (url.includes('/law/') ? 503 : federal(url)));
    expect(await L.federalCandidates()).toEqual(complete);
    mockFetch(() => 503);
    expect(await L.federalCandidates()).toEqual(complete);
    expect(ageOf('federal')).toBeGreaterThan(6 * HOUR); // left as it was
  });

  it('gives way to a partial list once the old copy is more than a day old', async () => {
    seed('federal', [{ id: 'us-119-hr-99' }], 30 * HOUR);
    mockFetch((url) => (url.includes('/law/') ? 503 : federal(url)));
    expect((await L.federalCandidates()).map((i) => i.id).sort()).toEqual(['us-119-hr-5', 'us-119-s-7']);
  });

  it('throws when every request fails and there is no copy, without exposing the API key', async () => {
    mockFetch((url) => new TypeError(`Failed to parse URL from ${url}`));
    const err = await L.federalCandidates().catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toContain('api.congress.gov request failed');
    expect(String((err as Error).message)).not.toContain('SECRET');
    expect(db.rows.has('federal')).toBe(false);
  });

  it('shares one refresh between concurrent callers', async () => {
    mockFetch(federal);
    const [a, b] = await Promise.all([L.federalCandidates(), L.federalCandidates()]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(3);
  });

  describe('Open States', () => {
    const page = (n: number, maxPage = 3) => ({
      results: [{ identifier: `SB ${n}`, title: `Bill ${n}`, session: '2025', classification: ['bill'] }],
      pagination: { page: n, max_page: maxPage },
    });
    const pageOf = (url: string) => Number(new URL(url).searchParams.get('page'));

    it('fetches pages in turn and stops at the last one', async () => {
      mockFetch((url) => page(pageOf(url), 2));
      const items = await L.stateCandidates('Texas');
      expect(items.map((i) => i.id)).toEqual(['texas-2025-sb-1', 'texas-2025-sb-2']);
      expect(calls).toHaveLength(2);
    });

    it('throws when no page loads, so the key or outage is noticed', async () => {
      mockFetch(() => 401);
      await expect(L.stateCandidates('Texas')).rejects.toThrow(/Open States unavailable for Texas: v3.openstates.org responded 401/);
      expect(db.rows.has('state:Texas')).toBe(false);
      seed('state:Texas', [{ id: 'texas-2025-sb-9' }], 7 * HOUR);
      expect(await L.stateCandidates('Texas')).toEqual([{ id: 'texas-2025-sb-9' }]);
    });

    it('returns the pages that loaded, cached briefly, when a later page fails', async () => {
      mockFetch((url) => (pageOf(url) === 2 ? 429 : page(pageOf(url))));
      const items = await L.stateCandidates('Texas');
      expect(items.map((i) => i.id)).toEqual(['texas-2025-sb-1']);
      expect(calls).toHaveLength(2);
      expect(ageOf('state:Texas')).toBeGreaterThan(5.4 * HOUR);
      expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain('SECRET');
    });
  });

  describe('officialSummary', () => {
    const record = { source: 'congress.gov', congress: 119, billType: 'hr', number: '1', id: 'some-users-policy-id' };

    it('is cached by the bill, not the policy id', async () => {
      mockFetch(() => ({ summaries: [{ updateDate: '2025-06-01', text: '<p>Summary</p>' }] }));
      expect(await L.officialSummary(record)).toBe('Summary');
      expect(new URL(calls[0]).pathname).toBe('/v3/bill/119/hr/1/summaries');
      expect(db.rows.get('summary:119-hr-1')?.items).toBe('Summary');
      expect(await L.officialSummary({ ...record, id: 'another-users-id' })).toBe('Summary');
      expect(calls).toHaveLength(1);
    });

    it('checks again after 6 hours when there was no summary yet', async () => {
      seed('summary:119-hr-1', null, 5 * HOUR);
      mockFetch(() => ({ summaries: [{ updateDate: '2025-06-01', text: 'Now published' }] }));
      expect(await L.officialSummary(record)).toBeNull();
      expect(calls).toHaveLength(0);
      seed('summary:119-hr-1', null, 7 * HOUR);
      expect(await L.officialSummary(record)).toBe('Now published');
      // A real summary is kept for longer.
      seed('summary:119-hr-1', 'Kept', 7 * HOUR);
      expect(await L.officialSummary(record)).toBe('Kept');
    });

    it('stores a missing summary as null', async () => {
      mockFetch(() => ({ summaries: [] }));
      expect(await L.officialSummary(record)).toBeNull();
      expect(db.rows.get('summary:119-hr-1')?.items).toBeNull();
    });

    it('ignores malformed coordinates', async () => {
      mockFetch(() => ({ summaries: [] }));
      expect(await L.officialSummary({ ...record, number: '1/../../x' })).toBeNull();
      expect(await L.officialSummary({ ...record, billType: 'h r' })).toBeNull();
      expect(calls).toHaveLength(0);
    });
  });

  describe('legislationHealth', () => {
    it('fails in production without a Congress.gov key', async () => {
      vi.stubEnv('CONGRESS_API_KEY', '');
      vi.stubEnv('NODE_ENV', 'production');
      mockFetch(() => ({ bills: [] }));
      expect(await L.legislationHealth()).toEqual({ ok: false, detail: 'CONGRESS_API_KEY not set (DEMO_KEY is rate-limited)' });
      expect(calls).toHaveLength(0);
    });

    it('skips the outbound probe while the federal list is fresh', async () => {
      seed('federal', [], HOUR);
      mockFetch(() => 500);
      expect(await L.legislationHealth()).toEqual({ ok: true });
      expect(calls).toHaveLength(0);
    });

    it('probes Congress.gov otherwise', async () => {
      seed('federal', [], 7 * HOUR);
      mockFetch(() => 500);
      expect(await L.legislationHealth()).toEqual({ ok: false, detail: 'api.congress.gov responded 500' });
      expect(calls).toHaveLength(1);
    });
  });

  describe('stateLegislationHealth', () => {
    it('reports a missing key without a request', async () => {
      vi.stubEnv('OPENSTATES_API_KEY', '');
      mockFetch(() => 500);
      expect(await L.stateLegislationHealth()).toEqual({ ok: true, detail: 'OPENSTATES_API_KEY not set; state bills are skipped' });
      expect(calls).toHaveLength(0);
    });

    it('skips the outbound probe while a state list is fresh', async () => {
      seed('state:Ohio', [], HOUR);
      mockFetch(() => 500);
      expect(await L.stateLegislationHealth()).toEqual({ ok: true });
      expect(calls).toHaveLength(0);
    });

    it('probes Open States otherwise, without exposing the key', async () => {
      seed('state:Ohio', [], 7 * HOUR);
      mockFetch(() => 401);
      const health = await L.stateLegislationHealth();
      expect(health).toEqual({ ok: false, detail: 'v3.openstates.org responded 401' });
      expect(calls).toHaveLength(1);
      expect(JSON.stringify(health)).not.toContain('SECRET-OPENSTATES-KEY');
    });
  });
});
