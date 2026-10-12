#!/usr/bin/env node
// Production dependency audit for CI:
//   node scripts/audit-prod.mjs
//
// Runs `npm audit --omit=dev --json` and fails on any high or critical
// advisory, except the ones listed in ACCEPTED below. Each accepted entry names
// the exact advisories, the package, and where in the tree it may sit, so the
// same advisory showing up anywhere else (for example in the root postcss)
// still fails. Accepted advisories are printed as warnings on every run, and an
// entry that npm no longer reports is flagged for removal.
//
// Exits 1 on an unaccepted high/critical advisory, 2 if npm audit could not run.
import { spawnSync } from 'node:child_process';

const BLOCKING = new Set(['high', 'critical']);

// Advisories we have reviewed and accept, each scoped to an exact package,
// tree location and advisory id. Empty: next's postcss is overridden to a
// fixed version in package.json "overrides".
const ACCEPTED = [];

const res = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(res.stdout);
} catch {
  console.error('audit-prod: npm audit did not return JSON.');
  console.error(res.stderr || res.stdout);
  process.exit(2);
}
if (report.error) {
  console.error(`audit-prod: npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(2);
}

const ghsa = (url = '') => url.match(/GHSA-[\w-]+/)?.[0] ?? url;
const isAccepted = (pkg, nodes, id) =>
  ACCEPTED.find((a) => a.package === pkg && a.ids.includes(id) && nodes.length > 0 && nodes.every((n) => a.nodes.includes(n)));

const blocking = [];
const accepted = new Map();
for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
    const id = ghsa(via.url);
    const line = `${via.severity.padEnd(8)} ${pkg} (${(vuln.nodes ?? []).join(', ')}) ${id} ${via.title ?? ''}`;
    const entry = isAccepted(pkg, vuln.nodes ?? [], id);
    if (entry) accepted.set(id, line);
    else blocking.push(line);
  }
}

const gha = !!process.env.GITHUB_ACTIONS;
for (const line of accepted.values()) {
  console.log(gha ? `::warning title=Accepted advisory::${line}` : `accepted  ${line}`);
}
// Moderate advisories never reach `accepted`, so look for each id anywhere in the report.
const listed = JSON.stringify(report.vulnerabilities ?? {});
for (const entry of ACCEPTED) {
  const gone = entry.ids.filter((id) => !listed.includes(id));
  if (gone.length) console.log(`note: ${entry.package} ${gone.join(', ')} no longer reported; remove from ACCEPTED in scripts/audit-prod.mjs.`);
}

const m = report.metadata?.vulnerabilities ?? {};
console.log(
  `npm audit (production deps): ${m.critical ?? 0} critical, ${m.high ?? 0} high, ${m.moderate ?? 0} moderate, ${m.low ?? 0} low; ` +
    `${accepted.size} accepted high/critical advisor${accepted.size === 1 ? 'y' : 'ies'}, ${blocking.length} blocking.`,
);
if (blocking.length) {
  console.error('\nUnaccepted high/critical advisories in production dependencies:');
  for (const line of blocking) console.error(`  ${line}`);
  console.error('\nFix them (npm audit fix, an override, or an upgrade). Accept one in ACCEPTED only with a written reason.');
  process.exit(1);
}
