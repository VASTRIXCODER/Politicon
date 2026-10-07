import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { AiOutputError } from '@/lib/claude';
import { apiError } from '@/lib/server/http';

/** Map a failed Claude call to a typed API error. Never leaks provider details. */
export function aiFailure(e: unknown, what: string) {
  console.error(`${what} failed:`, e);
  if (e instanceof AiOutputError) {
    return apiError(502, 'ai_bad_output', 'The AI returned an incomplete answer. Please try again.');
  }
  if (e instanceof Anthropic.APIError && (e.status === 429 || e.status === 529)) {
    return apiError(503, 'ai_busy', 'The AI service is busy right now. Please try again in a minute.', 60);
  }
  return apiError(502, 'ai_failed', 'The AI service could not complete this request. Please try again.');
}
