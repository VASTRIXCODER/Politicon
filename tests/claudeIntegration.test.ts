import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Runs lib/claude.ts against a local server that speaks the Messages API
 * streaming format, to check the request we send (model, effort, structured
 * output schema, prompt caching) and how responses are parsed.
 */

vi.mock('server-only', () => ({}));
const recordAiUsage = vi.fn();
vi.mock('@/lib/server/aiGuard', () => ({ recordAiUsage: (...a: unknown[]) => recordAiUsage(...a) }));

let nextReply: { text: string; stopReason: string } = { text: '', stopReason: 'end_turn' };
// When set, the fake server sends message_start and then stalls, like a stream cut off mid-generation.
let hangAfterStart = false;
let lastRequest: Record<string, unknown> | null = null;
let server: http.Server;

function sse(res: http.ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      lastRequest = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': 'req_test' });
      const model = (lastRequest as { model: string }).model;
      sse(res, 'message_start', {
        type: 'message_start',
        message: { id: 'msg_1', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null,
          usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 } },
      });
      if (hangAfterStart) return; // leave the stream open with no further events
      sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: nextReply.text } });
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
      sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: nextReply.stopReason, stop_sequence: null }, usage: { output_tokens: 350 } });
      sse(res, 'message_stop', { type: 'message_stop' });
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterAll(() => { server.closeAllConnections(); server.close(); });

const profile = {
  id: 'u1', hasCompletedOnboarding: true, country: 'United States', state: 'Ohio', city: '', ageRange: '25_34',
  educationStage: 'college_4yr', employmentStatus: 'employed_full', occupationCategory: 'tech', incomeRange: '75k_100k',
  filingStatus: 'single', housingSituation: 'rent', debtTypes: ['student_loans'], hasDependents: false, dependentsCount: 0,
  topFinancialConcerns: ['cost_of_living'],
};
const meta = { feature: 'feed' as const, userId: 'u1', usageId: 42 };

describe('lib/claude.ts against the streaming Messages API', () => {
  it('sends a structured, cached, effort-controlled request and parses the feed', async () => {
    const { discoverPolicyFeed } = await import('@/lib/claude');
    nextReply = {
      stopReason: 'end_turn',
      text: JSON.stringify({ policies: [
        { title: 'One Big Beautiful Bill Act', billNumber: 'H.R. 1', status: 'enacted', category: 'taxes', relevanceScore: 91,
          summary: 'Changes tax brackets.', direction: 'positive', estimatedImpact: '+$600/yr', region: 'Federal', reasons: ['a', 'b', 'c', 'd'] },
        { title: 'Duplicate', billNumber: 'HR 1', status: 'enacted', category: 'taxes', relevanceScore: 150,
          summary: 'Same bill.', direction: 'neutral', estimatedImpact: '$0', region: 'United States', reasons: [] },
      ] }),
    };
    const items = await discoverPolicyFeed(profile, meta);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'us-hr-1', status: 'enacted', relevance: 'High', reasons: ['a', 'b', 'c'] });

    const req = lastRequest as Record<string, any>;
    expect(req.model).toBe('claude-sonnet-5-5');
    expect(req.stream).toBe(true);
    expect(req.thinking).toBeUndefined(); // adaptive by default; "disabled" would be a 400
    expect(req.output_config.effort).toBe('medium');
    expect(req.output_config.format.type).toBe('json_schema');
    // The feed's static prompt is too short to cache, so no breakpoint is set on it.
    expect(req.system[0].cache_control).toBeUndefined();
    expect(req.cache_control).toBeUndefined();
    expect(req.output_config.format.schema.properties.policies.items.properties.status.enum).toEqual(
      ['proposed', 'passed', 'enacted', 'repealed', 'rejected'],
    );
    expect(req.messages[0].content).toContain('Today is');

    expect(recordAiUsage).toHaveBeenLastCalledWith(expect.objectContaining({
      usageId: 42, model: 'claude-sonnet-5-5', inputTokens: 1200, outputTokens: 350, cacheReadTokens: 800,
      ok: true, requestId: 'req_test',
    }));
  });

  it('turns a refusal into a typed error and still bills it against the quota', async () => {
    const { discoverPolicyFeed, AiOutputError } = await import('@/lib/claude');
    nextReply = { stopReason: 'refusal', text: '' };
    const err = await discoverPolicyFeed(profile, meta).catch((e) => e);
    expect(err).toBeInstanceOf(AiOutputError);
    expect(err.kind).toBe('refusal');
    expect(recordAiUsage).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true, stopReason: 'refusal', outputTokens: 350 }));
  });

  it('charges an interrupted call its full output allowance instead of $0', async () => {
    const { discoverPolicyFeed } = await import('@/lib/claude');
    nextReply = { stopReason: 'end_turn', text: '{"policies": []}' };
    const controller = new AbortController();
    hangAfterStart = true;
    const pending = discoverPolicyFeed(profile, meta, controller.signal).catch((e) => e);
    await new Promise((r) => setTimeout(r, 150));
    controller.abort();
    const err = await pending;
    hangAfterStart = false;
    expect(err).toBeInstanceOf(Error);
    expect(recordAiUsage).toHaveBeenLastCalledWith(expect.objectContaining({
      ok: true, stopReason: 'interrupted', inputTokens: 1200, outputTokens: 16000,
    }));
  });

  it('rejects output that does not match the schema', async () => {
    const { discoverPolicyFeed, AiOutputError } = await import('@/lib/claude');
    nextReply = { stopReason: 'end_turn', text: JSON.stringify({ policies: [{ title: 'x' }] }) };
    const err = await discoverPolicyFeed(profile, meta).catch((e) => e);
    expect(err).toBeInstanceOf(AiOutputError);
    expect(err.kind).toBe('invalid');
    // The call's real token usage is still recorded.
    expect(recordAiUsage).toHaveBeenLastCalledWith(expect.objectContaining({ outputTokens: 350 }));
  });

  it('streams plain-text chat with the profile in a separate, uncached system block', async () => {
    const { chatWithAdvisor } = await import('@/lib/claude');
    nextReply = { stopReason: 'end_turn', text: 'Here is how it affects you.' };
    const reply = await chatWithAdvisor(
      [{ role: 'assistant', content: 'Hi!' }, { role: 'user', content: 'How do tariffs affect me?' }],
      profile, { feature: 'advisor', userId: 'u1', usageId: 7 },
    );
    expect(reply).toBe('Here is how it affects you.');
    const req = lastRequest as Record<string, any>;
    expect(req.messages).toEqual([{ role: 'user', content: 'How do tariffs affect me?' }]);
    expect(req.output_config.effort).toBe('low');
    expect(req.output_config.format).toBeUndefined();
    expect(req.system).toHaveLength(2);
    // Chat caches the whole conversation prefix, which is re-sent every turn.
    expect(req.cache_control).toEqual({ type: 'ephemeral' });
    expect(req.system[1].text).toContain('Ohio');
    expect(req.system[1].cache_control).toBeUndefined();
  });

  it('round-trips a complete structured analysis into a FullAnalysis', async () => {
    const { analyzePolicyFull } = await import('@/lib/claude');
    const L = (label: string, value: number) => ({ label, value });
    const analysis = {
      billNumber: 'H.R. 1', status: 'enacted', confidenceScore: 72, direction: 'negative',
      plainEnglishSummary: 'Raises your costs a little.', assumptions: ['Standard deduction'],
      netAnnualImpact: -1200, netMonthlyImpact: -100,
      immediate: { monthlyBudgetImpact: -100, annualBudgetImpact: -1200, effectiveTaxRateChange: 0.4, takeHomePerPaycheck: -46, spendingCategories: [L('Groceries', -20)] },
      housing: { monthlyHousingEffect: 0, propertyValueChangePct: 0, affordabilityIndexChange: 0, firstTimeBuyerImpact: '' },
      employment: { jobSecurityRisk: 10, wageGrowthPct: 0, benefitChangeValue: 0, industryEffects: '' },
      healthcare: { monthlyPremiumChange: 0, outOfPocketMaxChange: 0, prescriptionCostChange: 0, coverageChange: '' },
      retirement: { contributionLimitChange: 0, socialSecurityChange: 0, timelineImpactYears: 0 },
      education: { studentLoanPaymentChange: 0, tuitionAssistanceChange: 0, childEducationCostChange: 0 },
      tax: { federalLiabilityChange: -1200, stateLiabilityChange: 0, effectiveRateBefore: 12, effectiveRateAfter: 12.4, bracketChange: '', deductionChanges: '', creditChanges: '' },
      ripple: { inflationImpactPct: 0.1, costOfLivingChange: -60, purchasingPowerChange: -60, interestRateEffect: '' },
      categoryImpacts: { taxes: -1200, housing: 0, healthcare: 0, employment: 0, retirement: 0, education: 0 },
      timeline: { year1: -1200, year3: -3600, year5: -6000, monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, impact: -100 * (i + 1) })) },
      tradeoffs: { gains: [], losses: [L('Higher tax', -1200)], netAssessment: 'Small net cost.' },
      riskFactors: { uncertainties: ['Implementation timing'], confidence: 72 },
      recommendations: [{ step: 'Check your withholding', priority: 'medium' }],
      macro: { gdpImpactPct: 0.1, gdpExplanation: '', inflationImpactPct: 0.1, inflationExplanation: '', economicUncertaintyScore: 30, uncertaintyExplanation: '', balanceOfPaymentsEffect: '' },
      corporate: { sector: 'Tech', capexDirection: 'neutral', capexExplanation: '', leverageEffect: 'neutral', leverageExplanation: '', profitabilityTrend: 'neutral', profitabilityExplanation: '', equityPortfolioImpactPct: 0, equityImpactRange: '' },
      personal: { disposableIncomeMonthly: -100, disposableIncomeAnnual: -1200, netWorthChange1yrPct: 0, netWorthChange3yrPct: 0, realEstateEquityPct: 0, realEstateEquityDollar: 0, savingsRateChangePct: -0.5, savingsRateExplanation: '', debtToIncomeChangePct: 0, debtImpacts: [], precautionaryIndex: 40, precautionaryExplanation: '' },
      vulnerability: { incomeStability: 20, housingSecurity: 10, employmentRisk: 10, costOfLivingPressure: 30, investmentExposure: 5, debtBurden: 15 },
      spendingVelocity: [{ category: 'Groceries', dollarImpact: -20, direction: 'negative' }],
      simple: { sectionSummaries: [{ section: 'overview', text: 'You pay a bit more.' }], jargon: [{ term: 'GDP', definition: 'Size of the economy.' }] },
    };
    nextReply = { stopReason: 'end_turn', text: JSON.stringify(analysis) };
    const policy = {
      id: 'us-hr-1', title: 'One Big Beautiful Bill Act', summary: 's', description: 'd', category: 'taxes', status: 'enacted' as const,
      date: '', source: '', sourceUrl: '', governingBody: 'H.R. 1', region: 'Federal', confidenceLevel: 'medium' as const,
      impacts: [], assumptions: [], tags: [],
    };
    const full = await analyzePolicyFull(policy, profile, { feature: 'analyze', userId: 'u1', usageId: 9 });
    expect(full).toMatchObject({ policyId: 'us-hr-1', netAnnualImpact: -1200, confidenceScore: 72, assumptions: ['Standard deduction'], schemaVersion: 3 });
    expect(full.personal.debtImpacts).toEqual([]);
    const req = lastRequest as Record<string, any>;
    expect(req.max_tokens).toBe(32000);
    // The long static analysis prompt is cached across users.
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.output_config.effort).toBe('medium');
    expect(req.messages[0].content).toContain('<policy>');
  });

  const federalRecord = (i: number, extra: Record<string, unknown> = {}) => ({
    id: `us-hr-${i}`, source: 'congress.gov' as const, region: 'Federal', billNumber: `H.R. ${i}`,
    title: `Official Title ${i}`, status: 'proposed' as const,
    latestActionDate: '2026-09-01', latestActionText: 'Referred to the Committee on Ways and Means.',
    sourceUrl: `https://www.congress.gov/bill/119th-congress/house-bill/${i}`, congress: 119, billType: 'hr', number: String(i),
    ...extra,
  });
  const ohioBudget = {
    id: 'ohio-hb-96', source: 'openstates' as const, region: 'Ohio', billNumber: 'HB 96', title: 'Ohio Operating Budget',
    status: 'enacted' as const, latestActionDate: '2026-07-01', latestActionText: 'Signed by the Governor',
    sourceUrl: 'https://openstates.org/oh/bills/136/HB96/', session: '136', abstract: 'Makes operating appropriations for the biennium.',
  };
  const pick = (ref: string, extra: Record<string, unknown> = {}) => ({
    ref, category: 'taxes', relevanceScore: 80, summary: `Pick ${ref}.`, direction: 'positive', estimatedImpact: '≈ +$600/yr', reasons: ['a'], ...extra,
  });

  it('grounded feed: the model only selects official records by ref; facts come from the record', async () => {
    const { discoverPolicyFeed } = await import('@/lib/claude');
    const candidates = [
      ohioBudget,
      ...Array.from({ length: 6 }, (_, i) => federalRecord(i + 1, i === 0 ? { status: 'enacted', latestActionText: 'Became Public Law No: 119-99.' } : {})),
    ];
    nextReply = {
      stopReason: 'end_turn',
      text: JSON.stringify({ policies: [
        pick('F1', { relevanceScore: 88, summary: 'Changes tax brackets.' }),
        pick('S1', { category: 'consumer' }),
        pick('F99', { relevanceScore: 99, summary: 'Invented.' }),
        pick('F1', { relevanceScore: 10, summary: 'Duplicate.' }),
      ] }),
    };
    const items = await discoverPolicyFeed(profile, meta, undefined, candidates);

    expect(items).toHaveLength(2); // unknown ref and duplicate dropped
    expect(items[0]).toMatchObject({
      id: 'us-hr-1', title: 'Official Title 1', billNumber: 'H.R. 1', status: 'enacted', region: 'Federal',
      summary: 'Changes tax brackets.',
      record: {
        verified: true, source: 'congress.gov', sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1', latestActionDate: '2026-09-01',
        status: 'enacted', billNumber: 'H.R. 1', region: 'Federal', congress: 119, billType: 'hr', number: '1',
      },
    });
    expect(items[1]).toMatchObject({
      id: 'ohio-hb-96', region: 'Ohio', status: 'enacted',
      record: {
        verified: true, source: 'openstates', status: 'enacted', billNumber: 'HB 96', region: 'Ohio', session: '136',
        abstract: 'Makes operating appropriations for the biennium.',
      },
    });
    const req = lastRequest as Record<string, any>;
    // Federal records come first in their own block; the date, profile and state records follow.
    const [federalBlock, userBlock] = req.messages[0].content;
    expect(federalBlock.text).toContain('F1 | Federal | H.R. 1 | enacted | 2026-09-01');
    expect(federalBlock.text).not.toContain('Ohio');
    expect(federalBlock.text).not.toContain('Today is');
    expect(userBlock.text).toContain('Today is');
    expect(userBlock.text).toContain('S1 | Ohio | HB 96 | enacted | 2026-07-01');
    expect(userBlock.cache_control).toBeUndefined();
    expect(req.output_config.format.schema.properties.policies.items.required).toContain('ref');
  });

  it('grounded feed: the federal block is the same for every user and carries the cache breakpoint', async () => {
    const { discoverPolicyFeed } = await import('@/lib/claude');
    const federal = Array.from({ length: 40 }, (_, i) => federalRecord(i + 1));
    nextReply = { stopReason: 'end_turn', text: JSON.stringify({ policies: [pick('F2')] }) };

    await discoverPolicyFeed(profile, meta, undefined, [ohioBudget, ...federal]);
    const first = (lastRequest as Record<string, any>).messages[0].content;
    await discoverPolicyFeed({ ...profile, state: 'Texas', incomeRange: '150k_200k' }, meta, undefined, federal);
    const second = (lastRequest as Record<string, any>).messages[0].content;

    expect(first[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(second[0]).toEqual(first[0]);
    expect(second[1].text).not.toEqual(first[1].text);
    expect(second[1].text).toContain('OFFICIAL STATE RECORDS: none available.');
  });

  it('grounded feed: dismissed records are never offered or returned', async () => {
    const { discoverPolicyFeed } = await import('@/lib/claude');
    const federal = Array.from({ length: 6 }, (_, i) => federalRecord(i + 1));
    nextReply = { stopReason: 'end_turn', text: JSON.stringify({ policies: [pick('F1'), pick('F2')] }) };
    const items = await discoverPolicyFeed(profile, meta, undefined, federal, new Set(['us-hr-1']));

    expect(items.map((i) => i.id)).toEqual(['us-hr-2', 'us-hr-3']);
    const [federalBlock] = (lastRequest as Record<string, any>).messages[0].content;
    expect(federalBlock.text).not.toMatch(/\| H\.R\. 1 \|/);
  });

  it('fallback feed: drops dismissed policies and fails rather than return an empty feed', async () => {
    const { discoverPolicyFeed, AiOutputError } = await import('@/lib/claude');
    const { canonicalPolicyId } = await import('@/lib/policyId');
    const title = 'One Big Beautiful Bill Act';
    nextReply = {
      stopReason: 'end_turn',
      text: JSON.stringify({ policies: [{ title, billNumber: 'H.R. 1', status: 'enacted', category: 'taxes', relevanceScore: 91,
        summary: 's', direction: 'positive', estimatedImpact: '', region: 'Federal', reasons: [] }] }),
    };
    const dismissed = new Set([canonicalPolicyId({ billNumber: 'H.R. 1', region: 'Federal', title })]);
    const err = await discoverPolicyFeed(profile, meta, undefined, [], dismissed).catch((e) => e);
    expect(err).toBeInstanceOf(AiOutputError);
    expect(err.kind).toBe('empty');
  });

  it('advisor policy reply: the official record goes inside the fenced policy block', async () => {
    const { advisorPolicyReply } = await import('@/lib/claude');
    nextReply = { stopReason: 'end_turn', text: JSON.stringify({ summary: 'Funds the state budget.', dollarLine: 'About $0 a month.' }) };
    const reply = await advisorPolicyReply(
      {
        title: 'Ohio Operating Budget', summary: 'Funds the state.', governingBody: 'HB 96', region: 'Ohio', status: 'enacted',
        record: {
          verified: true, source: 'openstates', sourceUrl: ohioBudget.sourceUrl, status: 'enacted', billNumber: 'HB 96', region: 'Ohio',
          latestActionDate: '2026-07-01', latestAction: 'Signed by the Governor', abstract: ohioBudget.abstract, asOf: '2026-10-08T00:00:00Z',
        },
      },
      profile, { feature: 'advisor_policy', userId: 'u1', usageId: 11 },
    );
    expect(reply.fullResponse).toBe('Funds the state budget.\n\nAbout $0 a month.');
    const req = lastRequest as Record<string, any>;
    const content = req.messages[0].content as string;
    const fenced = content.slice(content.indexOf('<policy>'), content.indexOf('</policy>'));
    for (const part of ['Bill: HB 96', 'Jurisdiction: Ohio', 'Status: enacted', '2026-07-01 — Signed by the Governor', 'Official abstract: Makes operating appropriations']) {
      expect(fenced).toContain(part);
    }
    expect(req.system[0].text).toContain('authoritative');

    await advisorPolicyReply(
      { title: 'Some Act', summary: 's', governingBody: 'Federal', region: 'Federal', status: 'proposed', record: { verified: false, source: 'ai', asOf: '' } },
      profile, { feature: 'advisor_policy', userId: 'u1', usageId: 12 },
    );
    const unverified = (lastRequest as Record<string, any>).messages[0].content as string;
    expect(unverified).toContain('not verified');
    expect(unverified).not.toContain('Bill:'); // governingBody holds only the region
  });

  it('falls back to unverified items when no official records are available', async () => {
    const { discoverPolicyFeed } = await import('@/lib/claude');
    nextReply = {
      stopReason: 'end_turn',
      text: JSON.stringify({ policies: [{ title: 'Some Act', billNumber: '', status: 'proposed', category: 'housing', relevanceScore: 50,
        summary: 's', direction: 'neutral', estimatedImpact: '', region: 'Ohio', reasons: [] }] }),
    };
    const items = await discoverPolicyFeed(profile, meta, undefined, []);
    expect(items[0].record).toMatchObject({ verified: false, source: 'ai' });
  });
});
