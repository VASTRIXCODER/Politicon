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
});
