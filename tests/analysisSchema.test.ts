import { describe, expect, it } from 'vitest';
import { coerceFullAnalysis, policyStatus } from '@/lib/analysisSchema';
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
