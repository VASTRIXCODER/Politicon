/**
 * A record date ("2026-09-15" or an ISO timestamp) as "Sep 15, 2026", the
 * same on the server and in every time zone. A plain date is the record's
 * own day (read at noon UTC, printed in UTC). A timestamp (when the record
 * was read: "as of") is printed as the day it was in Washington, the
 * legislative record's own clock: UTC would date an evening read in the US
 * a day ahead ("as of" tomorrow). Its own tiny module so pages that only
 * print a record's dates (components/PolicyProvenance) don't carry the bill
 * path model with them.
 */
const OPTIONS = { month: 'short', day: 'numeric', year: 'numeric' } as const;

export function formatRecordDate(d: string | null | undefined): string | null {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(d)) {
    const at = new Date(d);
    if (!Number.isNaN(at.getTime())) return at.toLocaleDateString('en-US', { ...OPTIONS, timeZone: 'America/New_York' });
  }
  const date = new Date(`${d.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-US', { ...OPTIONS, timeZone: 'UTC' });
}
