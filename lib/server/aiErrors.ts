import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { AiOutputError } from '@/lib/claude';
import { apiError } from '@/lib/server/http';

/** A user-facing classification of a failed Claude call. Never leaks provider details. */
export function describeAiError(e: unknown): { status: number; code: string; message: string; retryAfter?: number } {
  if (e instanceof AiOutputError) {
    if (e.kind === 'refusal') return { status: 422, code: 'ai_refused', message: "The AI couldn't help with this request. Try rephrasing it." };
    return { status: 502, code: 'ai_bad_output', message: 'The AI returned an incomplete answer. Please try again.' };
  }
  if (e instanceof Anthropic.APIUserAbortError) {
    return { status: 504, code: 'ai_timeout', message: 'The AI took too long to respond. Please try again.' };
  }
  if (e instanceof Anthropic.APIError) {
    if (e.status === 429 || e.status === 529 || e.status === 503) {
      return { status: 503, code: 'ai_busy', message: 'The AI service is busy right now. Please try again in a minute.', retryAfter: 60 };
    }
    if (e.status === 404 || e.status === 401 || e.status === 403) {
      // Misconfiguration (unknown model or bad key) — surfaces in /api/health.
      return { status: 503, code: 'ai_unavailable', message: 'AI features are temporarily unavailable.' };
    }
  }
  return { status: 502, code: 'ai_failed', message: 'The AI service could not complete this request. Please try again.' };
}

/** Map a failed Claude call to a typed API error response. */
export function aiFailure(e: unknown, what: string) {
  console.error(`${what} failed:`, e);
  const d = describeAiError(e);
  return apiError(d.status, d.code, d.message, d.retryAfter);
}
