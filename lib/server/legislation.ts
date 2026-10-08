import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalPolicyId } from '@/lib/policyId';

/**
 * Official legislative records — the source of truth for which policies exist,
 * what they're called, and where they stand. The AI only chooses among these
 * and explains them; it never supplies titles, bill numbers, status or dates.
 *
 *  - Federal: Congress.gov API v3 (api.data.gov key in CONGRESS_API_KEY; the
 *    public DEMO_KEY is used without one, at a much lower rate limit).
 *  - States: Open States API v3 (key in OPENSTATES_API_KEY; skipped without one).
 *
 * Lists are cached across users in legislation_cache.
 */

export type RecordStatus = 'proposed' | 'passed' | 'enacted' | 'repealed' | 'rejected';

export interface LegislationItem {
  /** Canonical policy id (matches analyses and the feed). */
  id: string;
  source: 'congress.gov' | 'openstates';
  region: string; // "Federal" or a state name
  billNumber: string; // display form, e.g. "H.R. 1", "SB 1047"
  title: string;
  status: RecordStatus;
  latestActionDate: string | null;
  latestActionText: string | null;
  /** Public page for the bill. */
  sourceUrl: string;
  /** Congress.gov coordinates, used to fetch the official summary. */
  congress?: number;
  billType?: string;
  number?: string;
  /** Short official description where the source provides one (Open States abstracts). */
  abstract?: string;
}

const CONGRESS_API = 'https://api.congress.gov/v3';
const OPENSTATES_API = 'https://v3.openstates.org';
const LIST_TTL_MS = 6 * 60 * 60 * 1000;
const SUMMARY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const FEDERAL_LOOKBACK_DAYS = 120;

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** The Congress in session on a date (the 119th runs Jan 2025 – Jan 2027). */
export function currentCongress(date = new Date()): number {
  const year = date.getUTCFullYear();
  // A new Congress starts on January 3 of odd years.
  const startedThisYear = year % 2 === 1 && (date.getUTCMonth() > 0 || date.getUTCDate() >= 3);
  const effectiveYear = year % 2 === 1 && !startedThisYear ? year - 1 : year;
  return Math.floor((effectiveYear - 1789) / 2) + 1;
}

const BILL_TYPES: Record<string, { display: string; slug: string }> = {
  HR: { display: 'H.R.', slug: 'house-bill' },
  S: { display: 'S.', slug: 'senate-bill' },
  HJRES: { display: 'H.J.Res.', slug: 'house-joint-resolution' },
  SJRES: { display: 'S.J.Res.', slug: 'senate-joint-resolution' },
  HCONRES: { display: 'H.Con.Res.', slug: 'house-concurrent-resolution' },
  SCONRES: { display: 'S.Con.Res.', slug: 'senate-concurrent-resolution' },
  HRES: { display: 'H.Res.', slug: 'house-resolution' },
  SRES: { display: 'S.Res.', slug: 'senate-resolution' },
};

/** Bills and joint resolutions can change the law; simple/concurrent resolutions can't. */
const LAWMAKING_TYPES = new Set(['HR', 'S', 'HJRES', 'SJRES']);

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function congressBillUrl(congress: number, type: string, number: string): string {
  const t = BILL_TYPES[type.toUpperCase()];
  return `https://www.congress.gov/bill/${ordinal(congress)}-congress/${t ? t.slug : 'house-bill'}/${number}`;
}

export function displayBillNumber(type: string, number: string): string {
  const t = BILL_TYPES[type.toUpperCase()];
  return `${t ? t.display : type.toUpperCase()} ${number}`;
}

/** Status from the text of a bill's latest action (federal or state wording). */
export function statusFromAction(text: string | null | undefined): RecordStatus {
  const t = (text || '').toLowerCase();
  if (/became (public|private) law|signed by (the )?(president|governor)|chaptered|enacted|public law no/.test(t)) return 'enacted';
  if (/veto(ed)? (message|by)|vetoed|failed (of )?passage|failed to pass|died|withdrawn|indefinitely postponed/.test(t)) return 'rejected';
  if (/repeal/.test(t)) return 'repealed';
  if (/passed|agreed to|presented to (the )?(president|governor)|enrolled|concurred/.test(t)) return 'passed';
  return 'proposed';
}

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Parse a Congress.gov `bills` list (bill or law endpoint). Unknown shapes yield []. */
export function parseCongressBills(json: unknown, opts: { enacted?: boolean } = {}): LegislationItem[] {
  const bills = (json as { bills?: unknown })?.bills;
  if (!Array.isArray(bills)) return [];
  const out: LegislationItem[] = [];
  for (const raw of bills) {
    const b = (raw || {}) as Record<string, unknown>;
    const type = str(b.type).toUpperCase();
    const number = str(b.number).replace(/^0+/, '');
    const congress = Number(b.congress);
    const title = str(b.title).trim();
    if (!LAWMAKING_TYPES.has(type) || !number || !Number.isFinite(congress) || !title) continue;
    const action = (b.latestAction || {}) as Record<string, unknown>;
    const actionText = str(action.text) || null;
    const billNumber = displayBillNumber(type, number);
    out.push({
      id: canonicalPolicyId({ billNumber, region: 'Federal', title }),
      source: 'congress.gov',
      region: 'Federal',
      billNumber,
      title,
      status: opts.enacted ? 'enacted' : statusFromAction(actionText),
      latestActionDate: str(action.actionDate) || null,
      latestActionText: actionText,
      sourceUrl: congressBillUrl(congress, type, number),
      congress,
      billType: type.toLowerCase(),
      number,
    });
  }
  return out;
}

/** Parse an Open States `/bills` search response. Unknown shapes yield []. */
export function parseOpenStatesBills(json: unknown, stateName: string): LegislationItem[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const out: LegislationItem[] = [];
  for (const raw of results) {
    const b = (raw || {}) as Record<string, unknown>;
    const identifier = str(b.identifier).trim();
    const title = str(b.title).trim();
    if (!identifier || !title) continue;
    const classification = Array.isArray(b.classification) ? b.classification.map(str) : [];
    // Only bills can change the law (skip resolutions, memorials, etc.).
    if (classification.length && !classification.includes('bill')) continue;
    const actionText = str(b.latest_action_description) || null;
    const abstracts = Array.isArray(b.abstracts) ? b.abstracts : [];
    const abstract = str((abstracts[0] as Record<string, unknown> | undefined)?.abstract).trim();
    out.push({
      id: canonicalPolicyId({ billNumber: identifier, region: stateName, title }),
      source: 'openstates',
      region: stateName,
      billNumber: identifier,
      title,
      status: statusFromAction(actionText),
      latestActionDate: str(b.latest_action_date).slice(0, 10) || null,
      latestActionText: actionText,
      sourceUrl: str(b.openstates_url) || 'https://openstates.org',
      ...(abstract ? { abstract: abstract.slice(0, 1500) } : {}),
    });
  }
  return out;
}

/** Plain text from Congress.gov's HTML summary. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The most recent summary text from a Congress.gov `summaries` response. */
export function latestCongressSummary(json: unknown): string | null {
  const summaries = (json as { summaries?: unknown })?.summaries;
  if (!Array.isArray(summaries) || summaries.length === 0) return null;
  const sorted = [...summaries].sort((a, b) =>
    str((b as Record<string, unknown>).updateDate || (b as Record<string, unknown>).actionDate)
      .localeCompare(str((a as Record<string, unknown>).updateDate || (a as Record<string, unknown>).actionDate)),
  );
  const text = stripHtml(str((sorted[0] as Record<string, unknown>).text));
  return text ? text.slice(0, 4000) : null;
}

// ---------------------------------------------------------------------------
// Fetching with a shared cache
// ---------------------------------------------------------------------------

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const admin = createAdminClient();
  const { data } = await admin.from('legislation_cache').select('items, fetched_at').eq('key', key).maybeSingle();
  if (data && Date.now() - new Date(data.fetched_at).getTime() < ttlMs) return data.items as T;
  try {
    const items = await load();
    await admin.from('legislation_cache').upsert({ key, items, fetched_at: new Date().toISOString() }, { onConflict: 'key' });
    return items;
  } catch (e) {
    // Serve an expired copy rather than nothing if the source is down.
    if (data) {
      console.error(`Legislation refresh failed for ${key}; using cached copy:`, e);
      return data.items as T;
    }
    throw e;
  }
}

function congressKey(): string {
  return process.env.CONGRESS_API_KEY || 'DEMO_KEY';
}

/** Recently active federal bills plus laws enacted this Congress. */
export async function federalCandidates(): Promise<LegislationItem[]> {
  return cached('federal', LIST_TTL_MS, async () => {
    const congress = currentCongress();
    const since = new Date(Date.now() - FEDERAL_LOOKBACK_DAYS * 86400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const key = encodeURIComponent(congressKey());
    const [active, laws] = await Promise.all([
      getJson(`${CONGRESS_API}/bill/${congress}?format=json&limit=250&sort=updateDate+desc&fromDateTime=${since}&api_key=${key}`),
      getJson(`${CONGRESS_API}/law/${congress}?format=json&limit=250&api_key=${key}`).catch(() => ({ bills: [] })),
    ]);
    const byId = new Map<string, LegislationItem>();
    for (const item of [...parseCongressBills(laws, { enacted: true }), ...parseCongressBills(active)]) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
    const items = Array.from(byId.values());
    if (items.length === 0) throw new Error('Congress.gov returned no bills');
    return items;
  });
}

/** Recently active bills in one state (requires OPENSTATES_API_KEY). */
export async function stateCandidates(stateName: string): Promise<LegislationItem[]> {
  const key = process.env.OPENSTATES_API_KEY;
  if (!key || !stateName || stateName === 'District of Columbia') return [];
  return cached(`state:${stateName}`, LIST_TTL_MS, async () => {
    const pages = await Promise.all([1, 2, 3].map((page) =>
      getJson(
        `${OPENSTATES_API}/bills?jurisdiction=${encodeURIComponent(stateName)}&sort=latest_action_desc&include=abstracts&per_page=20&page=${page}`,
        { 'X-API-KEY': key },
      ).catch(() => ({ results: [] })),
    ));
    const byId = new Map<string, LegislationItem>();
    for (const item of pages.flatMap((p) => parseOpenStatesBills(p, stateName))) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
    return Array.from(byId.values());
  });
}

/**
 * Candidate policies for a user: federal plus their state. Each source fails
 * independently; returns [] only if every source is unavailable.
 */
export async function candidatesFor(stateName: string): Promise<LegislationItem[]> {
  const [federal, state] = await Promise.all([
    federalCandidates().catch((e) => { console.error('Federal legislation unavailable:', e); return []; }),
    stateCandidates(stateName).catch((e) => { console.error(`State legislation unavailable (${stateName}):`, e); return []; }),
  ]);
  return [...state, ...federal];
}

/** The official summary for a bill, when one exists. Never throws. */
export async function officialSummary(record: {
  source?: string; congress?: number; billType?: string; number?: string; abstract?: string; id: string;
}): Promise<string | null> {
  if (record.source === 'openstates') return record.abstract || null;
  if (record.source !== 'congress.gov' || !record.congress || !record.billType || !record.number) return null;
  try {
    return await cached(`summary:${record.id}:${record.congress}`, SUMMARY_TTL_MS, async () => {
      const json = await getJson(
        `${CONGRESS_API}/bill/${record.congress}/${record.billType}/${record.number}/summaries?format=json&api_key=${encodeURIComponent(congressKey())}`,
      );
      return latestCongressSummary(json);
    });
  } catch (e) {
    console.error(`Official summary unavailable for ${record.id}:`, e);
    return null;
  }
}

/** Lightweight reachability check for /api/health. */
export async function legislationHealth(): Promise<{ ok: boolean; detail?: string }> {
  try {
    await getJson(`${CONGRESS_API}/bill?format=json&limit=1&api_key=${encodeURIComponent(congressKey())}`);
    return process.env.CONGRESS_API_KEY ? { ok: true } : { ok: true, detail: 'using DEMO_KEY (rate-limited); set CONGRESS_API_KEY' };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
