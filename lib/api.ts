/** Client-side helper for the app's JSON API and its { error: { code, message } } contract. */

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

const FALLBACK: Record<number, string> = {
  401: 'Please sign in to continue.',
  409: 'Finish setting up your profile first.',
  429: 'Too many requests. Please try again shortly.',
  503: 'This feature is temporarily unavailable. Please try again shortly.',
};

export async function apiFetch<T>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method || (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      signal: init.signal,
    });
  } catch {
    return { ok: false, status: 0, code: 'network', message: 'Could not reach the server. Check your connection and try again.' };
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch { /* empty or non-JSON body */ }

  if (res.ok) return { ok: true, status: res.status, data: data as T };

  const err = (data as { error?: { code?: string; message?: string; retryAfter?: number } | string } | null)?.error;
  const code = typeof err === 'object' && err?.code ? err.code : `http_${res.status}`;
  const message =
    (typeof err === 'object' && err?.message) ||
    (typeof err === 'string' && err) ||
    FALLBACK[res.status] ||
    'Something went wrong. Please try again.';
  const retryAfter = typeof err === 'object' && err?.retryAfter ? err.retryAfter : Number(res.headers.get('Retry-After')) || undefined;
  return { ok: false, status: res.status, code, message, retryAfter };
}
