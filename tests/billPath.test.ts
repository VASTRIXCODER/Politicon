import { describe, expect, it } from 'vitest';
import { BILL_STAGES, billPath, formatRecordDate } from '@/lib/billPath';
import type { PolicyRecord } from '@/types';

const AS_OF = '2026-10-18T09:00:00.000Z';

/** A verified Congress.gov record for a House bill (H.R.), unless overridden. */
function record(latestAction: string | null, extra: Partial<PolicyRecord> = {}): PolicyRecord {
  return {
    verified: true,
    source: 'congress.gov',
    sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1001',
    latestAction,
    latestActionDate: '2026-09-15',
    asOf: AS_OF,
    status: 'proposed',
    billNumber: 'H.R. 1001',
    region: 'Federal',
    congress: 119,
    billType: 'hr',
    number: '1001',
    ...extra,
  };
}

const senateBill = (latestAction: string, extra: Partial<PolicyRecord> = {}) =>
  record(latestAction, { billNumber: 'S. 2002', billType: 's', number: '2002', ...extra });

const states = (r: ReturnType<typeof billPath>) => r.steps.map((s) => s.state);

describe('billPath: unverified', () => {
  it('shows no stage for a policy without an official record, whatever its AI status says', () => {
    for (const r of [undefined, null, { verified: false, source: 'ai', asOf: AS_OF, status: 'enacted' } as PolicyRecord]) {
      const path = billPath(r);
      expect(path.known).toBe(false);
      expect(path.reached).toBe(-1);
      expect(path.outcome).toBeNull();
      expect(states(path).every((s) => s === 'upcoming')).toBe(true);
      expect(path.headline).toBe('Stage not shown');
      // The unverified wording is never passed on as the record's.
      expect(path.latestAction).toBeNull();
    }
  });
});

describe('billPath: federal stages from the latest action', () => {
  it.each([
    ['Introduced in House', 0, 'current', 'Introduced in the House'],
    ['Referred to the House Committee on Ways and Means.', 1, 'current', 'In committee'],
    ['Referred to the Subcommittee on Health.', 1, 'current', 'In committee'],
    ['Committee Hearings Held.', 1, 'current', 'In committee'],
    ['Ordered to be Reported in the Nature of a Substitute (Amended) by Voice Vote.', 2, 'current', 'Out of committee'],
    ['Placed on the Union Calendar, Calendar No. 123.', 2, 'current', 'Out of committee'],
    ['Passed/agreed to in House: On passage Passed by the Yeas and Nays: 218 - 214.', 2, 'done', 'Passed the House'],
    ['Received in the Senate.', 3, 'current', 'In the Senate'],
    ['Received in the Senate and Read twice and referred to the Committee on Finance.', 3, 'current', 'In the Senate'],
    ['Passed Senate with an amendment by Unanimous Consent.', 3, 'done', 'Passed the Senate'],
    ['Message on Senate action sent to the House.', 3, 'current', 'In the Senate'],
    ['Resolving differences -- House actions: On motion that the House agree to the Senate amendment', 3, 'current', 'Resolving differences between chambers'],
    ['Presented to President.', 4, 'current', 'Sent to the President'],
  ] as const)('H.R. bill: %s', (action, reached, state, headline) => {
    const path = billPath(record(action, { status: /passed|agreed to|presented/i.test(action) ? 'passed' : 'proposed' }));
    expect(path.known).toBe(true);
    expect(path.reached).toBe(reached);
    expect(path.steps[reached].state).toBe(state);
    expect(path.headline).toBe(headline);
    expect(path.outcome).toBe('in-progress');
    // Everything before the stage reached is done; nothing after it is claimed.
    expect(states(path).slice(0, reached).every((s) => s === 'done')).toBe(true);
    expect(states(path).slice(reached + 1).every((s) => s === 'upcoming')).toBe(true);
  });

  it("reads the presiding officers' signatures on the enrolled bill as passed, not as law", () => {
    for (const action of ['Signed by President of the Senate.', 'Signed by the Speaker of the House and the President Pro Tempore.']) {
      // A record with no stored status falls back to the wording, which must not say "enacted".
      const path = billPath(record(action, { status: undefined as unknown as PolicyRecord['status'] }));
      expect(path.known).toBe(true);
      expect(path.outcome).toBe('in-progress');
      expect(path.reached).toBe(3);
      expect(path.headline).toBe('Passed both chambers');
    }
  });

  it('reads the chamber against the one the bill started in', () => {
    // A Senate bill's own committee is its first chamber…
    expect(billPath(senateBill('Read twice and referred to the Committee on Banking.')).headline).toBe('In committee');
    expect(billPath(senateBill('Placed on Senate Legislative Calendar under General Orders. Calendar No. 45.')).reached).toBe(2);
    // …and the House is its second.
    const inHouse = billPath(senateBill('Referred to the House Committee on Energy and Commerce.'));
    expect(inHouse.reached).toBe(3);
    expect(inHouse.headline).toBe('In the House');
    expect(billPath(senateBill('Received in the House.')).headline).toBe('In the House');
    expect(billPath(record('Referred to the House Committee on Ways and Means.')).origin).toBe('House');
    expect(billPath(senateBill('Received in the House.')).origin).toBe('Senate');
  });

  it('takes the chamber from the bill number when the record has no bill type', () => {
    const path = billPath(record('Received in the Senate.', { billType: undefined, billNumber: 'H.R. 5' }));
    expect(path.origin).toBe('House');
    expect(path.headline).toBe('In the Senate');
  });

  it('marks enactment as every stage done', () => {
    const path = billPath(record('Became Public Law No: 119-21.', { status: 'enacted' }));
    expect(path.outcome).toBe('enacted');
    expect(path.reached).toBe(BILL_STAGES.length - 1);
    expect(states(path).every((s) => s === 'done')).toBe(true);
    expect(path.headline).toBe('Became law');
  });

  it('stops a failed bill where it failed, never further', () => {
    const veto = billPath(record('Vetoed by President.', { status: 'rejected' }));
    expect(veto.outcome).toBe('failed');
    expect(veto.reached).toBe(4);
    expect(veto.steps[4].state).toBe('stopped');
    expect(veto.headline).toBe('Vetoed');

    const floor = billPath(record('On passage Failed by the Yeas and Nays: 200 - 215.', { status: 'rejected' }));
    expect(floor.reached).toBe(2);
    expect(floor.steps[2].state).toBe('stopped');
    expect(floor.headline).toBe('Failed in the House');

    const committee = billPath(record('Died in committee', { status: 'rejected', region: 'Florida', billType: undefined, billNumber: 'HB 12' }));
    expect(committee.reached).toBe(1);
    expect(committee.headline).toBe('Stopped in committee');
  });

  it('says an override is under way rather than "sent", when a veto is mentioned but the bill is not rejected', () => {
    const path = billPath(record('Passed House over veto by the Yeas and Nays: 290 - 140.', { status: 'passed' }));
    expect(path.reached).toBe(4);
    expect(path.headline).toBe('Vetoed; an override is under way');
  });

  it('never shows less than a "passed" record says', () => {
    // An action that doesn't name the passage (a procedural note) still gets the floor stage, done.
    const path = billPath(record('Motion to reconsider laid on the table', { status: 'passed' }));
    expect(path.reached).toBe(2);
    expect(path.steps[2].state).toBe('done');
  });

  it('a verified record with no action yet is introduced (every record is a filed bill)', () => {
    const path = billPath(record(null));
    expect(path.reached).toBe(0);
    expect(path.headline).toBe('Introduced in the House');
  });

  it('keeps an older record without a stored status honest, from its wording', () => {
    expect(billPath(record('Became Public Law No: 119-3.', { status: undefined })).outcome).toBe('enacted');
    expect(billPath(record('Vetoed by President.', { status: undefined })).outcome).toBe('failed');
    expect(billPath(record('Veto message received.', { status: undefined })).outcome).toBe('failed');
    expect(billPath(record('Referred to the House Committee on Rules.', { status: undefined })).headline).toBe('In committee');
  });

  it('walks a repealed law through every stage (only a law is repealed), and says it was repealed', () => {
    const path = billPath(record('Repealed by H.R. 22.', { status: 'repealed' }));
    expect(path.outcome).toBe('repealed');
    expect(path.reached).toBe(BILL_STAGES.length - 1);
    expect(states(path).every((s) => s === 'done')).toBe(true);
    expect(path.headline).toBe('Became law, later repealed');
    // A state law, repealed in a later session: the same.
    const ohio = billPath({ verified: true, source: 'openstates', latestAction: 'Repealed', latestActionDate: '2026-04-02', asOf: AS_OF, status: 'repealed', billNumber: 'HB 55', region: 'Ohio' });
    expect(ohio).toMatchObject({ outcome: 'repealed', headline: 'Became law, later repealed', reached: 4 });
  });

  it('reads a bill that is about repealing something by its own stage (statusFromAction gives these passed and proposed)', () => {
    const passed = billPath(record('Passed House. (A bill to repeal section 5 of the Act)', { status: 'passed' }));
    expect(passed).toMatchObject({ outcome: 'in-progress', headline: 'Passed the House' });
    const referred = billPath(record('Referred to the Committee on Ways and Means. To repeal the estate tax.', { status: 'proposed' }));
    expect(referred).toMatchObject({ outcome: 'in-progress', headline: 'In committee' });
  });
});

describe('billPath: states', () => {
  const state = (latestAction: string, billNumber: string, region: string, status: PolicyRecord['status'] = 'proposed') =>
    billPath({ verified: true, source: 'openstates', latestAction, latestActionDate: '2026-04-02', asOf: AS_OF, status, billNumber, region });

  it.each([
    ['In Assembly. Read first time. Held at Desk.', 'SB 1047', 'California', 3, 'In the Assembly'],
    ['In Senate. Read first time. To Com. on RLS. for assignment.', 'AB 12', 'California', 3, 'In the Senate'],
    ['From committee: Do pass and re-refer to Com. on APPR. (Ayes 5. Noes 2.)', 'SB 1047', 'California', 1, 'In committee'],
    ['Read second time. Ordered to third reading.', 'SB 1047', 'California', 2, 'Out of committee'],
    ['Received from the House', 'HB 4', 'Texas', 3, 'In the Senate'],
    ['Withdrawn from Appropriations; Now in Fiscal Policy', 'SB 7', 'Florida', 1, 'In committee'],
    ['Second Read and Referred S Health Committee', 'SB 3', 'Missouri', 1, 'In committee'],
    ['DELIVERED TO GOVERNOR', 'S 1234', 'New York', 4, 'Sent to the Governor'],
  ] as const)('%s (%s, %s)', (action, bill, region, reached, headline) => {
    const path = state(action, bill, region);
    expect(path.reached).toBe(reached);
    expect(path.headline).toBe(headline);
  });

  it('enacted state law', () => {
    const path = state('Chaptered by Secretary of State - Chapter 512, Statutes of 2025', 'SB 1047', 'California', 'enacted');
    expect(path.outcome).toBe('enacted');
    expect(path.headline).toBe('Became law');
  });

  it('a one-house legislature has no "other chamber" stage', () => {
    const path = state('Placed on Final Reading', 'LB 1', 'Nebraska');
    expect(path.steps.map((s) => s.id)).toEqual(['introduced', 'committee', 'floor', 'signed']);
    expect(path.origin).toBe('Legislature');
    const passed = state('Passed on Final Reading 45-0-4', 'LB 1', 'Nebraska', 'passed');
    expect(passed.reached).toBe(2);
    expect(passed.headline).toBe('Passed the Legislature');
    // Chamber words in the action never invent a second chamber.
    expect(state('Referred to Senate Health Committee', 'LB 2', 'Nebraska').reached).toBe(1);
  });

  it('without a recognisable bill number, it stays within the first chamber', () => {
    const path = state('Received in the Senate', 'LD 120', 'Maine');
    expect(path.origin).toBeNull();
    expect(path.reached).toBeLessThan(3);
  });
});

describe('formatRecordDate', () => {
  it('formats dates and timestamps as the same calendar day everywhere', () => {
    expect(formatRecordDate('2026-09-15')).toBe('Sep 15, 2026');
    expect(formatRecordDate('2026-10-18T23:59:00.000Z')).toBe('Oct 18, 2026');
    expect(formatRecordDate('')).toBeNull();
    expect(formatRecordDate('not a date')).toBeNull();
    expect(formatRecordDate(null)).toBeNull();
  });

  it('dates a timestamp by Washington’s day, so a US evening read is never "as of" tomorrow', () => {
    // 03:10 UTC on the 19th is the evening of the 18th in Washington.
    expect(formatRecordDate('2026-10-19T03:10:00.000Z')).toBe('Oct 18, 2026');
    expect(formatRecordDate('2026-10-19T15:00:00Z')).toBe('Oct 19, 2026');
    // A plain date is the record's own day, whatever the clock.
    expect(formatRecordDate('2026-10-19')).toBe('Oct 19, 2026');
  });
});
