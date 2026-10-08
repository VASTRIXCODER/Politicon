import 'server-only';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

/** Standard error body for every API route: { error: { code, message, retryAfter? } }. */
export function apiError(status: number, code: string, message: string, retryAfter?: number) {
  return NextResponse.json(
    { error: { code, message, ...(retryAfter ? { retryAfter } : {}) } },
    { status, headers: retryAfter ? { 'Retry-After': String(retryAfter) } : undefined },
  );
}

const DEFAULT_MAX_BODY_BYTES = 32 * 1024;

/**
 * Abort signal for an AI call made inside a request: fires if the client goes
 * away or shortly before the function's time limit, so the call is always
 * finalized (and its usage recorded) rather than killed mid-flight.
 */
export function requestDeadline(req: Request, ms = 50_000): AbortSignal {
  return AbortSignal.any([req.signal, AbortSignal.timeout(ms)]);
}

/**
 * Read and validate a JSON request body. Rejects non-JSON content types,
 * oversized bodies (32 KB unless overridden) and anything that fails the schema.
 */
export async function readJson<T>(
  req: Request,
  schema: ZodType<T>,
  opts: { maxBytes?: number } = {},
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const MAX_BODY_BYTES = opts.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  const type = req.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    return { ok: false, response: apiError(415, 'unsupported_media_type', 'Expected a JSON body.') };
  }
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, 'payload_too_large', 'Request body is too large.') };
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, 'payload_too_large', 'Request body is too large.') };
  }
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, response: apiError(400, 'invalid_json', 'Request body is not valid JSON.') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: apiError(400, 'invalid_request', 'Request body failed validation.') };
  }
  return { ok: true, data: parsed.data };
}
