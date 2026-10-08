/**
 * When each legal page's wording last changed (ISO dates). Update a page's
 * date whenever its text changes: it is the page's "Last updated" line and
 * its sitemap lastModified.
 */
export const TERMS_UPDATED = '2026-10-07';
export const PRIVACY_UPDATED = '2026-10-08';
export const DISCLAIMER_UPDATED = '2026-10-07';

/**
 * Version of the Terms/Privacy text a user accepts at sign-up (stored on their
 * profile): the later of the two dates, so a change to either gives new
 * sign-ups a new version.
 */
export const TERMS_VERSION = TERMS_UPDATED > PRIVACY_UPDATED ? TERMS_UPDATED : PRIVACY_UPDATED;

/** "2026-10-08" → "October 8, 2026" (read as a calendar date, in no time zone). */
export function formatLegalDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));
}

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@politicon.app';
export const MIN_AGE = 18;
