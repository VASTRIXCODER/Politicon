#!/usr/bin/env node
// A small, in-memory stand-in for a Supabase project, for the hermetic
// signed-in journey (tests/e2e/journey-hermetic.spec.ts). Playwright starts
// it next to `next start` (see playwright.config.ts); the app must be BUILT
// with NEXT_PUBLIC_SUPABASE_URL pointing at it, since that value is inlined.
//
// It speaks just enough of three Supabase APIs for the pages and the non-AI
// API routes the journey uses:
//   /auth/v1   GoTrue: sign-up (auto-confirmed), password and refresh-token
//              sign-in, get/update user, sign-out. Access tokens are real
//              HS256 JWTs (auth-js decodes them).
//   /rest/v1   PostgREST: select / insert / upsert / update / delete with
//              eq, neq, gt, gte, lt, lte, is, in and like filters, order,
//              limit, single() / maybeSingle(), and the RPCs the app calls.
//              Row access mimics the RLS policies: a user sees and writes only
//              their own rows, the service-role key sees everything, anon nothing.
//   /__e2e     health check for Playwright.
// Anything else answers 501 and is logged to stderr, so a page that starts
// using a feature the fake lacks fails loudly instead of quietly.
//
// State lives in memory for the life of the process; each test signs up a
// fresh, uniquely named user, so runs don't interfere.
//
// Environment: FAKE_SUPABASE_PORT (default 3201), FAKE_SUPABASE_SERVICE_ROLE_KEY,
// FAKE_SUPABASE_DEBUG=1 to log every request.

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.FAKE_SUPABASE_PORT || 3201);
const HOST = '127.0.0.1';
const SERVICE_ROLE_KEY = process.env.FAKE_SUPABASE_SERVICE_ROLE_KEY || 'e2e-service-role-key';
const DEBUG = process.env.FAKE_SUPABASE_DEBUG === '1';
const JWT_SECRET = 'politicon-e2e-fake-supabase';
const TOKEN_TTL_S = 3600;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** @type {Map<string, { user: Record<string, any>, password: string }>} */
const usersById = new Map();
/** @type {Map<string, string>} email → user id */
const userIdByEmail = new Map();
/** @type {Map<string, string>} refresh token → user id */
const refreshTokens = new Map();
/** @type {Map<string, Record<string, any>[]>} */
const tables = new Map();

/** Column that ties a row to its owner, as the RLS policies do. */
const OWNER_COLUMN = { user_profiles: 'id' };
const ownerColumn = (table) => OWNER_COLUMN[table] ?? 'user_id';

/** Read-only views, computed from tables (supabase/migrations/20261007140000_single_analyses.sql). */
const VIEWS = {
  policy_analyses: () =>
    rows('analyzed_policies').map((r) => ({
      id: r.id,
      user_id: r.user_id,
      policy_id: r.policy_id,
      policy_title: r.policy_title ?? null,
      analysis_text: (r.analysis && typeof r.analysis === 'object' && r.analysis.plainEnglishSummary) || '',
      dollar_impact: r.net_annual_impact ?? null,
      category: r.category ?? null,
      status: r.status ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
};

/** Column defaults the real schema applies on insert. */
const DEFAULTS = {
  user_profiles: { has_completed_onboarding: false, reading_mode: 'expert', onboarding_completed_at: null, financial_updated_at: null },
  analyzed_policies: { generation_status: 'ready', generation_error: null, generation_started_at: null, net_annual_impact: null, net_monthly_impact: null },
};

function rows(table) {
  if (!tables.has(table)) tables.set(table, []);
  return tables.get(table);
}

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const b64url = (input) => Buffer.from(input).toString('base64url');

function sign(payload) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/** The token's claims if it is one of ours and unexpired, else null. */
function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return claims.exp > Date.now() / 1000 ? claims : null;
  } catch {
    return null;
  }
}

function sessionFor(userId) {
  const { user } = usersById.get(userId);
  const iat = Math.floor(Date.now() / 1000);
  const refresh = randomUUID().replace(/-/g, '');
  refreshTokens.set(refresh, userId);
  user.last_sign_in_at = now();
  return {
    access_token: sign({
      sub: userId, email: user.email, role: 'authenticated', aud: 'authenticated', iat, exp: iat + TOKEN_TTL_S,
      session_id: randomUUID(), aal: 'aal1', amr: [{ method: 'password', timestamp: iat }],
      user_metadata: user.user_metadata, app_metadata: user.app_metadata, is_anonymous: false,
    }),
    token_type: 'bearer',
    expires_in: TOKEN_TTL_S,
    expires_at: iat + TOKEN_TTL_S,
    refresh_token: refresh,
    user,
  };
}

/** Who is calling: the service role, a signed-in user, or anon. */
function caller(req) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const claims = verify(bearer);
  if (claims && usersById.has(claims.sub)) return { role: 'user', uid: claims.sub };
  if (bearer === SERVICE_ROLE_KEY || (!bearer && req.headers.apikey === SERVICE_ROLE_KEY)) return { role: 'service' };
  return { role: 'anon' };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
  'access-control-expose-headers': 'content-range, x-supabase-api-version',
  'access-control-max-age': '600',
};

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...CORS,
    ...(payload ? { 'content-type': 'application/json; charset=utf-8' } : {}),
    'x-supabase-api-version': '2024-01-01',
    ...headers,
  });
  res.end(payload);
}

const authError = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });
const restError = (res, status, code, message, details = null) => send(res, status, { code, message, details, hint: null });

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('body too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

function unsupported(res, req, what) {
  console.error(`[fake-supabase] unsupported: ${what} (${req.method} ${req.url})`);
  send(res, 501, { code: 'E2E_UNSUPPORTED', message: `The e2e fake Supabase does not support ${what}`, details: null, hint: null });
}

// ---------------------------------------------------------------------------
// Auth (GoTrue)
// ---------------------------------------------------------------------------

async function auth(req, res, path, url) {
  if (req.method === 'POST' && path === '/signup') {
    const body = (await readBody(req)) || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || password.length < 6) return authError(res, 422, 'validation_failed', 'Email and a password of 6+ characters are required');
    if (userIdByEmail.has(email)) return authError(res, 422, 'user_already_exists', 'User already registered');
    const id = randomUUID();
    const at = now();
    const user = {
      id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: at, phone: '', confirmed_at: at,
      last_sign_in_at: at, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { ...(body.data || {}), email, sub: id },
      identities: [{
        identity_id: randomUUID(), id, user_id: id, identity_data: { email, sub: id, email_verified: true }, provider: 'email',
        last_sign_in_at: at, created_at: at, updated_at: at, email,
      }],
      created_at: at, updated_at: at, is_anonymous: false,
    };
    usersById.set(id, { user, password });
    userIdByEmail.set(email, id);
    // What the handle_new_user trigger does.
    const meta = body.data || {};
    rows('user_profiles').push({
      ...DEFAULTS.user_profiles,
      id, email,
      first_name: typeof meta.first_name === 'string' && meta.first_name.trim() ? meta.first_name.trim().slice(0, 80) : null,
      terms_version: meta.terms_version ?? null,
      terms_accepted_at: meta.terms_version ? at : null,
      ai_processing_consent_at: meta.ai_processing_consent === true || meta.ai_processing_consent === 'true' ? at : null,
      created_at: at, updated_at: at,
    });
    return send(res, 200, sessionFor(id));
  }

  if (req.method === 'POST' && path === '/token') {
    const grant = url.searchParams.get('grant_type');
    const body = (await readBody(req)) || {};
    if (grant === 'password') {
      const id = userIdByEmail.get(String(body.email || '').trim().toLowerCase());
      if (!id || usersById.get(id).password !== body.password) return authError(res, 400, 'invalid_credentials', 'Invalid login credentials');
      return send(res, 200, sessionFor(id));
    }
    if (grant === 'refresh_token') {
      const id = refreshTokens.get(String(body.refresh_token || ''));
      if (!id) return authError(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refreshTokens.delete(body.refresh_token);
      return send(res, 200, sessionFor(id));
    }
    return unsupported(res, req, `grant_type=${grant}`);
  }

  if (path === '/user' && (req.method === 'GET' || req.method === 'PUT')) {
    const who = caller(req);
    if (who.role !== 'user') return authError(res, 403, 'bad_jwt', 'invalid JWT: unable to parse or verify signature');
    const entry = usersById.get(who.uid);
    if (req.method === 'PUT') {
      const body = (await readBody(req)) || {};
      if (body.data) entry.user.user_metadata = { ...entry.user.user_metadata, ...body.data };
      if (body.password) entry.password = String(body.password);
      if (body.email) return unsupported(res, req, 'changing the email');
      entry.user.updated_at = now();
    }
    return send(res, 200, entry.user);
  }

  if (req.method === 'POST' && path === '/logout') {
    return send(res, 204);
  }

  return unsupported(res, req, `auth ${req.method} ${path}`);
}

// ---------------------------------------------------------------------------
// PostgREST
// ---------------------------------------------------------------------------

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

/** PostgREST compares text; booleans and numbers are matched by their text form. */
const text = (v) => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));

function compare(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (a !== null && b !== null && a !== '' && b !== '' && Number.isFinite(x) && Number.isFinite(y)) return x - y;
  return String(a).localeCompare(String(b));
}

/** Parses "op.value" into a predicate on a row's column value. Returns null for an operator we don't support. */
function predicate(expr) {
  const negate = expr.startsWith('not.');
  const body = negate ? expr.slice(4) : expr;
  const dot = body.indexOf('.');
  const op = body.slice(0, dot);
  const value = body.slice(dot + 1);
  let test;
  switch (op) {
    case 'eq': test = (v) => text(v) === value; break;
    case 'neq': test = (v) => text(v) !== value; break;
    case 'gt': test = (v) => v !== null && v !== undefined && compare(text(v), value) > 0; break;
    case 'gte': test = (v) => v !== null && v !== undefined && compare(text(v), value) >= 0; break;
    case 'lt': test = (v) => v !== null && v !== undefined && compare(text(v), value) < 0; break;
    case 'lte': test = (v) => v !== null && v !== undefined && compare(text(v), value) <= 0; break;
    case 'is':
      test = value === 'null' ? (v) => v === null || v === undefined : (v) => text(v) === value;
      break;
    case 'in': {
      const list = value.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
      test = (v) => list.includes(text(v));
      break;
    }
    case 'like':
    case 'ilike': {
      const re = new RegExp(`^${value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*')}$`, op === 'ilike' ? 'i' : '');
      test = (v) => v !== null && v !== undefined && re.test(text(v));
      break;
    }
    default:
      return null;
  }
  return negate ? (v) => !test(v) : test;
}

/** Filters from the query string, as [column, predicate] pairs; throws on anything unsupported. */
function filtersOf(url) {
  const out = [];
  for (const [key, value] of url.searchParams) {
    if (RESERVED.has(key)) continue;
    if (key === 'or' || key === 'and') throw new Error(`the "${key}" filter`);
    const test = predicate(value);
    if (!test) throw new Error(`the filter ${key}=${value}`);
    out.push([key, test]);
  }
  return out;
}

/**
 * "id, title, alias:col, alias:json->key->>text" → [[outputName, path]], where a
 * path is a column followed by JSON steps; "*" (or nothing) → null (all columns).
 */
function columnsOf(select) {
  if (!select || select.trim() === '*') return null;
  return select.split(',').map((part) => {
    const s = part.trim();
    if (s === '*') return ['*', { column: '*', steps: [] }];
    if (/[()]/.test(s)) throw new Error(`embedded resources in select (${s})`);
    const colon = s.search(/:(?!:)/);
    const alias = colon > 0 && s[colon - 1] !== ':' ? s.slice(0, colon).trim() : null;
    const expr = (alias ? s.slice(colon + 1) : s).split('::')[0].trim();
    const [column, ...rest] = expr.split(/(->>?)/);
    const steps = [];
    for (let i = 0; i < rest.length; i += 2) steps.push({ asText: rest[i] === '->>', key: rest[i + 1] });
    return [alias ?? (steps.length ? steps[steps.length - 1].key : column), { column: column.trim(), steps }];
  });
}

function valueAt(row, { column, steps }) {
  let v = row[column] === undefined ? null : row[column];
  for (const { asText, key } of steps) {
    v = v && typeof v === 'object' && key in v ? v[key] : null;
    if (asText && v !== null && typeof v === 'object') v = JSON.stringify(v);
    else if (asText && v !== null) v = String(v);
  }
  return v;
}

function project(row, cols) {
  if (!cols) return { ...row };
  const out = {};
  for (const [name, path] of cols) {
    if (path.column === '*') Object.assign(out, row);
    else out[name] = valueAt(row, path);
  }
  return out;
}

function sortRows(list, order) {
  if (!order) return list;
  const keys = order.split(',').map((part) => {
    const [col, ...mods] = part.trim().split('.');
    return { col, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') };
  });
  return [...list].sort((a, b) => {
    for (const { col, desc, nullsFirst } of keys) {
      const x = a[col] ?? null;
      const y = b[col] ?? null;
      if (x === y) continue;
      if (x === null || y === null) return (x === null) === nullsFirst ? -1 : 1;
      const c = compare(text(x), text(y));
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  });
}

/** Rows this caller may see (the RLS "using" clause). */
function visible(table, who, list) {
  if (who.role === 'service') return list;
  if (who.role === 'anon') return [];
  const col = ownerColumn(table);
  return list.filter((r) => r[col] === who.uid);
}

function prefers(req, token) {
  return (req.headers.prefer || '').split(',').some((p) => p.trim() === token);
}

function respondRows(req, res, status, list, { count } = {}) {
  const single = (req.headers.accept || '').includes('application/vnd.pgrst.object+json');
  const headers = {};
  if (count !== undefined) headers['content-range'] = `${list.length ? `0-${list.length - 1}` : '*'}/${count}`;
  if (single) {
    if (list.length !== 1) {
      return send(res, 406, {
        code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned',
        details: `The result contains ${list.length} rows`, hint: null,
      });
    }
    return send(res, status, list[0], headers);
  }
  if (req.method === 'HEAD') return send(res, status, undefined, headers);
  return send(res, status, list, headers);
}

function rpc(name, who, args) {
  switch (name) {
    case 'check_rate_limit':
      // Never limits: the journey isn't testing the limiter.
      return [{ allowed: true, reset_at: new Date(Date.now() + Number(args.p_window_seconds || 3600) * 1000).toISOString() }];
    case 'analysis_totals': {
      const mine = who.role === 'user' ? rows('analyzed_policies').filter((r) => r.user_id === who.uid) : [];
      const sum = (list) => list.reduce((s, r) => s + (Number(r.net_annual_impact) || 0), 0);
      return [{
        analysis_count: mine.length,
        net_annual: sum(mine),
        enacted_annual: sum(mine.filter((r) => r.status === 'enacted')),
        pending_annual: sum(mine.filter((r) => r.status !== 'enacted')),
      }];
    }
    default:
      return undefined;
  }
}

async function rest(req, res, path, url) {
  const who = caller(req);

  const fn = path.match(/^\/rpc\/([a-z_][a-z0-9_]*)$/i);
  if (fn) {
    const args = (req.method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams)) || {};
    const result = rpc(fn[1], who, args);
    if (result === undefined) {
      console.error(`[fake-supabase] unknown RPC ${fn[1]}`);
      return restError(res, 404, 'PGRST202', `Could not find the function public.${fn[1]} without parameters in the schema cache`);
    }
    return respondRows(req, res, 200, result);
  }

  const m = path.match(/^\/([a-z_][a-z0-9_]*)$/i);
  if (!m) return unsupported(res, req, `REST path ${path}`);
  const table = m[1];
  const isView = Object.prototype.hasOwnProperty.call(VIEWS, table);

  let filters;
  let cols;
  try {
    filters = filtersOf(url);
    cols = columnsOf(url.searchParams.get('select'));
  } catch (e) {
    return unsupported(res, req, e.message);
  }
  const matchesFilters = (row) => filters.every(([col, test]) => test(row[col] ?? null));
  const source = isView ? VIEWS[table]() : rows(table);

  if (req.method === 'GET' || req.method === 'HEAD') {
    let list = visible(table, who, source).filter(matchesFilters);
    const count = list.length;
    list = sortRows(list, url.searchParams.get('order'));
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
    list = list.slice(offset, limit === undefined ? undefined : offset + limit);
    const wantCount = /count=(exact|planned|estimated)/.test(req.headers.prefer || '');
    return respondRows(req, res, 200, list.map((r) => project(r, cols)), wantCount ? { count } : {});
  }

  if (isView) return restError(res, 405, '42809', `cannot change rows of the view "${table}"`);
  if (who.role === 'anon') return restError(res, 401, '42501', `permission denied for table ${table}`);
  const owner = ownerColumn(table);
  const returning = prefers(req, 'return=representation');

  if (req.method === 'POST') {
    const body = await readBody(req);
    const incoming = Array.isArray(body) ? body : [body];
    const upsert = prefers(req, 'resolution=merge-duplicates') || prefers(req, 'resolution=ignore-duplicates');
    const conflict = (url.searchParams.get('on_conflict') || 'id').split(',').map((s) => s.trim());
    const out = [];
    for (const raw of incoming) {
      if (!raw || typeof raw !== 'object') return restError(res, 400, 'PGRST102', 'Invalid body');
      if (who.role === 'user' && raw[owner] !== who.uid) {
        return restError(res, 403, '42501', `new row violates row-level security policy for table "${table}"`);
      }
      const existing = upsert ? rows(table).find((r) => conflict.every((c) => text(r[c]) === text(raw[c]))) : undefined;
      if (existing) {
        if (prefers(req, 'resolution=merge-duplicates')) Object.assign(existing, raw, { updated_at: raw.updated_at ?? now() });
        out.push(existing);
        continue;
      }
      if (!upsert && raw.id !== undefined && rows(table).some((r) => text(r.id) === text(raw.id))) {
        return restError(res, 409, '23505', `duplicate key value violates unique constraint "${table}_pkey"`);
      }
      const at = now();
      const row = { ...(DEFAULTS[table] || {}), id: randomUUID(), created_at: at, updated_at: at, ...raw };
      rows(table).push(row);
      out.push(row);
    }
    if (!returning) return send(res, 201);
    return respondRows(req, res, 201, out.map((r) => project(r, cols)));
  }

  if (req.method === 'PATCH') {
    const patch = (await readBody(req)) || {};
    if (who.role === 'user' && owner in patch && patch[owner] !== who.uid) {
      return restError(res, 403, '42501', `new row violates row-level security policy for table "${table}"`);
    }
    const hit = visible(table, who, rows(table)).filter(matchesFilters);
    for (const row of hit) Object.assign(row, patch, 'updated_at' in patch ? {} : { updated_at: now() });
    if (!returning) return send(res, 204);
    return respondRows(req, res, 200, hit.map((r) => project(r, cols)));
  }

  if (req.method === 'DELETE') {
    const hit = new Set(visible(table, who, rows(table)).filter(matchesFilters));
    tables.set(table, rows(table).filter((r) => !hit.has(r)));
    if (!returning) return send(res, 204);
    return respondRows(req, res, 200, [...hit].map((r) => project(r, cols)));
  }

  return unsupported(res, req, `REST ${req.method}`);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  if (DEBUG) console.log(`[fake-supabase] ${req.method} ${url.pathname}${url.search}`);
  try {
    if (req.method === 'OPTIONS') {
      return send(res, 204, undefined, {
        'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
      });
    }
    if (url.pathname === '/__e2e/health') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url.pathname.slice('/auth/v1'.length), url);
    if (url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url.pathname.slice('/rest/v1'.length), url);
    return unsupported(res, req, url.pathname);
  } catch (e) {
    console.error('[fake-supabase] error:', e);
    if (!res.headersSent) send(res, 500, { code: 'E2E_FAKE_ERROR', message: String(e?.message || e), details: null, hint: null });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[fake-supabase] listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
