#!/usr/bin/env node
// Bundle budget for App Router pages. Run after `next build`:
//   node scripts/check-bundle.mjs [distDir]   (distDir defaults to .next)
//
// For every page it adds up the gzipped JavaScript a browser downloads on a
// first visit: the framework bootstrap (rootMainFiles), global-error, every
// layout/template/error/loading boundary on the way down to the page, and the
// page itself. The chunk lists come from app-build-manifest.json, the same file
// `next build` uses for its "First Load JS" column, but that column leaves out
// the layouts, which hold most of this app's shared UI. Polyfills are left out
// because only legacy browsers (nomodule) load them.
//
// It can under-count: with webpack, a client module shared by several pages
// (next/link rendered from a server component, for example) carries the chunk
// list of whichever page webpack saw first, and the browser fetches those too.
// The budgets' headroom absorbs that; for exact per-page numbers, compare the
// <script> tags in .next/server/app/<route>.html.
//
// Exits 1 if any page is over its group's budget, 2 if the build output is
// missing or unreadable.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

// Gzipped kB (1 kB = 1000 bytes, as `next build` prints). Set about 15% above
// the largest page in each group as measured on 2026-10-10 (marketing: / at
// 239.7 kB; app: /settings at 257.7 kB). Raise one deliberately, in the same
// change that needs it.
const BUDGETS_KB = {
  marketing: 276,
  app: 297,
};

// Signed-in pages; mirrors PROTECTED_ROUTES in middleware.ts. Everything else
// (landing, help, legal, explorer, auth screens, 404) is public "marketing".
const APP_PREFIXES = ['/dashboard', '/policies', '/advisor', '/impact', '/settings', '/onboarding'];

const BOUNDARIES = ['layout', 'template', 'error', 'loading'];

const distDir = resolve(process.argv[2] ?? '.next');

function readJson(name) {
  const file = join(distDir, name);
  if (!existsSync(file)) {
    console.error(`check-bundle: ${file} not found. Run \`next build\` first (webpack build; Turbopack builds do not write it).`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

const buildManifest = readJson('build-manifest.json');
const appManifest = readJson('app-build-manifest.json').pages ?? {};
const appPaths = readJson('app-path-routes-manifest.json');

const polyfills = new Set(buildManifest.polyfillFiles ?? []);
const rootMain = (buildManifest.rootMainFiles ?? []).filter((f) => f.endsWith('.js'));

const sizeCache = new Map();
function gzipBytes(file) {
  if (!sizeCache.has(file)) {
    const path = join(distDir, file);
    if (!existsSync(path)) {
      console.error(`check-bundle: ${path} is listed in the manifest but missing on disk.`);
      process.exit(2);
    }
    sizeCache.set(file, gzipSync(readFileSync(path), { level: 9 }).length);
  }
  return sizeCache.get(file);
}

const jsFor = (key) => (appManifest[key] ?? []).filter((f) => f.endsWith('.js') && !polyfills.has(f));

// "/(group)/impact/[policyId]/page" -> the manifest keys of every boundary
// from the root down, then the page itself.
function entryKeys(entry) {
  const parts = entry.slice(0, -'/page'.length).split('/').filter(Boolean);
  const keys = ['/global-error'];
  for (let i = 0; i <= parts.length; i++) {
    const prefix = parts.slice(0, i).map((p) => `/${p}`).join('');
    for (const b of BOUNDARIES) keys.push(`${prefix}/${b}`);
  }
  keys.push(entry);
  // The 404 page renders the root not-found boundary.
  if (entry === '/_not-found/page') keys.push('/not-found');
  return keys;
}

function groupOf(route) {
  return APP_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`)) ? 'app' : 'marketing';
}

const kb = (bytes) => bytes / 1000;
const fmt = (bytes) => `${kb(bytes).toFixed(1)} kB`;

const rows = [];
for (const [entry, route] of Object.entries(appPaths)) {
  if (!entry.endsWith('/page')) continue; // route handlers, icons, sitemap
  const files = new Set(rootMain);
  for (const key of entryKeys(entry)) for (const f of jsFor(key)) files.add(f);
  const bytes = [...files].reduce((sum, f) => sum + gzipBytes(f), 0);
  const group = groupOf(route);
  const budget = BUDGETS_KB[group] * 1000;
  rows.push({ route, group, bytes, budget, over: bytes > budget });
}

if (rows.length === 0) {
  console.error(`check-bundle: no App Router pages found in ${distDir}.`);
  process.exit(2);
}

rows.sort((a, b) => a.group.localeCompare(b.group) || a.route.localeCompare(b.route));

const header = ['Route', 'Group', 'First load JS (gzip)', 'Budget', 'Used', ''];
const table = rows.map((r) => [
  r.route,
  r.group,
  fmt(r.bytes),
  fmt(r.budget),
  `${Math.round((r.bytes / r.budget) * 100)}%`,
  r.over ? 'OVER' : 'ok',
]);
const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
const line = (cells) => cells.map((c, i) => (i >= 2 && i <= 4 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ').trimEnd();

console.log(line(header));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const row of table) console.log(line(row));

const shared = rootMain.reduce((sum, f) => sum + gzipBytes(f), 0);
console.log(`\nFramework bootstrap shared by every page: ${fmt(shared)}`);
for (const [group, limit] of Object.entries(BUDGETS_KB)) {
  const inGroup = rows.filter((r) => r.group === group);
  if (inGroup.length === 0) continue;
  const max = Math.max(...inGroup.map((r) => r.bytes));
  console.log(`${group}: largest ${fmt(max)} of ${limit} kB budget`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    '### First-load JS per page (gzip)',
    '',
    '| Route | Group | First load | Budget | Used |',
    '| --- | --- | ---: | ---: | ---: |',
    ...table.map(([route, group, size, budget, used, status]) =>
      `| \`${route}\` | ${group} | ${size} | ${budget} | ${used}${status === 'OVER' ? ' **OVER**' : ''} |`),
    '',
  ].join('\n');
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, md); } catch { /* summary is optional */ }
}

const over = rows.filter((r) => r.over);
if (over.length > 0) {
  console.error(`\nOver budget: ${over.map((r) => `${r.route} (${fmt(r.bytes)} > ${fmt(r.budget)})`).join(', ')}`);
  console.error('Trim the page, or raise BUDGETS_KB in scripts/check-bundle.mjs if the growth is intended.');
  process.exit(1);
}
console.log('\nAll pages are within budget.');
