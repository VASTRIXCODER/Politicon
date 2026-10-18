/**
 * A record date ("2026-09-15" or an ISO timestamp) as "Sep 15, 2026", the
 * same on the server and in every time zone (read at noon UTC, printed in
 * UTC). Its own tiny module so pages that only print a record's dates
 * (components/PolicyProvenance) don't carry the bill path model with them.
 */
export function formatRecordDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const date = new Date(`${d.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
