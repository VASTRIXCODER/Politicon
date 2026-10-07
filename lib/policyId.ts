/**
 * Stable policy ids. The same bill must get the same id every time the feed is
 * rebuilt, or analyses get duplicated. Ids come from the jurisdiction and bill
 * number when there is one (e.g. "us-hr-1", "california-sb-1047"), otherwise
 * from the normalized title. Always matches ^[a-z0-9][a-z0-9-]{0,79}$.
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

/** The id scheme used before canonical ids (kept to match older analyses). */
export function legacyTitleId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/**
 * When a feed is rebuilt, reuse the id of an analysis the user already has for
 * the same bill (matched by bill number, or by the older title-based id), so
 * the same policy is never analyzed or counted twice.
 */
export function reconcilePolicyIds<T extends { id: string; title: string; billNumber?: string | null }>(
  items: T[],
  existing: { policy_id: string; policy_title: string | null; bill_number: string | null }[],
): T[] {
  const byId = new Set(existing.map((r) => r.policy_id));
  const byBill = new Map<string, string>();
  for (const r of existing) {
    const bill = normalizeBillNumber(r.bill_number);
    if (bill && !byBill.has(bill)) byBill.set(bill, r.policy_id);
  }

  const used = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    let id = item.id;
    if (!byId.has(id)) {
      const bill = normalizeBillNumber(item.billNumber);
      const legacy = legacyTitleId(item.title);
      if (bill && byBill.has(bill)) id = byBill.get(bill)!;
      else if (byId.has(legacy)) id = legacy;
    }
    if (used.has(id)) continue; // two feed items resolved to the same policy
    used.add(id);
    out.push(id === item.id ? item : { ...item, id });
  }
  return out;
}
