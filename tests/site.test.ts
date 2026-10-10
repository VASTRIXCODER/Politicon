import { describe, expect, it } from 'vitest';
import { isLoopbackUrl, normaliseSiteUrl, resolveSiteUrl } from '@/lib/site';

describe('normaliseSiteUrl', () => {
  it('accepts full URLs and bare hosts, without a trailing slash', () => {
    expect(normaliseSiteUrl('https://politicon.app/')).toBe('https://politicon.app');
    expect(normaliseSiteUrl(' politicon-abc.vercel.app ')).toBe('https://politicon-abc.vercel.app');
    expect(normaliseSiteUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('rejects missing or invalid values', () => {
    for (const raw of [undefined, '', '   ', 'ftp://example.com', 'https://', 'http://exa mple.com']) {
      expect(normaliseSiteUrl(raw)).toBeNull();
    }
  });
});

describe('isLoopbackUrl', () => {
  it('spots localhost and loopback addresses', () => {
    for (const url of ['http://localhost:3000', 'http://app.localhost', 'http://127.0.0.1:8080', 'http://[::1]:3000', 'http://0.0.0.0']) {
      expect(isLoopbackUrl(url)).toBe(true);
    }
    expect(isLoopbackUrl('https://politicon.app')).toBe(false);
  });
});

describe('resolveSiteUrl', () => {
  it('uses NEXT_PUBLIC_APP_URL when it is set', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_APP_URL: 'https://politicon.app', VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' }))
      .toBe('https://politicon.app');
    // Off Vercel a localhost value is a real choice (local `next start`).
    expect(resolveSiteUrl({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })).toBe('http://localhost:3000');
  });

  it("falls back to Vercel's own URLs, never a guessed host", () => {
    expect(resolveSiteUrl({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'politicon-xyz.vercel.app', VERCEL_URL: 'politicon-xyz-abc123.vercel.app' }))
      .toBe('https://politicon-xyz.vercel.app');
    expect(resolveSiteUrl({ VERCEL: '1', VERCEL_URL: 'politicon-xyz-abc123.vercel.app' })).toBe('https://politicon-xyz-abc123.vercel.app');
    expect(resolveSiteUrl({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'politicon-git-feature.vercel.app',
      VERCEL_URL: 'politicon-abc123.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'politicon-xyz.vercel.app',
    })).toBe('https://politicon-git-feature.vercel.app');
  });

  it('ignores a localhost NEXT_PUBLIC_APP_URL on Vercel (the .env.example default)', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000', VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'politicon-xyz.vercel.app' }))
      .toBe('https://politicon-xyz.vercel.app');
  });

  it('ends at localhost when nothing is configured', () => {
    expect(resolveSiteUrl({})).toBe('http://localhost:3000');
    expect(resolveSiteUrl({ PORT: '4000', NEXT_PUBLIC_APP_URL: 'not a url' })).toBe('http://localhost:4000');
  });
});
