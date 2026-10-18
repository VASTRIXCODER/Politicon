import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARK_BOUNDS, MARK_PATHS, MARK_PATHS_SMALL, MARK_SMALL_BOUNDS, MARK_VIEWBOX, WORDMARK } from '@/lib/brand/mark';
import { BRAND_COLORS, THEMES } from '@/lib/design/tokens';
import { BRAND, SITE_NAME } from '@/lib/site';

/*
 * The Aperture Dome mark is shared by <Logo>, the icons, the share image and
 * the extruded 3D mark, so its path data must stay simple, valid and closed:
 * absolute M/L/H/V/A/Z commands only, every subpath closed (ExtrudeGeometry
 * needs closed shapes), and everything inside the drawn bounds.
 */

const root = path.join(__dirname, '..');

/** Arguments each absolute command takes. */
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, A: 7, Z: 0 };

type Command = { cmd: string; args: number[] };

function parsePath(d: string): Command[] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  // Nothing but commands, numbers, separators and whitespace may appear.
  expect(d.replace(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|[\s,]/g, '')).toBe('');
  const out: Command[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    expect(Object.keys(ARITY), `unsupported command ${cmd}`).toContain(cmd);
    const n = ARITY[cmd];
    const args = tokens.slice(i, i + n).map(Number);
    expect(args.length, `${cmd} arguments`).toBe(n);
    expect(args.every(Number.isFinite)).toBe(true);
    if (cmd === 'A') {
      expect(args[0]).toBeGreaterThan(0);
      expect(args[1]).toBeGreaterThan(0);
      expect([0, 1]).toContain(args[3]);
      expect([0, 1]).toContain(args[4]);
    }
    out.push({ cmd, args });
    i += n;
  }
  return out;
}

/** Splits a path into subpaths and returns each one's visited points. */
function subpaths(d: string) {
  const subs: { start: [number, number]; points: [number, number][]; closed: boolean }[] = [];
  let x = 0;
  let y = 0;
  for (const { cmd, args } of parsePath(d)) {
    const cur = subs[subs.length - 1];
    if (cmd === 'M') {
      [x, y] = args;
      subs.push({ start: [x, y], points: [[x, y]], closed: false });
      continue;
    }
    expect(cur, `${cmd} before any M`).toBeDefined();
    expect(cur.closed, `${cmd} after Z without a new M`).toBe(false);
    if (cmd === 'L') [x, y] = args;
    if (cmd === 'H') x = args[0];
    if (cmd === 'V') y = args[0];
    if (cmd === 'A') [x, y] = args.slice(5);
    if (cmd === 'Z') {
      cur.closed = true;
      [x, y] = cur.start;
    }
    cur.points.push([x, y]);
  }
  return subs;
}

describe('MARK_PATHS', () => {
  it('uses the 64×64 grid', () => {
    expect(MARK_VIEWBOX).toBe('0 0 64 64');
  });

  for (const part of ['dome', 'aperture', 'base'] as const) {
    it(`${part} is valid path data made of closed shapes inside the bounds`, () => {
      const subs = subpaths(MARK_PATHS[part]);
      expect(subs.length).toBeGreaterThan(0);
      for (const sub of subs) {
        expect(sub.closed, 'every subpath ends with Z').toBe(true);
        for (const [px, py] of sub.points) {
          expect(px).toBeGreaterThanOrEqual(MARK_BOUNDS.x - 0.01);
          expect(px).toBeLessThanOrEqual(MARK_BOUNDS.x + MARK_BOUNDS.width + 0.01);
          expect(py).toBeGreaterThanOrEqual(MARK_BOUNDS.y - 0.01);
          expect(py).toBeLessThanOrEqual(MARK_BOUNDS.y + MARK_BOUNDS.height + 0.01);
        }
      }
    });
  }

  it('has one lens of light and a mirror-symmetric plinth', () => {
    expect(subpaths(MARK_PATHS.aperture)).toHaveLength(1);
    const xs = subpaths(MARK_PATHS.base).flatMap((s) => s.points.map(([px]) => px));
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(64, 5);
  });

  it('touches the drawn bounds on every side', () => {
    const pts = Object.values(MARK_PATHS).flatMap((d) => subpaths(d).flatMap((s) => s.points));
    const xs = pts.map(([px]) => px);
    const ys = pts.map(([, py]) => py);
    expect(Math.min(...xs)).toBeCloseTo(MARK_BOUNDS.x, 1);
    expect(Math.max(...xs)).toBeCloseTo(MARK_BOUNDS.x + MARK_BOUNDS.width, 1);
    // The lantern's rounded top peaks between its endpoints, so check the plinth only.
    expect(Math.max(...ys)).toBeCloseTo(MARK_BOUNDS.y + MARK_BOUNDS.height, 1);
  });

  it('names the product', () => {
    expect(WORDMARK).toBe(SITE_NAME);
  });
});

describe('MARK_PATHS_SMALL (32px and below)', () => {
  for (const part of ['dome', 'aperture', 'base'] as const) {
    it(`${part} is valid path data made of closed shapes inside its bounds`, () => {
      for (const sub of subpaths(MARK_PATHS_SMALL[part])) {
        expect(sub.closed, 'every subpath ends with Z').toBe(true);
        for (const [px, py] of sub.points) {
          expect(px).toBeGreaterThanOrEqual(MARK_SMALL_BOUNDS.x - 0.01);
          expect(px).toBeLessThanOrEqual(MARK_SMALL_BOUNDS.x + MARK_SMALL_BOUNDS.width + 0.01);
          expect(py).toBeGreaterThanOrEqual(MARK_SMALL_BOUNDS.y - 0.01);
          expect(py).toBeLessThanOrEqual(MARK_SMALL_BOUNDS.y + MARK_SMALL_BOUNDS.height + 0.01);
        }
      }
    });
  }

  it('is one solid dome with the aperture knocked out, and is symmetric', () => {
    // Outline plus the hexagonal hole.
    expect(subpaths(MARK_PATHS_SMALL.dome)).toHaveLength(2);
    for (const part of ['dome', 'aperture', 'base'] as const) {
      const xs = subpaths(MARK_PATHS_SMALL[part]).flatMap((s) => s.points.map(([px]) => px));
      expect(Math.min(...xs) + Math.max(...xs), part).toBeCloseTo(64, 5);
    }
  });

  it('keeps every gap at least 3 units (about a pixel at 16px)', () => {
    const rects = subpaths(MARK_PATHS_SMALL.base).map((s) => {
      const xs = s.points.map(([px]) => px);
      const ys = s.points.map(([, py]) => py);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });
    const columns = rects.filter((r) => r.x1 - r.x0 < 20).sort((a, b) => a.x0 - b.x0);
    const plinth = rects.find((r) => r.x1 - r.x0 >= 20)!;
    expect(columns).toHaveLength(3);
    for (let i = 1; i < columns.length; i++) expect(columns[i].x0 - columns[i - 1].x1).toBeGreaterThanOrEqual(3);
    expect(columns[0].y0 - 38.5, 'dome to columns').toBeGreaterThanOrEqual(3);
    expect(plinth.y0 - columns[0].y1, 'columns to plinth').toBeGreaterThanOrEqual(3);
  });
});

describe('app/icon.svg', () => {
  const svg = readFileSync(path.join(root, 'app', 'icon.svg'), 'utf8');

  it('draws the small mark from the shared paths', () => {
    expect(svg.trimStart().startsWith('<svg')).toBe(true);
    expect(svg).toContain(`viewBox="${MARK_VIEWBOX}"`);
    expect(svg).toContain(`fill-rule="evenodd" d="${MARK_PATHS_SMALL.dome}"`);
    expect(svg).toContain(`d="${MARK_PATHS_SMALL.base}"`);
  });

  it('loads nothing external', () => {
    expect(svg).not.toMatch(/href=|url\((?!#)|@import|<script/i);
  });
});

describe('app/favicon.ico', () => {
  const ico = readFileSync(path.join(root, 'app', 'favicon.ico'));

  it('holds 16, 32 and 48 px PNG images', () => {
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const width = ico.readUInt8(entry) || 256;
      const height = ico.readUInt8(entry + 1) || 256;
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      const png = ico.subarray(offset, offset + length);
      expect(png.length).toBe(length);
      expect(png.subarray(0, 8).toString('hex'), 'PNG signature').toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height]);
      sizes.push(width);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });
});

describe('app/global-error.tsx', () => {
  it('writes out colours that still match the light theme tokens', () => {
    const source = readFileSync(path.join(root, 'app', 'global-error.tsx'), 'utf8');
    const block = source.match(/const PAPER = \{([\s\S]*?)\} as const;/)?.[1] ?? '';
    const colors = Object.fromEntries([...block.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]]));
    expect(colors).toEqual({
      canvas: THEMES.light.canvas,
      ink: THEMES.light.ink,
      muted: THEMES.light.muted,
      violet: BRAND_COLORS.violet,
      violetFill: THEMES.light.violetFill,
      violetLight: BRAND_COLORS.violetLight,
    });
  });
});

describe('BRAND (generated images)', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('reads its colours from the design tokens', () => {
    expect(BRAND.paper).toBe(BRAND_COLORS.paper);
    expect(BRAND.ink).toBe(THEMES.light.ink);
    expect(BRAND.violet).toBe(BRAND_COLORS.violet);
    expect(BRAND.violetText).toBe(THEMES.light.violetText);
    expect(BRAND.muted).toBe(THEMES.light.muted);
  });

  it('keeps the share image text at AA on paper', () => {
    for (const text of [BRAND.ink, BRAND.muted, BRAND.violetText]) {
      expect(contrast(text, BRAND.paper)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
