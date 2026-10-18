#!/usr/bin/env node
// Creates confirmed accounts with random emails and passwords:
//   node --env-file=.env.local scripts/seed-accounts.mjs [--count 200] [--domains getpoliticon.app]
//   node --env-file=.env.local scripts/seed-accounts.mjs --delete
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Accounts are
// created through the auth admin API with the email already confirmed, so no
// mail is sent, and each is tagged app_metadata.seeded = true. --delete removes
// every tagged account (and, through the foreign keys, its profile and data).
//
// The emails and passwords go to seed-accounts.local.csv (gitignored). Keep it
// out of the repo: it is the only copy of the passwords.
//
// Domains default to getpoliticon.app, which the project owns. Addresses at a
// public provider (gmail.com and so on) could belong to real people, who would
// then get any password-reset or account mail sent to them.
//
// Exits 1 if any account could not be created or deleted, 2 on bad config.
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomInt } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const COUNT = Number(flag('count') ?? 200);
const DOMAINS = (flag('domains') ?? 'getpoliticon.app').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
const OUT = flag('out') ?? 'seed-accounts.local.csv';
const DELETE = args.includes('--delete');
const BATCH = 10;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('seed-accounts: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}
if (!DELETE && (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 5000 || DOMAINS.length === 0)) {
  console.error('seed-accounts: --count must be 1 to 5000 and --domains must name at least one domain.');
  process.exit(2);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const FIRST = [
  'alex', 'sam', 'jordan', 'taylor', 'morgan', 'casey', 'riley', 'jamie', 'avery', 'quinn',
  'maria', 'james', 'li', 'priya', 'omar', 'sofia', 'daniel', 'aisha', 'mateo', 'emma',
  'noah', 'olivia', 'lucas', 'mia', 'ethan', 'zoe', 'leo', 'nina', 'isaac', 'grace',
];
const LAST = [
  'smith', 'garcia', 'nguyen', 'patel', 'kim', 'johnson', 'lee', 'brown', 'martinez', 'davis',
  'lopez', 'wilson', 'chen', 'khan', 'rivera', 'clark', 'lewis', 'walker', 'young', 'hall',
];
const pick = (list) => list[randomInt(list.length)];

function randomEmail() {
  const first = pick(FIRST);
  const last = pick(LAST);
  const n = randomInt(10, 9999);
  const local = [`${first}.${last}${n}`, `${first}${last}${n}`, `${first[0]}${last}${n}`, `${first}_${n}`][randomInt(4)];
  return `${local}@${pick(DOMAINS)}`;
}

// 18 characters from a URL-safe alphabet: about 108 bits.
const randomPassword = () => randomBytes(18).toString('base64url').slice(0, 18);

async function seededUsers() {
  const found = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    found.push(...data.users.filter((u) => u.app_metadata?.seeded === true));
    if (data.users.length < 1000) return found;
  }
}

async function deleteSeeded() {
  const users = await seededUsers();
  let failed = 0;
  for (let i = 0; i < users.length; i += BATCH) {
    const results = await Promise.all(users.slice(i, i + BATCH).map((u) => admin.auth.admin.deleteUser(u.id)));
    for (const { error } of results) if (error) failed++, console.error(`delete failed: ${error.message}`);
  }
  console.log(`Deleted ${users.length - failed} of ${users.length} seeded accounts.`);
  return failed;
}

async function createSeeded() {
  const created = [];
  const used = new Set();
  let failed = 0;
  while (created.length < COUNT && failed < 20) {
    const batch = [];
    while (batch.length < Math.min(BATCH, COUNT - created.length)) {
      const email = randomEmail();
      if (!used.has(email)) used.add(email), batch.push({ email, password: randomPassword() });
    }
    const results = await Promise.all(
      batch.map((a) =>
        admin.auth.admin.createUser({ ...a, email_confirm: true, app_metadata: { seeded: true } }).then((r) => ({ a, r }))
      )
    );
    for (const { a, r } of results) {
      // An address already taken is just skipped and replaced by another random one.
      if (r.error) failed++, console.error(`create failed for ${a.email}: ${r.error.message}`);
      else created.push(a);
    }
    process.stdout.write(`\r${created.length}/${COUNT}`);
  }
  process.stdout.write('\n');
  writeFileSync(OUT, ['email,password', ...created.map((a) => `${a.email},${a.password}`)].join('\n') + '\n', { mode: 0o600 });
  console.log(`Created ${created.length} accounts. Credentials written to ${OUT}.`);
  return created.length < COUNT ? 1 : 0;
}

try {
  process.exit(DELETE ? ((await deleteSeeded()) ? 1 : 0) : await createSeeded());
} catch (e) {
  console.error('seed-accounts:', e?.message ?? e);
  process.exit(1);
}
