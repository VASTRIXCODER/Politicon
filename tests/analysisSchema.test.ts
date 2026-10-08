import { describe, expect, it } from 'vitest';
import { coerceFullAnalysis, officialBillNumber, policyStatus, validRecord } from '@/lib/analysisSchema';
import type { Policy } from '@/types';

const policy: Policy = {
  id: 'us-hr-1', title: 'Test Act', summary: 'Does things', description: 'Does things', category: 'taxes',
  status: 'proposed', date: '2026-10-07', source: '', sourceUrl: '', governingBody: 'H.R. 1', region: 'Federal',
  confidenceLevel: 'medium', impacts: [], assumptions: [], tags: [],
};

describe('policyStatus', () => {
  it.each([
    ['enacted', 'enacted'],
    ['Signed into law', 'enacted'],
    ['In effect', 'enacted'],
    ['Repealed', 'repealed'],
    ['Vetoed', 'rejected'],
    ['Passed the House', 'passed'],
    ['Introduced', 'proposed'],
    [undefined, 'proposed'],
  ])('%s → %s', (input, out) => {
    expect(policyStatus(input)).toBe(out);
  });
});

describe('coerceFullAnalysis', () => {
  it('fills every section for an older or partial analysis', () => {
    const a = coerceFullAnalysis({ plainEnglishSummary: 'Short', netAnnualImpact: -1200 }, policy);
    expect(a.netAnnualImpact).toBe(-1200);
    expect(a.netMonthlyImpact).toBe(-100);
    expect(a.timeline.monthly).toHaveLength(12);
    expect(a.timeline.monthly[11].impact).toBe(-1200);
    expect(a.direction).toBe('negative');
    expect(a.macro.economicUncertaintyScore).toBe(0);
    expect(a.assumptions).toEqual([]);
  });

  it('does not invent a confidence score', () => {
    expect(coerceFullAnalysis({ plainEnglishSummary: 'x', netAnnualImpact: 0 }, policy).confidenceScore).toBe(0);
  });

  it('clamps scores and keeps valid enums', () => {
    const a = coerceFullAnalysis({
      plainEnglishSummary: 'x', netAnnualImpact: 10, confidenceScore: 140, status: 'signed into law',
      corporate: { capexDirection: 'pulling back' }, vulnerability: { debtBurden: -5 },
      assumptions: ['Assumes standard deduction', '', 'Assumes no itemizing'],
    }, policy);
    expect(a.confidenceScore).toBe(100);
    expect(a.status).toBe('enacted');
    expect(a.corporate.capexDirection).toBe('pulling_back');
    expect(a.vulnerability.debtBurden).toBe(0);
    expect(a.assumptions).toEqual(['Assumes standard deduction', 'Assumes no itemizing']);
  });
});

describe('validRecord', () => {
  const base = { verified: true, source: 'congress.gov', asOf: '2026-10-08T00:00:00Z' };

  it('keeps the official facts and Congress.gov coordinates', () => {
    const r = validRecord({
      ...base, sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1', status: 'enacted', billNumber: 'H.R. 1',
      region: 'Federal', congress: 119, billType: 'hr', number: '1', session: '2025-2026', abstract: 'x'.repeat(2000),
    });
    expect(r).toMatchObject({ status: 'enacted', billNumber: 'H.R. 1', region: 'Federal', congress: 119, billType: 'hr', number: '1', session: '2025-2026' });
    expect(r!.abstract).toHaveLength(1500);
  });

  it('drops malformed fields, including coordinates that would be put into a URL', () => {
    const r = validRecord({
      ...base, sourceUrl: 'http://example.com', status: 'law', congress: '119', billType: 'hr/../../x', number: '1?api_key=x', billNumber: '  ',
    });
    expect(r).toMatchObject({ verified: true, source: 'congress.gov' });
    for (const k of ['sourceUrl', 'status', 'congress', 'billType', 'number', 'billNumber'] as const) expect(r![k]).toBeUndefined();
  });

  it('rejects something that is not a record', () => {
    expect(validRecord(null)).toBeUndefined();
    expect(validRecord({ source: 'congress.gov' })).toBeUndefined();
  });
});

describe('official record overrides the model', () => {
  const model = { plainEnglishSummary: 'x', netAnnualImpact: 0, billNumber: 'H.R. 9', status: 'enacted' };
  const record = { verified: true, source: 'congress.gov' as const, asOf: '', status: 'passed' as const, billNumber: 'H.R. 1' };

  it('uses the record\'s bill number and status for a verified policy', () => {
    const a = coerceFullAnalysis({ ...model, record }, { ...policy, status: 'passed', record });
    expect(a).toMatchObject({ billNumber: 'H.R. 1', status: 'passed', record: { status: 'passed', billNumber: 'H.R. 1' } });
  });

  it('falls back to the policy (taken from the record) for records saved without those fields', () => {
    const older = { verified: true, source: 'openstates' as const, asOf: '' };
    const a = coerceFullAnalysis(model, { ...policy, governingBody: 'SB 1047', region: 'California', status: 'repealed', record: older });
    expect(a).toMatchObject({ billNumber: 'SB 1047', status: 'repealed' });
  });

  it('keeps the model\'s values when the policy is not verified', () => {
    const a = coerceFullAnalysis(model, { ...policy, record: { verified: false, source: 'ai', asOf: '' } });
    expect(a).toMatchObject({ billNumber: 'H.R. 9', status: 'enacted' });
  });

  it('never reports a region as a bill number', () => {
    expect(officialBillNumber({ governingBody: 'Ohio', record: undefined })).toBe('');
    expect(officialBillNumber({ governingBody: 'HB 96', record: undefined })).toBe('HB 96');
  });
});
