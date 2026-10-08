import 'server-only';

export type AiFeature = 'analyze' | 'feed' | 'advisor' | 'advisor_policy' | 'insight' | 'cumulative_summary';
export type Effort = 'low' | 'medium' | 'high';

/** Main model. Claude Sonnet 5.5 by default; override with ANTHROPIC_MODEL. */
export const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

/**
 * Per-feature settings. Sonnet 5.5 thinks adaptively by default (a "disabled"
 * thinking config is rejected), so depth is controlled with effort, and
 * max_tokens must leave room for thinking as well as the answer.
 */
export const FEATURES: Record<AiFeature, { effort: Effort; maxTokens: number }> = {
  analyze: { effort: 'medium', maxTokens: 32000 },
  feed: { effort: 'medium', maxTokens: 16000 },
  advisor: { effort: 'low', maxTokens: 4000 },
  advisor_policy: { effort: 'low', maxTokens: 4000 },
  insight: { effort: 'low', maxTokens: 2000 },
  cumulative_summary: { effort: 'low', maxTokens: 2000 },
};

/** Dollars per million tokens (input, output). Used to cost the usage ledger. */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
};

function overridePrice(): { input: number; output: number } | null {
  const input = Number(process.env.AI_PRICE_INPUT_PER_MTOK);
  const output = Number(process.env.AI_PRICE_OUTPUT_PER_MTOK);
  return Number.isFinite(input) && input > 0 && Number.isFinite(output) && output > 0 ? { input, output } : null;
}

/**
 * Price for a model, or null when it's unknown. AI_PRICE_INPUT_PER_MTOK /
 * AI_PRICE_OUTPUT_PER_MTOK set the price of a model not listed above.
 */
export function modelPrice(model: string): { input: number; output: number } | null {
  return MODEL_PRICES[model] || Object.entries(MODEL_PRICES).find(([k]) => model.startsWith(k))?.[1] || overridePrice();
}

/** Typical input size of a request, used for the up-front cost estimate. */
const ESTIMATED_INPUT_TOKENS = 8000;

/**
 * Worst-case cost of one call, reserved against the spend ceiling before the
 * call starts and replaced with the real cost when it finishes.
 */
export function estimatedCostUsd(feature: AiFeature): number | null {
  const price = modelPrice(AI_MODEL);
  if (!price) return null;
  return (ESTIMATED_INPUT_TOKENS * price.input + FEATURES[feature].maxTokens * price.output) / 1_000_000;
}
