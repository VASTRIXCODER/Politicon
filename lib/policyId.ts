/**
 * Stable policy ids. The same bill must get the same id every time the feed is
 * rebuilt, or analyses get duplicated. Official records carry the Congress or
 * state session, since bill numbers restart with each one ("us-119-hr-1",
 * "california-20252026-sb-1047"). Other policies use the jurisdiction and bill
 * number when there is one ("us-hr-1"), otherwise the normalized title.
 * Always matches ^[a-z0-9][a-z0-9-]{0,79}$.
 */

const BILL_TYPES: [RegExp, string][] = [
  [/^h\.?\s*j\.?\s*res\.?/i, 'hjres'],
  [/^s\.?\s*j\.?\s*res\.?/i, 'sjres'],
  [/^h\.?\s*con\.?\s*res\.?/i, 'hconres'],
  [/^s\.?\s*con\.?\s*res\.?/i, 'sconres'],
  [/^h\.?\s*res\.?/i, 'hres'],
  [/^s\.?\s*res\.?/i, 'sres'],
  [/^h\.?\s*r\.?/i, 'hr'],
  [/^(a\.?\s*b\.?|assembly\s+bill)/i, 'ab'],
  [/^(s\.?\s*b\.?|senate\s+bill)/i, 'sb'],
  [/^(h\.?\s*b\.?|house\s+bill)/i, 'hb'],
  [/^s\.?(?=\s*\d)/i, 's'],
];

export function slugify(s: string, max = 80): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/** "H.R. 1" → "hr-1"; returns null when the text isn't a recognizable bill number. */
export function normalizeBillNumber(bill: string | null | undefined): string | null {
  const text = (bill || '').trim();
  if (!text) return null;
  for (const [pattern, code] of BILL_TYPES) {
    const m = text.match(pattern);
    if (!m) continue;
    const num = text.slice(m[0].length).match(/^\s*(\d{1,6})\b/);
    if (num) return `${code}-${Number(num[1])}`;
  }
  return null;
}

function jurisdiction(region: string | null | undefined): string {
  const r = (region || '').trim();
  if (!r || /^(federal|us|u\.s\.|united states|national)$/i.test(r)) return 'us';
  return slugify(r, 30) || 'us';
}

export function canonicalPolicyId(p: { billNumber?: string | null; region?: string | null; title: string }): string {
  const bill = normalizeBillNumber(p.billNumber);
  const id = bill ? `${jurisdiction(p.region)}-${bill}` : slugify(p.title);
  return id || 'policy';
}

/** Id of a Congress.gov record: "us-119-hr-1". */
export function federalBillId(congress: number, billType: string, number: string): string {
  return `us-${congress}-${billType.toLowerCase()}-${number}`;
}

/**
 * Id of an Open States record: state, session and identifier
 * ("california-20252026-sb-1047"). Null when the identifier has no usable characters.
 */
export function stateBillId(stateName: string, session: string | null | undefined, identifier: string): string | null {
  const bill = slugify(identifier, 28);
  if (!bill) return null;
  // 30 + 20 + 28 plus two hyphens stays within 80 characters.
  return [jurisdiction(stateName), slugify(session || '', 20), bill].filter(Boolean).join('-');
}

/** The Congress in session on a date (the 119th runs Jan 2025 – Jan 2027). */
export function currentCongress(date = new Date()): number {
  const year = date.getUTCFullYear();
  // A new Congress starts on January 3 of odd years.
  const startedThisYear = year % 2 === 1 && (date.getUTCMonth() > 0 || date.getUTCDate() >= 3);
  const effectiveYear = year % 2 === 1 && !startedThisYear ? year - 1 : year;
  return Math.floor((effectiveYear - 1789) / 2) + 1;
}

/** The Congress in session at a timestamp (e.g. when an analysis was made); null if it isn't a date. */
export function congressForDate(dateIso: string | null | undefined): number | null {
  const date = new Date(dateIso || '');
  return Number.isNaN(date.getTime()) ? null : currentCongress(date);
}

/** The Congress in a federal record id ("us-119-hr-1" → 119). */
function congressInId(id: string): number | null {
  const m = id.match(/^us-(\d{1,3})-(hr|s|hjres|sjres|hconres|sconres|hres|sres)-\d+$/);
  return m ? Number(m[1]) : null;
}

/**
 * The jurisdiction of a stored id that ends with its bill number, without any
 * Congress or session part ("us-119-hr-1" → "us", "california-sb-1047" → "california").
 */
function idJurisdiction(id: string, bill: string): string | null {
  if (!id.endsWith(`-${bill}`)) return null;
  return id.slice(0, -(bill.length + 1)).replace(/(-[a-z]*\d[a-z0-9]*)+$/, '') || null;
}

/** The id scheme used before canonical ids (kept to match older analyses). */
export function legacyTitleId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** A stored analysis, as reconcilePolicyIds sees it. */
export interface ExistingPolicyRef {
  policy_id: string;
  policy_title: string | null;
  bill_number: string | null;
  /** Jurisdiction of the stored record; otherwise taken from the id, else Federal. */
  region?: string | null;
  /** Congress of the stored record (or the one in session when it was analyzed). */
  congress?: number | null;
  /** State legislative session of the stored record. */
  session?: string | null;
}

/**
 * When a feed is rebuilt, reuse the id of an analysis the user already has for
 * the same bill (matched by jurisdiction and bill number, or by the older
 * title-based id), so the same policy is never analyzed or counted twice. When
 * both sides know their Congress (or state session) it must match: bill
 * numbers restart with each one.
 */
export function reconcilePolicyIds<T extends {
  id: string;
  title: string;
  billNumber?: string | null;
  region?: string | null;
  congress?: number | null;
  session?: string | null;
  record?: { congress?: number | null; session?: string | null } | null;
}>(items: T[], existing: ExistingPolicyRef[]): T[] {
  type Known = { congress: number | null; session: string | null };
  const sameTerm = (a: Known, b: Known) =>
    (a.congress === null || b.congress === null || a.congress === b.congress) &&
    (a.session === null || b.session === null || a.session === b.session);
  const byId = new Map<string, Known>();
  const byBill = new Map<string, ({ id: string } & Known)[]>();
  for (const r of existing) {
    const known = { congress: congressInId(r.policy_id) ?? r.congress ?? null, session: slugify(r.session || '') || null };
    byId.set(r.policy_id, known);
    const bill = normalizeBillNumber(r.bill_number);
    if (!bill) continue;
    const key = `${r.region ? jurisdiction(r.region) : idJurisdiction(r.policy_id, bill) || 'us'}:${bill}`;
    byBill.set(key, [...(byBill.get(key) || []), { id: r.policy_id, ...known }]);
  }

  const used = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    let id = item.id;
    if (!byId.has(id)) {
      const known = {
        congress: item.record?.congress ?? item.congress ?? congressInId(item.id),
        session: slugify(item.record?.session || item.session || '') || null,
      };
      const bill = normalizeBillNumber(item.billNumber);
      const rows = (bill ? byBill.get(`${jurisdiction(item.region)}:${bill}`) || [] : []).filter((r) => sameTerm(r, known));
      // Prefer an analysis of the same Congress over one whose Congress is unknown.
      const match = rows.find((r) => known.congress !== null && r.congress === known.congress) || rows[0];
      const legacy = legacyTitleId(item.title);
      if (match) id = match.id;
      else if (byId.has(legacy) && sameTerm(byId.get(legacy)!, known)) id = legacy;
    }
    if (used.has(id)) continue; // two feed items resolved to the same policy
    used.add(id);
    out.push(id === item.id ? item : { ...item, id });
  }
  return out;
}
