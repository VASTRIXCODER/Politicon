import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('not used in these tests'); } }));
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
      id: 'us-hr-1', source: 'congress.gov', region: 'Federal', status: 'enacted',
      latestActionDate: '2025-07-04', sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1',
      congress: 119, billType: 'hr', number: '1',
    });
    expect(items[1]).toMatchObject({ id: 'us-s-42', status: 'proposed', sourceUrl: 'https://www.congress.gov/bill/119th-congress/senate-bill/42' });
  });

  it('marks everything from the law endpoint as enacted', () => {
    expect(L.parseCongressBills({ bills: [fixture.bills[1]] }, { enacted: true })[0].status).toBe('enacted');
  });

  it('returns nothing for unexpected shapes', () => {
    expect(L.parseCongressBills(null)).toEqual([]);
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
      id: 'california-sb-1047', source: 'openstates', region: 'California', billNumber: 'SB 1047',
      status: 'rejected', latestActionDate: '2025-09-29', sourceUrl: 'https://openstates.org/ca/bills/20252026/SB1047/',
      abstract: 'Requires developers of covered models to ...',
    });
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
