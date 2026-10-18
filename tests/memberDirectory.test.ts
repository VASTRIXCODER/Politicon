import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

const { maskEmail } = await import('@/lib/maskEmail');
const { listableMembers, MAX_LISTED_MEMBERS } = await import('@/lib/server/memberDirectory');

describe('maskEmail', () => {
  it('keeps only the first characters and the top-level domain', () => {
    expect(maskEmail('Jordan.Lee42@Example.com')).toEqual({ head: 'j', domainHead: 'e', tld: '.com' });
    expect(maskEmail('a@mail.co.uk')).toEqual({ head: 'a', domainHead: 'm', tld: '.uk' });
  });

  it('never returns more of the address than three short pieces', () => {
    const m = maskEmail('someone.private@getpoliticon.app')!;
    expect(JSON.stringify(m)).not.toContain('someone');
    expect(JSON.stringify(m)).not.toContain('politicon');
  });

  it('handles domains without a dot and rejects non-addresses', () => {
    expect(maskEmail('root@localhost')).toEqual({ head: 'r', domainHead: 'l', tld: '' });
    expect(maskEmail('nope')).toBeNull();
    expect(maskEmail('@x.com')).toBeNull();
    expect(maskEmail('x@')).toBeNull();
  });
});

describe('listableMembers', () => {
  it('lists confirmed accounts only, newest first, with the join month', () => {
    const list = listableMembers([
      { email: 'old@a.com', email_confirmed_at: '2026-01-02', created_at: '2026-01-01T00:00:00Z' },
      { email: 'pending@b.com', email_confirmed_at: null, created_at: '2026-09-01T00:00:00Z' },
      { email: 'new@c.org', email_confirmed_at: '2026-10-02', created_at: '2026-10-01T00:00:00Z' },
      { email: null, email_confirmed_at: '2026-10-02', created_at: '2026-10-05T00:00:00Z' },
    ]);
    expect(list).toEqual([
      { email: { head: 'n', domainHead: 'c', tld: '.org' }, joined: '2026-10' },
      { email: { head: 'o', domainHead: 'a', tld: '.com' }, joined: '2026-01' },
    ]);
  });

  it('caps the list', () => {
    const users = Array.from({ length: MAX_LISTED_MEMBERS + 5 }, (_, i) => ({
      email: `u${i}@x.com`,
      email_confirmed_at: '2026-10-01',
      created_at: '2026-10-01T00:00:00Z',
    }));
    expect(listableMembers(users)).toHaveLength(MAX_LISTED_MEMBERS);
  });
});
