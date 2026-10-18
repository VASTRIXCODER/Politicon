import { expect, type APIRequestContext, type Page, type Route } from '@playwright/test';
import { ANALYSIS_SCHEMA_VERSION, coerceFullAnalysis } from '@/lib/analysisSchema';
import type { DiscoveredPolicy, FullAnalysis, Policy } from '@/types';
import { FAKE_SERVICE_ROLE_KEY, FAKE_SUPABASE_URL } from './hermetic';

/**
 * The signed-in app, hermetically: fixtures in the AI routes' real shapes,
 * the fake Supabase's database read and written as the service role, and the
 * browser-side mocks for the AI routes and Realtime. Shared by the hermetic
 * journey (journey-hermetic.spec.ts) and the frame-rate probe
 * (frame-rate.spec.ts). Needs a build against the fake: see hermetic.ts.
 */

export const FAKE_HOST = new URL(FAKE_SUPABASE_URL).host;
export const TIMEOUTS = { feed: 30_000, analysis: 30_000, reply: 15_000 };

// ---------------------------------------------------------------------------
// Fixtures: the shapes the AI routes return
// ---------------------------------------------------------------------------

const AS_OF = new Date().toISOString();

export const FEED: DiscoveredPolicy[] = [
  {
    id: 'us-119-hr-1001',
    title: 'Working Families Tax Credit Act',
    billNumber: 'H.R. 1001',
    status: 'proposed',
    category: 'taxes',
    relevanceScore: 86,
    relevance: 'High',
    summary: 'Raises the refundable credit for households with children under 17.',
    description: 'Raises the refundable credit for households with children under 17.',
    direction: 'positive',
    estimatedImpact: '+$1,200/yr',
    reasons: ['You file as head of household', 'Your income is in the phase-in range', 'You have dependents'],
    region: 'Federal',
    record: {
      verified: true, source: 'congress.gov', sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1001',
      latestActionDate: '2026-09-15', latestAction: 'Referred to the Committee on Ways and Means.', asOf: AS_OF,
      status: 'proposed', billNumber: 'H.R. 1001', region: 'Federal', congress: 119, billType: 'hr', number: '1001',
    },
  },
  {
    id: 'us-119-s-2002',
    title: 'Rental Housing Supply Act',
    billNumber: 'S. 2002',
    status: 'proposed',
    category: 'housing',
    relevanceScore: 58,
    relevance: 'Medium',
    summary: 'Funds grants to states that loosen zoning limits on multifamily housing.',
    description: 'Funds grants to states that loosen zoning limits on multifamily housing.',
    direction: 'neutral',
    estimatedImpact: 'Depends on local rents',
    reasons: ['You rent your home', 'Your state is eligible', 'Housing is one of your concerns'],
    region: 'Federal',
    record: {
      verified: true, source: 'congress.gov', sourceUrl: 'https://www.congress.gov/bill/119th-congress/senate-bill/2002',
      latestActionDate: '2026-08-02', latestAction: 'Read twice and referred to the Committee on Banking.', asOf: AS_OF,
      status: 'proposed', billNumber: 'S. 2002', region: 'Federal', congress: 119, billType: 's', number: '2002',
    },
  },
];
export const TARGET = FEED[0];

export const POLICY: Policy = {
  id: TARGET.id, title: TARGET.title, summary: TARGET.summary, description: TARGET.description, category: TARGET.category,
  status: 'proposed', date: '2026-09-15', source: 'congress.gov', sourceUrl: TARGET.record!.sourceUrl!, governingBody: 'H.R. 1001',
  region: 'Federal', confidenceLevel: 'medium', impacts: [], assumptions: [], tags: [], record: TARGET.record,
};

/** A complete analysis, normalized exactly as the server stores it. */
export const ANALYSIS: FullAnalysis = coerceFullAnalysis(
  {
    plainEnglishSummary: 'If it passes as written, your refundable credit could rise by about $1,200 a year.',
    netAnnualImpact: 1200,
    netMonthlyImpact: 100,
    confidenceScore: 64,
    direction: 'positive',
    assumptions: ['One dependent under 17', 'Income stays in the same range'],
    categoryImpacts: { taxes: 1200 },
    tradeoffs: { gains: [{ label: 'Larger refundable credit', value: 1200 }], losses: [], netAssessment: 'Likely a modest gain.' },
    riskFactors: { uncertainties: ['The bill may change in committee'], confidence: 64 },
    recommendations: [{ step: 'Check your withholding next year', priority: 'medium' }],
    record: TARGET.record,
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
  },
  POLICY,
);

export const INSIGHT = 'Across the policies you analyzed, the tax credit change is the largest effect on your budget.';
export const GUIDE_SUMMARY = 'This bill would raise the refundable credit for families with children.';
export const GUIDE_DOLLAR_LINE = 'Estimated effect for you: about +$1,200 a year';

// ---------------------------------------------------------------------------
// The fake database, read and written as the service role
// ---------------------------------------------------------------------------

export function db(request: APIRequestContext) {
  const headers = { apikey: FAKE_SERVICE_ROLE_KEY, authorization: `Bearer ${FAKE_SERVICE_ROLE_KEY}` };
  return {
    async select<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
      const res = await request.get(`${FAKE_SUPABASE_URL}/rest/v1/${table}?${query}`, { headers });
      expect(res.ok(), `select ${table}: ${res.status()}`).toBe(true);
      return (await res.json()) as T[];
    },
    async insert(table: string, row: Record<string, unknown>) {
      const res = await request.post(`${FAKE_SUPABASE_URL}/rest/v1/${table}`, { headers, data: row });
      expect(res.ok(), `insert ${table}: ${res.status()}`).toBe(true);
    },
    async update(table: string, query: string, patch: Record<string, unknown>) {
      const res = await request.patch(`${FAKE_SUPABASE_URL}/rest/v1/${table}?${query}`, { headers, data: patch });
      expect(res.ok(), `update ${table}: ${res.status()}`).toBe(true);
    },
  };
}
export type Db = ReturnType<typeof db>;

// ---------------------------------------------------------------------------
// Browser-side mocks
// ---------------------------------------------------------------------------

/** API routes the journey uses for real (they run on `next start` against the fake). */
const REAL_API = new Set(['/api/profile', '/api/feedback']);

export interface AiCalls {
  feed: number;
  analyzeStart: string[];
  analyzePoll: number;
  insight: number;
  advisor: { policyId?: string; lastMessage: string }[];
  /** /api requests nothing here answers: each fails the test. */
  unexpected: string[];
}

/**
 * Answers the AI routes in their real shapes. The feed is "being built" (202)
 * on the first request, as for a brand-new user, and ready from then on.
 * Starting an analysis claims a pending row and the first status check
 * finishes it, writing the analysis to the database as the server's
 * background job would.
 */
export async function mockAiRoutes(page: Page, database: Db, userId: () => string): Promise<AiCalls> {
  const calls: AiCalls = { feed: 0, analyzeStart: [], analyzePoll: 0, insight: 0, advisor: [], unexpected: [] };
  const feedUpdatedAt = new Date().toISOString();
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const key = `${method} ${url.pathname}`;

      if (REAL_API.has(url.pathname)) return route.fallback();

      if (key === 'GET /api/policies/feed') {
        calls.feed += 1;
        if (calls.feed === 1) return json(route, { generating: true, policies: [], updatedAt: null }, 202);
        return json(route, { policies: FEED, updatedAt: feedUpdatedAt, cached: true, failed: false });
      }

      if (key === 'POST /api/analyze') {
        const { policyId } = request.postDataJSON() as { policyId: string };
        calls.analyzeStart.push(policyId);
        const policy = FEED.find((p) => p.id === policyId);
        if (!policy) return json(route, { error: { code: 'policy_not_found', message: 'That policy is not in your feed.' } }, 404);
        await database.insert('analyzed_policies', {
          user_id: userId(), policy_id: policy.id, policy_title: policy.title, category: policy.category, status: policy.status,
          analysis: {}, generation_status: 'pending', generation_started_at: new Date().toISOString(),
        });
        return json(route, { status: 'pending' }, 202);
      }

      if (key === 'GET /api/analyze') {
        calls.analyzePoll += 1;
        const policyId = url.searchParams.get('policyId');
        const filter = `user_id=eq.${userId()}&policy_id=eq.${encodeURIComponent(policyId ?? '')}`;
        const [row] = await database.select('analyzed_policies', `select=generation_status&${filter}`);
        if (!row) return json(route, { status: 'none' });
        const [profile] = await database.select<Record<string, unknown>>(
          'user_profiles',
          `select=state,income_range,filing_status,housing_situation,employment_status,dependents_count,debt_types,financial_updated_at&id=eq.${userId()}`,
        );
        const profileSnapshot = {
          state: profile.state, incomeRange: profile.income_range, filingStatus: profile.filing_status,
          housingSituation: profile.housing_situation, employmentStatus: profile.employment_status,
          dependentsCount: profile.dependents_count ?? null, debtTypes: profile.debt_types,
        };
        await database.update('analyzed_policies', filter, {
          bill_number: ANALYSIS.billNumber, direction: ANALYSIS.direction, confidence_score: ANALYSIS.confidenceScore,
          net_annual_impact: ANALYSIS.netAnnualImpact, net_monthly_impact: ANALYSIS.netMonthlyImpact, analysis: ANALYSIS,
          model: 'e2e-mock', prompt_version: 'e2e', schema_version: ANALYSIS_SCHEMA_VERSION, profile_snapshot: profileSnapshot,
          profile_version: profile.financial_updated_at, generation_status: 'ready', generation_error: null,
        });
        return json(route, { status: 'ready', error: null, analysis: ANALYSIS, profileSnapshot });
      }

      if (key === 'POST /api/insight') {
        calls.insight += 1;
        return json(route, { insight: INSIGHT, cached: false });
      }

      if (key === 'POST /api/advisor') {
        const body = request.postDataJSON() as { messages: { role: string; content: string }[]; policyId?: string };
        calls.advisor.push({ policyId: body.policyId, lastMessage: body.messages[body.messages.length - 1]?.content ?? '' });
        const policy = FEED.find((p) => p.id === body.policyId);
        if (policy) {
          return json(route, {
            response: `${GUIDE_SUMMARY}\n\n${GUIDE_DOLLAR_LINE}`, summary: GUIDE_SUMMARY, dollarLine: GUIDE_DOLLAR_LINE,
            policyId: policy.id, policyTitle: policy.title, category: policy.category, hasFullAnalysis: true,
          });
        }
        return json(route, { response: 'Here is how that could work for a household like yours.', hasFullAnalysis: false });
      }

      if (key === 'POST /api/cumulative-summary') return json(route, { summary: 'Together, these policies are a small net gain.' });

      calls.unexpected.push(key);
      return json(route, { error: { code: 'e2e_unmocked', message: `${key} is not mocked in tests/e2e/hermetic-journey.ts` } }, 501);
    },
  );
  return calls;
}

/**
 * Supabase Realtime (the dashboard subscribes to its analyses), answered in
 * the browser: joins and heartbeats succeed, and nothing is ever pushed.
 * Handles both of realtime-js's wire formats (vsn 2.0.0 arrays, 1.0.0 objects).
 */
export async function mockRealtime(page: Page) {
  await page.routeWebSocket(
    (url) => url.host === FAKE_HOST && url.pathname.startsWith('/realtime/v1/websocket'),
    (ws) => {
      ws.onMessage((message) => {
        if (typeof message !== 'string') return;
        let msg: unknown;
        try { msg = JSON.parse(message); } catch { return; }
        const asArray = Array.isArray(msg);
        const [joinRef, ref, topic, event, payload] = asArray
          ? (msg as [string | null, string, string, string, Record<string, unknown>])
          : (() => {
              const o = msg as { join_ref: string | null; ref: string; topic: string; event: string; payload: Record<string, unknown> };
              return [o.join_ref, o.ref, o.topic, o.event, o.payload] as const;
            })();
        const reply = (response: Record<string, unknown>) => {
          const body = { status: 'ok', response };
          ws.send(JSON.stringify(asArray ? [joinRef, ref, topic, 'phx_reply', body] : { join_ref: joinRef, ref, topic, event: 'phx_reply', payload: body }));
        };
        if (event === 'phx_join') {
          const config = (payload?.config ?? {}) as { postgres_changes?: Record<string, unknown>[] };
          const changes = (config.postgres_changes ?? []).map((change, i) => ({ ...change, id: i + 1 }));
          reply(changes.length ? { postgres_changes: changes } : {});
        } else if (event === 'heartbeat' || event === 'phx_leave') {
          reply({});
        }
      });
    },
  );
}
