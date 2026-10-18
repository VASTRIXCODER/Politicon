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
// The 3D stage (three.js, React Three Fiber, drei and the ambient light
// field) must never reach a first load: StageLoader imports it with
// next/dynamic once the page is idle, and only on devices that render 3D.
// This script fails if any page's first-load chunks contain three.js or R3F,
// and holds the stage's lazy chunks, the 3D each page can load lazily and all
// lazy 3D code together to their own budgets.
//
// Exits 1 if any page is over its group's budget, three.js is in a first-load
// chunk, or the lazy 3D code (the stage, any page's share, the total) is over
// its budget; 2 if the build output is missing or unreadable.
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
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

// The lazy 3D stage: the gzipped chunks behind StageLoader's and SceneView's
// dynamic imports (react-loadable-manifest.json), minus anything a first load
// already carries. This is what any page with 3D downloads (and only on a
// device that renders it). Measured at 263.3 kB on 2026-10-18 (three.js ~190,
// R3F ~55, drei View and PerformanceMonitor, the light field and the stage
// ~17); the budget is that plus ~15%.
const LAZY_STAGE_BUDGET_KB = 302;
// What one page can download for its 3D: the stage above, the tier-2 bloom
// pass the stage loads (postprocessing, ~91 kB, tier 2 only) and every scene
// and kit chunk the page's SceneViews can import, followed through every
// dynamic import the page can reach (the dashboard's ledger section loads
// its LedgerMonolith, for example), minus what its first load already holds.
// This is what a visitor pays on a 3D device, so it is the budget that
// matters. Measured on 2026-10-18 (App I): the landing page 427.2 kB (hero +
// film), the dashboard 399.2 kB (household avatar + ledger), onboarding
// 386.7 kB; a page with no scene still counts the stage (StageLoader is in
// the root layout), 354.3 kB, though it never loads it.
//
// History: R0 held all lazy 3D together to 473 kB. That number grows with
// every page that gets a scene, though no visitor downloads it all, so App I
// (R2+R3) replaced it with this per-page budget, and keeps a looser cap on
// the total below as a sanity check against runaway growth.
const LAZY_3D_PER_ROUTE_BUDGET_KB = 430;
// /lab is internal visual QA (404 on the production deployment) and mounts
// every kit piece and scene by design, so it is reported but not held to the
// per-page budget (433 kB for the kit alone); the total cap still covers it.
const LAZY_3D_UNBUDGETED_ROUTES = new Set(['/lab']);
// Every lazy chunk that is part of the 3D kit, whichever page loads it: the
// stage, the bloom pass, the kit pieces and every scene. 484.8 kB on
// 2026-10-18 (App I); the cap leaves room for the scenes still planned
// (R4: the impact page's transmission, the receipt's skyline; R5: the
// guide's orb), each held to the per-page budget above.
//
// NOTE: the redesign plan set "about 300 kB gzip for the stage and the shared
// kit". The stage alone is close to that; these budgets are this file's
// numbers, not the plan's, and were signed off with the PRs that set them.
const LAZY_3D_TOTAL_BUDGET_KB = 620;

// Strings that survive minification and only three.js / R3F contain.
const THREE_SIGNATURES = ['__THREE__', 'isWebGLRenderer', '__r3f'];

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
// Written by every webpack build that uses next/dynamic (the stage does).
const loadableManifest = readJson('react-loadable-manifest.json');

const polyfills = new Set(buildManifest.polyfillFiles ?? []);
const rootMain = (buildManifest.rootMainFiles ?? []).filter((f) => f.endsWith('.js'));

const sizeCache = new Map();
const sourceCache = new Map();
function source(file) {
  if (!sourceCache.has(file)) {
    const path = join(distDir, file);
    if (!existsSync(path)) {
      console.error(`check-bundle: ${path} is listed in the manifest but missing on disk.`);
      process.exit(2);
    }
    sourceCache.set(file, readFileSync(path));
  }
  return sourceCache.get(file);
}
function gzipBytes(file) {
  if (!sizeCache.has(file)) sizeCache.set(file, gzipSync(source(file), { level: 9 }).length);
  return sizeCache.get(file);
}
const has3d = (file) => {
  const text = source(file).toString('latin1');
  return THREE_SIGNATURES.some((sig) => text.includes(sig));
};

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
  rows.push({ route, group, bytes, budget, over: bytes > budget, files });
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

// --- The lazy 3D stage --------------------------------------------------------

const firstLoad = new Set(rows.flatMap((r) => [...r.files]));
const eager3d = rows.flatMap((r) => [...r.files].filter(has3d).map((f) => `${r.route} (${f})`));

// The stage proper: what StageLoader and SceneView pull in on any 3D page.
const isStageKey = (k) => /^components\/three\/(StageLoader|SceneView)\.tsx -> /.test(k);
const lazyFiles = (keys) =>
  new Set(keys.flatMap((k) => (loadableManifest[k].files ?? []).filter((f) => f.endsWith('.js') && !firstLoad.has(f))));
const threeKeys = Object.keys(loadableManifest).filter((k) => k.startsWith('components/three/'));
const stageKeys = threeKeys.filter(isStageKey);
const stageFiles = lazyFiles(stageKeys);
const stageBytes = [...stageFiles].reduce((sum, f) => sum + gzipBytes(f), 0);
const stageBudget = LAZY_STAGE_BUDGET_KB * 1000;
const stageMissing = stageKeys.length === 0 || ![...stageFiles].some(has3d);

// Everything else 3D that loads lazily: the other dynamic imports under
// components/three/ (post effects, kit pieces; postprocessing has no three.js
// signature of its own) and any other lazy chunk carrying three.js (/lab).
const chunkDir = join(distDir, 'static', 'chunks');
const allChunks = [];
(function walk(dir, rel) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = `${rel}/${entry.name}`;
    if (entry.isDirectory()) walk(join(dir, entry.name), relPath);
    else if (entry.name.endsWith('.js')) allChunks.push(`static/chunks${relPath}`);
  }
})(chunkDir, '');
const extraFiles = new Set([
  ...lazyFiles(threeKeys.filter((k) => !isStageKey(k))),
  ...allChunks.filter((f) => !firstLoad.has(f) && has3d(f)),
]);
for (const f of stageFiles) extraFiles.delete(f);
const extraBytes = [...extraFiles].reduce((sum, f) => sum + gzipBytes(f), 0);
const totalBytes = stageBytes + extraBytes;
const totalBudget = LAZY_3D_TOTAL_BUDGET_KB * 1000;

// Per page: follow every dynamic import the page's chunks can make. A
// webpack import() of module N compiles to `…then(r.bind(r, N))`, and the
// loadable manifest gives each imported module's id and chunks, so a page
// reaches an entry when one of the chunks it already reaches binds that id.
const dynamicEntries = Object.entries(loadableManifest).map(([key, value]) => ({
  key,
  three: key.startsWith('components/three/'),
  binds: new RegExp(`\\.bind\\([\\w$]+,${Number(value.id)}\\)`),
  files: (value.files ?? []).filter((f) => f.endsWith('.js')),
}));
function lazy3dFor(row) {
  const reach = new Set(row.files);
  const used = new Set();
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of dynamicEntries) {
      if (used.has(e) || !Number.isFinite(Number(loadableManifest[e.key].id))) continue;
      if (![...reach].some((f) => e.binds.test(source(f).toString('latin1')))) continue;
      used.add(e);
      for (const f of e.files) reach.add(f);
      grew = true;
    }
  }
  const files = new Set([...used].filter((e) => e.three).flatMap((e) => e.files).filter((f) => !row.files.has(f)));
  const scenes = [...used]
    .filter((e) => /^components\/three\/(scenes|kit)\//.test(e.key))
    .map((e) => e.key.split(' -> ').pop().split('/').pop());
  return { bytes: [...files].reduce((sum, f) => sum + gzipBytes(f), 0), scenes: [...new Set(scenes)] };
}
const routeBudget = LAZY_3D_PER_ROUTE_BUDGET_KB * 1000;
const lazyRows = rows.map((r) => {
  const { bytes, scenes } = lazy3dFor(r);
  const budgeted = !LAZY_3D_UNBUDGETED_ROUTES.has(r.route);
  return { route: r.route, bytes, scenes, budgeted, over: budgeted && bytes > routeBudget };
});

console.log(`\nLazy 3D stage (${stageKeys.length} dynamic imports, ${stageFiles.size} chunks): ${fmt(stageBytes)} of ${LAZY_STAGE_BUDGET_KB} kB budget`);
console.log(`Lazy 3D effects and kit pieces (${extraFiles.size} more chunks): ${fmt(extraBytes)}`);
console.log(`Lazy 3D total: ${fmt(totalBytes)} of ${LAZY_3D_TOTAL_BUDGET_KB} kB cap`);
console.log(`\nLazy 3D a page can load (stage + bloom + its scenes), budget ${LAZY_3D_PER_ROUTE_BUDGET_KB} kB per page:`);
const lazyWidth = Math.max(...lazyRows.map((r) => r.route.length));
for (const r of [...lazyRows].sort((a, b) => b.bytes - a.bytes)) {
  const status = r.over ? 'OVER' : r.budgeted ? 'ok' : 'not budgeted (internal QA)';
  const scenes = r.scenes.length ? `  ${r.scenes.join(', ')}` : '';
  console.log(`  ${r.route.padEnd(lazyWidth)}  ${fmt(r.bytes).padStart(9)}  ${status}${scenes}`);
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
    `Lazy 3D stage: ${fmt(stageBytes)} of ${LAZY_STAGE_BUDGET_KB} kB${stageBytes > stageBudget ? ' **OVER**' : ''}; ` +
      `all lazy 3D: ${fmt(totalBytes)} of ${LAZY_3D_TOTAL_BUDGET_KB} kB${totalBytes > totalBudget ? ' **OVER**' : ''}.`,
    '',
    `| Route | Lazy 3D it can load (budget ${LAZY_3D_PER_ROUTE_BUDGET_KB} kB) |`,
    '| --- | ---: |',
    ...[...lazyRows].sort((a, b) => b.bytes - a.bytes).map((r) =>
      `| \`${r.route}\` | ${fmt(r.bytes)}${r.over ? ' **OVER**' : r.budgeted ? '' : ' (not budgeted)'} |`),
    '',
  ].join('\n');
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, md); } catch { /* summary is optional */ }
}

let failed = false;
const over = rows.filter((r) => r.over);
if (over.length > 0) {
  console.error(`\nOver budget: ${over.map((r) => `${r.route} (${fmt(r.bytes)} > ${fmt(r.budget)})`).join(', ')}`);
  console.error('Trim the page, or raise BUDGETS_KB in scripts/check-bundle.mjs if the growth is intended.');
  failed = true;
}
if (eager3d.length > 0) {
  console.error(`\nthree.js / R3F in a first-load chunk: ${eager3d.join(', ')}`);
  console.error('3D code must load through next/dynamic or import() (see components/three/StageLoader.tsx and kit/lazy.tsx).');
  failed = true;
}
if (stageMissing) {
  console.error('\nNo lazy 3D stage found in react-loadable-manifest.json (expected next/dynamic imports under components/three/ that load three.js).');
  failed = true;
} else if (stageBytes > stageBudget) {
  console.error(`\nLazy 3D stage over budget: ${fmt(stageBytes)} > ${fmt(stageBudget)}. Trim it, or raise LAZY_STAGE_BUDGET_KB if the growth is intended.`);
  failed = true;
}
const lazyOver = lazyRows.filter((r) => r.over);
if (lazyOver.length > 0) {
  console.error(`\nLazy 3D over the per-page budget: ${lazyOver.map((r) => `${r.route} (${fmt(r.bytes)} > ${fmt(routeBudget)})`).join(', ')}`);
  console.error('Build the scene from shared kit pieces, split it, or raise LAZY_3D_PER_ROUTE_BUDGET_KB if the growth is intended.');
  failed = true;
}
if (totalBytes > totalBudget) {
  console.error(`\nLazy 3D total over its cap: ${fmt(totalBytes)} > ${fmt(totalBudget)}. Trim it, or raise LAZY_3D_TOTAL_BUDGET_KB if the growth is intended.`);
  failed = true;
}
if (failed) process.exit(1);
console.log('\nAll pages are within budget, no first load carries three.js, and the lazy 3D code is within budget.');
