import { describe, expect, it } from 'vitest';
import { afterOnboardingPath, onboardingPath, safeNextPath } from '@/lib/safeNext';

describe('safeNextPath', () => {
  it('accepts same-origin relative paths', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
    expect(safeNextPath('/impact/us-hr-1?tab=overview')).toBe('/impact/us-hr-1?tab=overview');
  });

  it('rejects absolute, protocol-relative and backslash URLs', () => {
    expect(safeNextPath('https://evil.example')).toBeNull();
    expect(safeNextPath('//evil.example')).toBeNull();
    expect(safeNextPath('/\\evil.example')).toBeNull();
    expect(safeNextPath('')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });

  it('rejects paths that only escape the origin after URL parsing strips whitespace', () => {
    expect(safeNextPath('/\t/evil.example')).toBeNull();
    expect(safeNextPath('/\n/evil.example')).toBeNull();
    expect(safeNextPath('/\\/evil.example')).toBeNull();
  });
});

describe('onboardingPath / afterOnboardingPath', () => {
  it('carries a question from the landing page through onboarding', () => {
    const next = '/advisor?q=minimum%20wage';
    expect(onboardingPath(next)).toBe(`/onboarding?next=${encodeURIComponent(next)}`);
    expect(afterOnboardingPath(new URLSearchParams(onboardingPath(next).split('?')[1]).get('next'))).toBe(next);
  });

  it('drops destinations that would loop or add nothing', () => {
    for (const next of ['/onboarding', '/onboarding?next=/advisor', '/auth/signin', '/dashboard', null, '//evil.example']) {
      expect(onboardingPath(next)).toBe('/onboarding');
      expect(afterOnboardingPath(next)).toBeNull();
    }
  });

  it('keeps other app pages', () => {
    expect(afterOnboardingPath('/impact/us-hr-1')).toBe('/impact/us-hr-1');
    expect(afterOnboardingPath('/dashboards')).toBe('/dashboards');
  });
});
