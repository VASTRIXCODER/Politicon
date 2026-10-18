import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { maskEmail, type MaskedEmail } from '@/lib/maskEmail';
import { PUBLIC_STATS_REVALIDATE } from '@/lib/server/publicStats';

/** Most members listed on the landing page, newest first. */
export const MAX_LISTED_MEMBERS = 1000;

const PAGE_SIZE = 1000;
// Stops a runaway loop if the auth API keeps returning full pages.
const MAX_PAGES = 50;

export interface ListedMember {
  email: MaskedEmail;
  /** Month the account was created, as YYYY-MM. */
  joined: string;
}

interface AuthUserRow {
  email?: string | null;
  email_confirmed_at?: string | null;
  created_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
}

/** Accounts made by scripts/seed-accounts.mjs, which are never shown as members. */
export const isSeeded = (u: AuthUserRow) => u.app_metadata?.seeded === true;

/**
 * Confirmed, real accounts as masked emails, newest first. Seeded test
 * accounts are left out, as they are from the public member count. Full
 * addresses never leave this function, so they can't reach the page or its HTML.
 */
export function listableMembers(users: AuthUserRow[]): ListedMember[] {
  return users
    .filter((u) => u.email && u.email_confirmed_at && !isSeeded(u))
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .slice(0, MAX_LISTED_MEMBERS)
    .flatMap((u) => {
      const email = maskEmail(u.email!);
      return email ? [{ email, joined: String(u.created_at ?? '').slice(0, 7) }] : [];
    });
}

// Throws on failure so an error is never cached; getMemberDirectory decides what to show.
const readDirectory = unstable_cache(
  async (): Promise<ListedMember[]> => {
    const admin = createAdminClient();
    const users: AuthUserRow[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < PAGE_SIZE) break;
    }
    return listableMembers(users);
  },
  ['member-directory-v1'],
  { revalidate: PUBLIC_STATS_REVALIDATE, tags: ['public-stats'] }
);

/** Masked member list for the landing page. Never throws: a failure gives an empty list. */
export async function getMemberDirectory(): Promise<ListedMember[]> {
  try {
    return await readDirectory();
  } catch (error) {
    console.error('Member directory unavailable:', (error as { message?: unknown } | null)?.message ?? error);
    return [];
  }
}
