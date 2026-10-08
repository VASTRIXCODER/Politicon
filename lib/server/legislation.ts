import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentCongress, federalBillId, stateBillId } from '@/lib/policyId';

export { currentCongress };

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
  /** Open States legislative session (part of a state record's id). */
  session?: string;
  /** Short official description where the source provides one (Open States abstracts). */
  abstract?: string;
}

const CONGRESS_API = 'https://api.congress.gov/v3';
const OPENSTATES_API = 'https://v3.openstates.org';
const LIST_TTL_MS = 6 * 60 * 60 * 1000;
const SUMMARY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A bill without a summary yet is checked again sooner (CRS summaries lag introduction). */
const NO_SUMMARY_TTL_MS = 6 * 60 * 60 * 1000;
/** An incomplete list (used when there's no recent complete copy) is retried after this. */
const PARTIAL_TTL_MS = 30 * 60 * 1000;
/** An expired copy older than this gives way to a fresh but incomplete list. */
const MAX_STALE_OVER_PARTIAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const FEDERAL_LOOKBACK_DAYS = 120;

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** True in the first six months of a Congress, when the previous Congress's laws are still news. */
export function earlyInCongress(date = new Date()): boolean {
  const startYear = 1789 + 2 * (currentCongress(date) - 1);
  return date.getTime() < Date.UTC(startYear, 6, 3);
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
  const t = (text || '')
    .toLowerCase()
    // A failed motion or amendment doesn't decide the bill ("Motion to discharge ... not agreed to").
    .replace(/(motion to (discharge|reconsider|table|recommit|proceed)|amendment)[^.;]*?(not agreed to|failed(?! (of )?passage| to pass)|not passed)/g, ' ');
  if (
    /became (public |private )?law|signed by (the )?(president|governor)|approved by (the )?governor|chaptered|chapter (no\.|number)?\s*\d|signed chap|public act|\bact no\.|enacted|public law no/.test(t)
  ) return 'enacted';
  // Negative outcomes before "passed", so "not agreed to" never reads as agreed to.
  // ("Withdrawn from <committee>" is a re-referral, not a withdrawal of the bill.)
  if (/not agreed to|\bfailed\b|not passed|veto(ed)? (message|by)|vetoed|withdrawn from further consideration|\bdied (in|on|at|pursuant)\b|indefinitely postponed/.test(t)) return 'rejected';
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
    if (!LAWMAKING_TYPES.has(type) || !/^\d{1,6}$/.test(number) || !Number.isInteger(congress) || congress < 1 || !title) continue;
    const action = (b.latestAction || {}) as Record<string, unknown>;
    const actionText = str(action.text) || null;
    const billNumber = displayBillNumber(type, number);
    out.push({
      id: federalBillId(congress, type, number),
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
    const session = str(b.session).trim();
    const id = identifier && stateBillId(stateName, session, identifier);
    if (!id || !title) continue;
    const classification = Array.isArray(b.classification) ? b.classification.map(str) : [];
    // Only bills can change the law (skip resolutions, memorials, etc.).
    if (classification.length && !classification.includes('bill')) continue;
    const actionText = str(b.latest_action_description) || null;
    const abstracts = Array.isArray(b.abstracts) ? b.abstracts : [];
    const abstract = str((abstracts[0] as Record<string, unknown> | undefined)?.abstract).trim();
    const url = str(b.openstates_url);
    out.push({
      id,
      source: 'openstates',
      region: stateName,
      billNumber: identifier,
      title,
      status: statusFromAction(actionText),
      latestActionDate: str(b.latest_action_date).slice(0, 10) || null,
      latestActionText: actionText,
      sourceUrl: /^https:\/\/\S+$/.test(url) ? url : 'https://openstates.org',
      ...(session ? { session } : {}),
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
  const host = new URL(url).host;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    // Never pass on the original error: some include the URL, which carries the API key.
    const err = e as { name?: string; cause?: { code?: string } };
    throw new Error(`${host} request failed (${[err.name, err.cause?.code].filter(Boolean).join(': ') || 'network error'})`);
  }
  if (!res.ok) throw new Error(`${host} responded ${res.status}`);
  return res.json();
}

/**
 * Thrown by a loader that got only part of its data. cached() serves an older
 * copy instead when there is a recent enough one.
 */
class PartialLoad<T> extends Error {
  readonly items: T;
  constructor(items: T, reason: string) {
    super(reason);
    this.items = items;
  }
}

/** Refreshes in progress in this process, so concurrent callers share one fetch. */
const refreshing = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttl: number | ((_items: T) => number), load: () => Promise<T>): Promise<T> {
  const ttlFor = (items: T) => (typeof ttl === 'function' ? ttl(items) : ttl);
  const admin = createAdminClient();
  const { data } = await admin.from('legislation_cache').select('items, fetched_at').eq('key', key).maybeSingle();
  if (data && Date.now() - new Date(data.fetched_at).getTime() < ttlFor(data.items as T)) return data.items as T;

  const running = refreshing.get(key) as Promise<T> | undefined;
  if (running) return running;
  const refresh = (async () => {
    const store = (items: T, fetchedAt: number) =>
      admin.from('legislation_cache').upsert({ key, items, fetched_at: new Date(fetchedAt).toISOString() }, { onConflict: 'key' });
    try {
      const items = await load();
      await store(items, Date.now());
      return items;
    } catch (e) {
      const partial = e instanceof PartialLoad ? (e as PartialLoad<T>) : null;
      // Serve an expired copy rather than nothing if the source is down, and
      // rather than a partial list unless the copy is very old.
      if (data && (!partial || Date.now() - new Date(data.fetched_at).getTime() < MAX_STALE_OVER_PARTIAL_MS)) {
        console.error(`Legislation refresh failed for ${key}; using cached copy:`, e);
        return data.items as T;
      }
      if (!partial) throw e;
      // Use what loaded, stored so that it expires in PARTIAL_TTL_MS.
      console.error(`Legislation refresh for ${key} was incomplete:`, partial.message);
      await store(partial.items, Date.now() - Math.max(0, ttlFor(partial.items) - PARTIAL_TTL_MS));
      return partial.items;
    }
  })().finally(() => refreshing.delete(key));
  refreshing.set(key, refresh);
  return refresh;
}

function congressKey(): string {
  return process.env.CONGRESS_API_KEY || 'DEMO_KEY';
}

/** Fulfilled values, and the reasons for the rest. */
function settled<T>(results: PromiseSettledResult<T>[]): { values: T[]; errors: string[] } {
  return {
    values: results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
    errors: results.flatMap((r) => (r.status === 'rejected' ? [(r.reason as Error)?.message || String(r.reason)] : [])),
  };
}

/** Recently active federal bills, plus laws enacted this Congress (and the last one, early in a Congress). */
export async function federalCandidates(): Promise<LegislationItem[]> {
  return cached('federal', LIST_TTL_MS, async () => {
    const now = new Date();
    const congress = currentCongress(now);
    const since = new Date(now.getTime() - FEDERAL_LOOKBACK_DAYS * 86400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const key = encodeURIComponent(congressKey());
    const lawCongresses = earlyInCongress(now) ? [congress, congress - 1] : [congress];
    // Bills and resolutions share one list; asking per bill type keeps resolutions from using up the limit.
    const [laws, bills] = await Promise.all([
      Promise.allSettled(lawCongresses.map((c) => getJson(`${CONGRESS_API}/law/${c}?format=json&limit=250&api_key=${key}`))),
      Promise.allSettled(['hr', 's'].map((type) =>
        getJson(`${CONGRESS_API}/bill/${congress}/${type}?format=json&limit=250&sort=updateDate+desc&fromDateTime=${since}&api_key=${key}`),
      )),
    ]);
    const lawResults = settled(laws);
    const billResults = settled(bills);
    const errors = [...lawResults.errors, ...billResults.errors];
    if (lawResults.values.length + billResults.values.length === 0) throw new Error(`Congress.gov unavailable: ${errors.join('; ')}`);

    const byId = new Map<string, LegislationItem>();
    const parsed = [
      ...lawResults.values.flatMap((json) => parseCongressBills(json, { enacted: true })),
      ...billResults.values.flatMap((json) => parseCongressBills(json)),
    ];
    for (const item of parsed) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
    const items = Array.from(byId.values());
    if (items.length === 0) throw new Error('Congress.gov returned no bills');
    if (errors.length) throw new PartialLoad(items, `Congress.gov: ${errors.length} request(s) failed: ${errors.join('; ')}`);
    return items;
  });
}

/** Recently active bills in one state (requires OPENSTATES_API_KEY). */
export async function stateCandidates(stateName: string): Promise<LegislationItem[]> {
  const key = process.env.OPENSTATES_API_KEY;
  if (!key || !stateName || stateName === 'District of Columbia') return [];
  return cached(`state:${stateName}`, LIST_TTL_MS, async () => {
    // One page at a time (Open States rate-limits bursts), stopping at the last page or the first failure.
    const pages: unknown[] = [];
    let failure: Error | null = null;
    for (let page = 1; page <= 3; page++) {
      try {
        const json = await getJson(
          `${OPENSTATES_API}/bills?jurisdiction=${encodeURIComponent(stateName)}&sort=latest_action_desc&include=abstracts&per_page=20&page=${page}`,
          { 'X-API-KEY': key },
        );
        pages.push(json);
        if (Number((json as { pagination?: { max_page?: unknown } })?.pagination?.max_page) <= page) break;
      } catch (e) {
        failure = e as Error;
        break;
      }
    }
    if (failure && pages.length === 0) throw new Error(`Open States unavailable for ${stateName}: ${failure.message}`);
    const byId = new Map<string, LegislationItem>();
    for (const item of pages.flatMap((p) => parseOpenStatesBills(p, stateName))) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
    const items = Array.from(byId.values());
    if (failure) throw new PartialLoad(items, `Open States page ${pages.length + 1} failed for ${stateName}: ${failure.message}`);
    return items;
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
  const { congress, number } = record;
  const billType = record.billType.toLowerCase();
  // The coordinates come from stored JSON; only well-formed ones go into the URL and the shared cache key.
  if (!Number.isInteger(congress) || !/^[a-z]{1,7}$/.test(billType) || !/^\d{1,6}$/.test(number)) return null;
  try {
    // Keyed by the bill itself (not the user's policy id), so every user gets the same bill's summary.
    return await cached<string | null>(
      `summary:${congress}-${billType}-${number}`,
      (summary) => (summary === null ? NO_SUMMARY_TTL_MS : SUMMARY_TTL_MS),
      async () => {
        const json = await getJson(
          `${CONGRESS_API}/bill/${congress}/${billType}/${number}/summaries?format=json&api_key=${encodeURIComponent(congressKey())}`,
        );
        return latestCongressSummary(json);
      },
    );
  } catch (e) {
    console.error(`Official summary unavailable for ${record.id}:`, e);
    return null;
  }
}

/** Reachability check for /api/health. */
export async function legislationHealth(): Promise<{ ok: boolean; detail?: string }> {
  if (!process.env.CONGRESS_API_KEY && process.env.NODE_ENV === 'production') {
    return { ok: false, detail: 'CONGRESS_API_KEY not set (DEMO_KEY is rate-limited)' };
  }
  const healthy = process.env.CONGRESS_API_KEY ? { ok: true } : { ok: true, detail: 'using DEMO_KEY (rate-limited); set CONGRESS_API_KEY' };
  try {
    // A fresh federal list shows the source works; don't spend a rate-limited request re-checking it.
    const { data } = await createAdminClient().from('legislation_cache').select('fetched_at').eq('key', 'federal').maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < LIST_TTL_MS) return healthy;
  } catch {
    // No cache to consult; probe instead.
  }
  try {
    await getJson(`${CONGRESS_API}/bill?format=json&limit=1&api_key=${encodeURIComponent(congressKey())}`);
    return healthy;
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

/** Open States check for /api/health: the key is set and accepted. */
export async function stateLegislationHealth(): Promise<{ ok: boolean; detail?: string }> {
  const key = process.env.OPENSTATES_API_KEY;
  if (!key) return { ok: true, detail: 'OPENSTATES_API_KEY not set; state bills are skipped' };
  try {
    // A fresh state list shows the key works; don't spend a rate-limited request re-checking it.
    const since = new Date(Date.now() - LIST_TTL_MS).toISOString();
    const { data } = await createAdminClient().from('legislation_cache').select('key').like('key', 'state:%').gt('fetched_at', since).limit(1);
    if (data?.length) return { ok: true };
  } catch {
    // No cache to consult; probe instead.
  }
  try {
    await getJson(`${OPENSTATES_API}/jurisdictions?classification=state&per_page=1`, { 'X-API-KEY': key });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
