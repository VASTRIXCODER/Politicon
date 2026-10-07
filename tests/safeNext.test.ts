import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/safeNext';

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
