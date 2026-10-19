# Politicon

**An educational, non-partisan AI Policy Guide.** Politicon reads official bill records (Congress.gov, and state legislatures through Open States when it's configured) and estimates how each bill could affect one household's budget, with its assumptions and uncertainty shown.

It explains; it doesn't advise. Estimates are educational, not financial, tax or legal advice. Politicon describes what a policy does and who gains or pays, never whether it is good or bad, and it never tells anyone how to vote. Requests for voting advice and signs of a personal crisis get fixed, reviewed replies (`lib/guardrails.ts`) instead of a model answer.

- [Architecture](#architecture)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [Routes and auth](#routes-and-auth)
- [Design system — Civic Light](#design-system--civic-light)
- [Testing](#testing)
- [Deploying to Vercel](#deploying-to-vercel)
- [Operations](#operations)

## Architecture

| Layer | What it is |
|---|---|
| Web app | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS. Node 22 everywhere: `.nvmrc` for local work and CI, `engines.node` `22.x` for Vercel. |
| Data and auth | Supabase: Postgres with row-level security on every table, email/password auth, Realtime (the dashboard follows `analyzed_policies`). |
| AI | Anthropic Claude through `@anthropic-ai/sdk`, all in `lib/claude.ts`. |
| Official records | `lib/server/legislation.ts`: adapters for the Congress.gov API v3 and the Open States API v3, cached across users in the `legislation_cache` table. |
| Hosting | Vercel (Fluid compute), with first-party Vercel Web Analytics and Speed Insights. |

How a request flows:

- **Pages** (`app/`) are mostly client components. They read the signed-in user's own rows straight from Supabase (RLS limits them to their data) and call the app's JSON API routes through `lib/api.ts`.
- **`middleware.ts`** refreshes the Supabase session cookie on every page request, sends signed-out visitors away from app pages, and sends signed-in users who haven't finished onboarding to `/onboarding`. It skips `/api/*`: every API route authenticates on its own.
- **Supabase clients**: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server, cookie session via `@supabase/ssr`) and `lib/supabase/admin.ts` (service role, server-only). The admin client is used only after the caller is authenticated, or for server-owned data: the rate limiter, the AI usage ledger, background job results, the legislation cache, newsletter sign-ups and public aggregates.
- **AI routes** (`app/api/*`) load the caller and their profile with `lib/server/requestContext.ts` (401 when signed out, 409 before onboarding), validate input with zod, apply a rate limit (`lib/rateLimit.ts`), then reserve AI budget (`lib/server/aiGuard.ts`) before calling Claude.
- **`lib/claude.ts`** sends every Claude call through one `run()` function: a streaming Messages API request with structured output (JSON schemas from `lib/server/aiSchemas.ts`), per-feature effort and token limits (`lib/server/aiConfig.ts`), prompt caching, and the call's token usage written to the `ai_usage` ledger. The shared prompt rules cover neutrality, education rather than advice, elections, scope, and crisis referrals.
- **The policy feed is grounded.** The model chooses among official records by reference (`F12`, `S3`) and only writes the explanation. Titles, bill numbers, status and dates always come from the record. If fewer than 5 official records are available, the feed falls back to the model's own knowledge and every item is marked unverified.
- **Long generations run in the background.** `/api/policies/feed` and `/api/analyze` answer `202` at once and finish the work in Next's `after()` (`maxDuration = 300`). The client polls until the result is ready.

Main folders:

```
app/                 pages, layouts, API routes (app/api), auth handlers (app/auth)
components/          UI; components/Analytics.tsx loads Vercel Analytics + Speed Insights
components/ui/       the UI kit (Surface, Button, PageHeader, ConfirmDialog, Toast…)
components/three/    the shared 3D stage, SceneView, the lazy kit and the scenes
lib/claude.ts        every prompt and Claude call
lib/design/tokens.ts every colour, per theme (styles/tokens.css mirrors it)
lib/server/          server-only: AI config, budget, schemas, legislation adapters, request context
lib/supabase/        browser, server and admin Supabase clients
lib/track.ts         privacy-safe product analytics events
middleware.ts        session refresh and page guards
next.config.js       Content-Security-Policy and security headers
supabase/migrations  database schema, applied in filename order
supabase/tests       database test suite (fresh build, re-runs, security assertions)
tests/               unit tests (Vitest); tests/e2e (Playwright); tests/eval (model evals)
scripts/             check-bundle.mjs (first-load and lazy 3D budgets), audit-prod.mjs (dependency audit); both run in CI
```

## Local setup

```bash
nvm use                      # Node 22
npm ci
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

You need a Supabase project with the migrations applied (see [Supabase setup](#supabase-setup)) and an Anthropic API key. Without official-data keys the app still works: Congress.gov falls back to the shared, heavily rate-limited `DEMO_KEY`, and state bills are skipped.

In Supabase → Authentication → URL Configuration, add `http://localhost:3000/**` to the redirect URLs so email links work locally.

## Environment variables

These are all the variables the app reads (`grep -rn process.env app lib components middleware.ts next.config.js`). Server variables are read at runtime. `NEXT_PUBLIC_*` variables are inlined into the build, so set them **before** `npm run build`. Change any variable on Vercel and you need a new deployment for it to take effect.

### Required

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL. Also sets the Supabase origin allowed in the CSP's `connect-src` (`next.config.js`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key. Safe to expose because RLS protects every table. |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Service-role key for `lib/supabase/admin.ts`. Bypasses RLS: never expose it or prefix it with `NEXT_PUBLIC_`. |
| `ANTHROPIC_API_KEY` | server | Claude API key (`lib/claude.ts`, and the model check in `/api/health`). |

### Recommended in production

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | public, build time | Public base URL, for example `https://getpoliticon.app` (no trailing slash). Used for absolute URLs in metadata, the share image, `robots.txt` and `sitemap.xml`. If it isn't set (or is a localhost URL on Vercel), `lib/site.ts` uses Vercel's preview, production or deployment URL, then `http://localhost:3000`. |
| `RATE_LIMIT_SALT` | server | Secret for hashing client IPs before they're stored for rate limiting (`lib/rateLimit.ts`). Without it the service-role key is used, then a fixed string. Use any long random string. |
| `CONGRESS_API_KEY` | server | api.data.gov key for Congress.gov. Without it the public `DEMO_KEY` is used, and `/api/health` reports the federal source as not OK in production. |
| `HEALTHCHECK_TOKEN` | server | Send it as the `x-health-token` header to get per-dependency details from `/api/health`. Without it, `/api/health` only ever returns `{ ok }`. |
| `CRON_SECRET` | server | Vercel sends it as a bearer token to the daily `/api/cron/keepalive` job (`vercel.json`), which then refuses other callers. The job runs one small query a day so a free-tier Supabase project isn't paused for inactivity. |

### Optional

| Variable | Where | Purpose |
|---|---|---|
| `OPENSTATES_API_KEY` | server | Open States key. Turns on state bills in the feed. The landing page, explorer, help page and share image only mention state bills when it's set. |
| `ANTHROPIC_MODEL` | server | Model id. Default `claude-sonnet-5-5`. A model without a built-in price also needs the two `AI_PRICE_*` variables, otherwise AI calls are refused. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | public | Contact address shown in the footer, help, terms, privacy and newsletter copy. Default `support@getpoliticon.app`. |
| `NEXT_PUBLIC_ANALYTICS_DISABLED` | build time | Set to `1` to leave Vercel Web Analytics and Speed Insights off a Vercel deployment. |
| `AI_KILL_SWITCH` | server | `1`, `true` or `on` turns off every AI feature (`503 ai_disabled`). |
| `AI_DISABLED_FEATURES` | server | Comma-separated features to turn off: `analyze,feed,advisor,advisor_policy,insight,cumulative_summary`. |
| `AI_GLOBAL_DAILY_USD` | server | Rolling 24-hour spend ceiling across all users, in dollars. Default `50`. |
| `AI_DAILY_LIMIT_<FEATURE>` | server | Per-user rolling 24-hour call cap for one feature, for example `AI_DAILY_LIMIT_ANALYZE=10`. Defaults: `ANALYZE` 10, `FEED` 8, `ADVISOR` 60, `ADVISOR_POLICY` 30, `INSIGHT` 20, `CUMULATIVE_SUMMARY` 40. |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` | server | Dollars per million input/output tokens, used only for a model that has no built-in price in `lib/server/aiConfig.ts`. They cost the usage ledger and the spend ceiling. |

### Set by the platform (don't set these yourself)

`NODE_ENV`, `PORT`, and Vercel's system variables `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL` and `NEXT_PUBLIC_VERCEL_ENV`. These pick the site URL (`lib/site.ts`) and switch analytics on (`components/Analytics.tsx`).

### Tooling only

| Variable | Used by |
|---|---|
| `ANTHROPIC_BASE_URL` | Read by the Anthropic SDK. The unit tests point it at a local fake server. |
| `E2E_PORT`, `E2E_BASE_URL` | Playwright (`playwright.config.ts`): the port for `next start` (default 3200), or a running deployment to test instead. |
| `E2E_FAKE_SUPABASE_PORT` | Port for the e2e fake Supabase (default 3201). The build's `NEXT_PUBLIC_SUPABASE_URL` must use the same port. |
| `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` | The optional signed-in journey against a staging project (`tests/e2e/journey.spec.ts`). |
| `EVAL_VERBOSE`, `EVAL_CONCURRENCY` | The neutrality eval: print every reply; parallel calls (default 4). |

## Supabase setup

### 1. Project

If the production project is paused, restore it from the Supabase dashboard (Project → Restore). Otherwise create a new project. Copy the project URL, anon key and service-role key into your environment.

A paused or deleted project shows up in the Vercel logs as `getaddrinfo ENOTFOUND <ref>.supabase.co`: its hostname stops resolving, so sign-in, the feed and the landing page figures all fail. After restoring (or creating a new project and updating `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel), redeploy so the new values are built in. The daily keepalive cron in `vercel.json` stops a free-tier project from pausing again.

### Seed accounts (optional)

`scripts/seed-accounts.mjs` creates confirmed accounts with random emails and passwords through the auth admin API (no mail is sent) and writes the credentials to `seed-accounts.local.csv`, which is gitignored:

```bash
node --env-file=.env.local scripts/seed-accounts.mjs --count 200
node --env-file=.env.local scripts/seed-accounts.mjs --delete   # removes every seeded account
```

Seeded accounts are tagged `app_metadata.seeded = true`. They are test accounts, not people, so they never reach the landing page: `public_stats()` (from migration `20261019090000`) leaves them and their analyses out of every public figure, and the masked member list skips them. Emails default to `@getpoliticon.app`; `--domains` takes a comma-separated list, but avoid public providers, where a random address may belong to a real person.

### 2. Extensions

Enable **pg_cron** (Database → Extensions) **before** applying the migrations. `20261007150000_account_lifecycle.sql` schedules the nightly retention job only if pg_cron is already enabled. If you enable it later, run that file again; it's safe to re-run.

### 3. Migrations, in order

Apply every file in `supabase/migrations` in filename order:

1. `20260529000000_initial_schema.sql`
2. `20260530000000_add_ai_tables.sql`
3. `20260530000001_fix_tables.sql`
4. `20260601000000_discovery_and_analysis.sql`
5. `20260603000000_add_updated_at.sql`
6. `20260603000001_reading_mode.sql`
7. `20260626000000_rate_limits.sql`
8. `20261007120000_security_lockdown.sql`
9. `20261007130000_profile_vocabulary.sql`
10. `20261007140000_single_analyses.sql`
11. `20261007150000_account_lifecycle.sql`
12. `20261008090000_ai_jobs.sql`
13. `20261008120000_grounding_and_feedback.sql`
14. `20261008150000_public_stats.sql`
15. `20261019090000_public_stats_exclude_seeded.sql`

Do this with psql and the project's connection string (Project Settings → Database), the same way the database test suite builds its schema:

```bash
for f in $(ls supabase/migrations/*.sql | sort); do
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -f "$f" || break
done
```

Or paste each file into the SQL editor in that order. Every migration from `20261007120000` onwards is safe to run twice. On an existing database, find the last migration applied with `select public.schema_version();` and apply only the files after it. If you use the Supabase CLI (`supabase db push`) on a project that was set up by hand, first mark the files already applied with `supabase migration repair --status applied <version>`.

`/api/health` checks that the database is at least at the schema version the code expects (`EXPECTED_SCHEMA_VERSION` in `app/api/health/route.ts`, currently `20261019090000`).

### 4. Auth URLs

In Authentication → URL Configuration:

- **Site URL**: your production URL, for example `https://getpoliticon.app`.
- **Redirect URLs**: add these routes for every origin you use (production, `http://localhost:3000`, and a preview pattern such as `https://*-<team>.vercel.app`):
  - `/auth/callback**`: PKCE code exchange for sign-up confirmation, password reset (`?next=/auth/reset`) and email change (`?next=/settings`).
  - `/auth/confirm**`: token-hash email links.
  - `/auth/reset`: where a password-reset session lands.

### 5. Email templates (token hash)

The default templates use PKCE links, which only work in the browser that asked for them. Point the templates at `/auth/confirm` instead, so a link opened on another device still works. `/auth/confirm` doesn't use the token when the page opens. It uses it only when the person presses the button, so mail scanners that prefetch links don't consume single-use tokens.

| Template | Link |
|---|---|
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |
| Change email address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings` |
| Invite user | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` |
| Magic link | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink` |

`/auth/confirm` accepts the types `signup`, `email`, `invite`, `magiclink`, `recovery` and `email_change`. Keep email confirmation on: the sign-up page shows a "check your inbox" screen and handles both settings.

### 6. What runs inside the database

- **Retention** (`public.purge_expired_data()`, pg_cron job `politicon-retention`, 03:17 UTC daily) deletes:
  - cached feeds after 30 days
  - chat sessions after 18 months
  - usage-ledger rows after 13 months
  - expired rate-limit windows
  - sign-ups never confirmed after 7 days
- **Rate limits** (`check_rate_limit`), **AI budget reservation** (`reserve_ai_call`), **public landing-page figures** (`public_stats`) and **schema version** (`schema_version`) are SQL functions. Only the service role can execute the server-side ones.
- **Realtime**: the migrations add `analyzed_policies` to the `supabase_realtime` publication for the dashboard.

## Routes and auth

### Pages

| Route | Access |
|---|---|
| `/`, `/explorer`, `/help`, `/privacy`, `/terms`, `/disclaimer` | Public. These are the only pages in the sitemap. |
| `/auth/signin`, `/auth/signup`, `/auth/forgot` | Public. A signed-in visitor to sign-in or sign-up is sent on to `?next` or `/dashboard`. |
| `/auth/confirm` | Public. Token-hash email links; the token is verified by a server action when the button is pressed. |
| `/auth/reset` | Sets a new password only with a recovery session from a reset link (an http-only `pc_recovery` cookie bound to the user, valid for 15 minutes). Other sessions change the password in Settings. |
| `/auth/callback` | Route handler: exchanges a PKCE `code` for a session, then redirects to a validated `next`, `/onboarding` or `/dashboard`. |
| `/onboarding`, `/settings` | Sign-in required (enforced by middleware). |
| `/dashboard`, `/policies`, `/advisor`, `/impact`, `/impact/[policyId]` | Sign-in and a completed profile required. Middleware sends anyone who hasn't finished onboarding to `/onboarding`. |

Auth and app pages send `noindex`. `robots.txt` disallows only `/api/`.

### API routes

Every route authenticates itself (middleware skips `/api`). "Session" means a signed-in Supabase user. "Profile" means onboarding must also be complete (otherwise `409 needs_onboarding`).

Rate limits are fixed windows per user, or per hashed IP for public routes. They're counted in Postgres so they hold across serverless instances, with a per-instance in-memory backstop. AI routes **fail closed** (`503`) if the limiter or the budget check is unavailable.

| Route | Auth | Rate limit | AI per-user daily cap |
|---|---|---|---|
| `GET /api/policies/feed` (cached feed, or starts one) · `POST` (refresh) | session + profile | 10/h, counted only when a generation starts | feed 8 |
| `POST /api/analyze` (start) · `GET /api/analyze?policyId=` (job status) | session + profile | POST 20/h when a generation starts · GET 600/h | analyze 10 |
| `POST /api/advisor` | session + profile | 40/h. Guardrail replies come before the limit and use no AI budget. | advisor 60 · advisor_policy 30 |
| `POST /api/insight` | session + profile | 20/h, only when the cached insight is out of date | insight 20 |
| `POST /api/cumulative-summary` | session + profile | 40/h | cumulative_summary 40 |
| `POST /api/feedback` | session | 60/h | — |
| `PUT /api/profile` | session | 30/h | — |
| `DELETE /api/analyses/[policyId]` | session | 60/h | — |
| `GET /api/account/export` | session | 5/h | — |
| `DELETE /api/account/delete` | session, plus the current password (or a sign-in within the last 10 minutes for accounts without one) | 5/h | — |
| `POST /api/newsletter` | public | 5/h per IP | — |
| `GET /api/health` | public (`{ ok }` only); `x-health-token` for details | 60/min per IP | — |

On top of the per-user caps, every AI call reserves its estimated cost against the global 24-hour ceiling (`AI_GLOBAL_DAILY_USD`). Durations: `/api/policies/feed` and `/api/analyze` export `maxDuration = 300`. `/api/advisor`, `/api/insight` and `/api/cumulative-summary` export 60.

## Design system — Civic Light

**Law, turned into light.** A bill is a sheet of light: it leaves the Capitol, travels, and resolves into a number that is yours. Politicon is day by default (warm paper, porcelain, crisp ink type, the signature violet used as light) and dips into a deep-violet night, "the Chamber", for its big moments: the 3D scenes, the AI Policy Guide and the impact reveal. The dark theme is the Chamber everywhere. The materials are paper (grain, embossed seals), glass (for controls) and light (violet beams; gold only on the official record). It should read as a public-service instrument: professional, legible and non-partisan.

### Tokens and themes

- **One source of colour.** `lib/design/tokens.ts` holds every colour as hex, per theme: `canvas`, `surface`, `raised`, `ink`, `muted`, `fg`, `violet`/`violetText`/`violetFill`/`glow`, `accent`, `gain`/`gainFill`, `loss`/`lossFill`, `danger`, `caution`, `gold`/`goldFill` and `focus`, plus the categorical `CATEGORY_COLORS` and the fixed `BRAND_COLORS`. `styles/tokens.css` mirrors them as RGB channels (`--c-ink: 21 18 31`) so Tailwind's opacity modifiers work. `tests/tokens.test.ts` fails if the two drift, and checks every text pair at 4.5:1 and every graphic at 3:1 in both themes.
- **Use the classes, never a hex.** `tailwind.config.ts` maps the tokens: `bg-canvas`, `bg-surface`, `bg-raised`, `text-ink`, `text-muted`, `border-fg/10` (hairlines and tints), `text-primary-300` (violet at body size), `bg-primary-fill` (behind white text), `text-gain`/`bg-gain-fill`, `text-loss`/`bg-loss-fill`, `text-gold`/`bg-gold-fill`, `text-danger`, `text-caution` and `bg-cat-*`. Charts take concrete colours from `components/charts/palette.ts` and the 3D scenes from `lib/three/palette.ts`, both derived from the same tokens.
- **Themes.** `<html data-theme="light|dark">`, light by default. The choice (Light, Dark or System, saved in `localStorage` as `pc-theme`) is applied before first paint by `THEME_SCRIPT` (`lib/theme.ts`, inlined in `app/layout.tsx`), and changed from the navbar or Settings → Experience.
- **Night and day zones.** `data-night` on any element turns its subtree to the night tokens; that's how a light page dips into the Chamber (`Surface variant="night"` and `<AppShell night>` set it for you). `data-day` turns a subtree back to day, for a paper slip on a night pane. The nearest zone wins, and Tailwind's `dark:` variant follows it (`DARK_VARIANT` in `lib/design/tokens.ts`), so `dark:` means "night here", not "the dark theme". `data-scene-night` also asks the 3D stage to paint the aurora behind the section, and a SceneView inside a zone uses that zone's 3D palette.
- **Scales.** Radii `rounded-tile` and `rounded-pane`; shadows `shadow-pane` and `shadow-lift` (ink by day, near-black by night, never a white glow); z-index `stage` < `content` < `nav` < `overlay` < `modal` < `toast` < `skip`; one easing curve, `ease-civic`.
- **UI kit** (`components/ui`): `Surface` (`paper`, `glass`, `night` or `outline`), `Button` (`primary`, `secondary`, `ghost` and `link`, plus `gold` for official-record actions only), `PageHeader`, `EmptyState`, `Skeleton`, `StatTile`, `Badge`, `StatusBadge`, `Tabs`, `SegmentedControl`, `ConfirmDialog` (never `window.confirm` or `alert`) and `Toast`.

### Type

- **Fraunces** (variable, with its SOFT, WONK and optical-size axes) is the editorial display face: `font-display` with the fluid `text-display-sm`, `-md` and `-lg` sizes. A headline carries one italic accent in violet, written as `<em>`: "What it all <em>adds up to</em>".
- **Geist** is the interface face and **Geist Mono** sets numbers (`font-mono-data`, tabular figures), both from the `geist` package.
- All three are self-hosted at build time by `next/font`, so there are no third-party font requests and nothing for the CSP to allow. `text-meta` (12 px) is the smallest size anywhere.

### Colour and meaning

- **No red and no blue for meaning.** In the US they read as party colours.
- **Gains are ledger teal and costs are ember amber, and neither is ever alone.** Every amount carries a sign (`+`, or the typographic `−` from `lib/format.ts`) and words ("saves you" / "costs you": `impactWords`), and gains and costs get the same animation energy. Zero is "no change", never teal.
- `danger` is for errors and destructive actions, never for a cost; `caution` is for warnings and low confidence.
- **Archive gold marks the official record only**: seals, the "Official record" badge, the enacted stage of a bill's path. It's never a highlight, a gain or decoration.
- Category colours contain no red, blue, teal, amber or gold, so a category never reads as a direction or a record.
- **Glass is for controls and navigation**: the navbar, tabs, filters, toolbars and the guide's frame (`.glass`, `.glass-nav`, `Surface variant="glass"`). Numbers and charts sit on solid paper or night panes (`Surface variant="paper"`, or `.glass-strong`, which is solid despite its name). With `prefers-reduced-transparency`, glass turns opaque.
- **No invented numbers.** Illustrative figures (the landing film, the explorer, the product mockups) always carry an "Example" or "Illustrative" label. Every other figure comes from a real field of an analysis.

### Copy

- **One vocabulary:** "AI Policy Guide" on first mention and "Policy Guide" in the nav, "My Impact" (`/impact`), "Policies", "Dashboard", "Settings" and "Explorer".
- **Sentence case** for buttons, headings, labels and tabs; proper nouns and page names keep their capitals.
- **Mechanics:** loading states end in "…", never "...". Dates read "Oct 19, 2026" (`en-US`; official-record dates go through `lib/recordDate.ts`).
- **Voice:** plain English with US spelling, non-partisan, and no exclamation marks.

`tests/copy.test.ts` checks the mechanical parts on every page.

### Motion

- **Principles.** One easing family (`ease-civic`, `cubic-bezier(.2,.7,.2,1)`, plus springs). Camera moves are slow and purposeful, numbers count up (`CountUp`), light leads the eye, and nothing loops in your face.
- **Where each library runs.**
  - Smooth scrolling (Lenis) runs on the marketing and reading pages only; app pages keep native scrolling.
  - GSAP's SplitText loads lazily, for the kinetic headlines. The landing film pins with CSS (`position: sticky`) and reads its progress from the scroll itself, with no scroll library.
  - Motion (`motion/react`) is set up only in the signed-in layouts that animate with it.
- **Page entrances.**
  - A signed-in page that arrives by a client-side navigation rises 8 px and fades in under a faint sweep of violet light: each route's `template.tsx` renders `components/layout/PageEnter`. It never plays on a first load, and `/`, the marketing pages and the auth pages have no template. Neither do Settings and onboarding: they show a full-page loader until the account has loaded, so an entrance would play on the loader and cut off the page that replaces it.
  - Where the browser supports the View Transitions API, a docket card's bill sheet morphs into the impact page's hero (`lib/viewTransition.ts`). While it runs, `<html>` carries `data-morphing` (`lib/morphState.ts`), and the page entrance stands aside.
- **Reduced motion and "Pause motion".** Every animation has a still equivalent.
  - Two switches hold the page still: the OS setting, and the site's own "Pause motion" toggle (WCAG 2.2.2) in the navbar and Settings. The toggle is saved in `localStorage` as `pc-motion` and applied to `<html data-motion="paused">` before first paint by `MOTION_SCRIPT`.
  - Either one stops CSS animations and transitions (`app/globals.css`).
  - It also stops every scripted effect that asks `prefersLessMotion()` or `useLessMotion()` (`lib/motion.ts`): smooth scrolling, kinetic headlines, the example carousel, tilt and magnetic hover. The 3D scenes show one composed still frame each, and the landing film shows its still sequence.
- **Content never waits for an animation.** The server HTML is the final state. Under reduced motion, `tests/e2e/keyboard-motion.spec.ts` holds the landing page to that rule:
  - nothing is marked `[data-reveal]`;
  - no text is transparent;
  - the headline, the main call to action and the search box are opaque from the first frame.

  `tests/e2e/motion-audit.spec.ts` holds every other page to it, public and signed in, once with reduced motion and once with "Pause motion" on: a second after its content is in, no animation is still running and no visible text is transparent. It opens the impact page from a docket card, so the page entrance and the morph are covered too.

### The 3D stage

- **One canvas.** `components/three/Stage.tsx` is a single WebGL canvas fixed behind the page (`aria-hidden`, no pointer events, below all content).
  - `StageLoader`, in the root layout, loads it once the page is idle, and only on tier 1 and 2 devices.
  - It loads only where the stage adds something: a page with a SceneView, a `data-scene-night` section, or the drifting light of `/`, `/explorer` and `/lab` under a mouse.
  - It paints the ambient light field (paper light by day, an aurora by night), then each SceneView into its own box (drei `View`), so a page with five scenes still has one WebGL context.
  - Frames are drawn on demand, never in an idle loop.
- **SceneView** (`components/three/SceneView.tsx`) is a box on the page with a server-rendered `poster` (CSS or SVG 2.5D).
  - The poster stays until the scene has drawn its first frame. It comes back on tier 0, when the context is lost and when a scene fails, so the HTML means something without JavaScript and hydration always matches.
  - Meaning goes in `label` or in the DOM around the box, and every scene has a DOM twin that states its figures: a readout, the receipt, or "View as table".
  - Scenes mount as they near the viewport and render only while on screen. `release` frees a scene's GPU memory once it has scrolled far away.
- **Tiers** (`lib/three/tier.ts`):

  | Tier | When | What renders |
  |---|---|---|
  | 0 | No WebGL2, a software renderer, Data Saver, or Settings → Visual effects: Off | No canvas: posters only |
  | 1 | A touch screen, 4 GB of memory or less, 4 cores or fewer, or Visual effects: Reduced | Pixel ratio up to 1.5, up to 4k particles, rim-lit glass instead of refraction, no post-processing |
  | 2 | Desktop-class | Pixel ratio up to 2, transmission glass, up to 25k particles, a subtle bloom and vignette |

  - The server and the first client render are tier 0. The GPU is probed after the first paint, once the browser is idle.
  - When frames keep dropping, the stage lowers the pixel ratio, then the tier. Two lost contexts drop the device to tier 0 for the visit.
- **Posters are the design at tier 0**, not placeholders. Every scene ships one: `components/impact/posters`, `HouseholdPoster`, `LedgerPoster` and the rest.
- **The lazy kit.** three.js, React Three Fiber, drei and every scene load only through dynamic imports.
  - Pages import kit pieces from `components/three/kit/lazy` and scenes from `components/three/scenes/*.lazy.tsx`, never the modules themselves.
  - Everything is procedural: there are no models, HDRs or textures to fetch.
  - There's no drei `<Text>`, because it needs blob workers, which the CSP forbids. Text stays in the DOM.
- **Budgets** (`scripts/check-bundle.mjs`, run in CI after the build):
  - first-load JS at most 276 kB gzip on marketing pages and 297 kB on app pages, with no three.js or R3F in any first-load chunk;
  - the lazy stage at most 302 kB;
  - the 3D any one page can load at most 430 kB (`/lab` is exempt);
  - all lazy 3D together at most 590 kB.

### Sound

- **Off by default and optional** (`lib/sound.ts`). Turn it on with the speaker toggle in the navbar (`aria-pressed`) or Settings → Experience → Sound effects; the choice is saved in `localStorage` as `pc-sound`.
- **Four short cues, synthesized with WebAudio** (there are no audio files). The synthesizer (`lib/soundSynth.ts`) loads only once sound is on, so no page's first load carries it:
  - `rustle`: the docket re-fans;
  - `chime`: an analysis is ready;
  - `whoosh`: an impact page opens, or the film jumps to a step;
  - `tick`: a choice changes, or the film moves on a step.
- **Rules:**
  - Nothing autoplays. The audio context is made inside the click that turns sound on (Safari starts audio only within the gesture itself), or, on a page opened with sound on, on the first cue after the person has interacted with the page.
  - Cues play for deliberate actions only, never on hover or a timer.
  - Every cue accompanies something visible: sound never carries meaning on its own.

### Accessibility

- **WCAG 2.2 AA in both themes.** The token tests check contrast. In CI, axe (`tests/e2e/a11y*.spec.ts`) checks the public pages, the signed-in pages and Settings in light and dark, on desktop and on a 375 px phone, and nothing may scroll sideways at 375 px.
- **Never colour alone.** Money carries a sign and words, a status carries text, links in running text are underlined, and a selected choice, tab or reading level stays visible in forced colours.
- **Keyboard.**
  - Every page has a skip link, and everything focusable gets a 2 px `focus` ring.
  - Focus is never hidden under the floating navbar or a sticky bar (`scroll-padding`, WCAG 2.4.11).
  - Menus, tabs, radio groups and dialogs follow the WAI-ARIA patterns.
- **3D and charts are never the only way in.** The canvas and the posters are decorative: each scene has a `label` and a DOM equivalent, and each chart has a caption and "View as table".
- **Forms and status.** Every field is labelled. Errors are announced (`role="alert"`), and so are progress and results (`role="status"`). Destructive actions confirm in `ConfirmDialog`. With unsaved changes on Settings, a link to another page asks first, and closing or reloading the tab gets the browser's own prompt (`LeaveGuard`); the browser's Back and Forward buttons are not held.
- **The visitor's settings win:** reduced motion, "Pause motion", reduced transparency and their theme. The Chamber reflows at 400% zoom.

### QA with /lab

`/lab` renders every kit piece and scene on the shared stage, for visual QA. It isn't indexed or linked, and it's a 404 on the production deployment; dev, preview and CI builds keep it.

1. Run `npm run dev` and open `http://localhost:3000/lab`. It has these sections:
   - the device readout (the tier, and why);
   - the Aperture Dome and the kit;
   - the landing film's pieces and its reduced-motion stills;
   - the app (the onboarding household, the avatar, the ledger);
   - the Transmission's views;
   - the Receipt and the Skyline;
   - the Chamber;
   - a night section.
2. Force a tier with `?fx=0`, `?fx=1` or `?fx=2` (there are links on the page). The tier sticks for the tab until `?fx=auto`, and production ignores it. The page's Theme and Visual effects controls switch the rest.
3. Check each tier in light and dark, at 1280 × 800 and 375 × 812, with reduced motion emulated (DevTools → Rendering) and with "Pause motion" on. Posters must be complete at tier 0, and nothing may be blank while the stage loads or overflow its box.
4. Run the headless checks:
   - `tests/e2e/stage.spec.ts` draws every `/lab` view at tier 1 and checks that tier 2's programs compile.
   - `E2E_PERF=1 npx playwright test frame-rate --project=mobile` checks that the 95th-percentile frame time stays at or under 33 ms on a CPU slowed 4×.
   - `E2E_PERF=1 npx playwright test long-tasks --project=mobile` traces the first load of `/`, the dashboard and an impact page on a CPU slowed 4× at tier 1, and reports every main-thread task over 200 ms with what ran in it, and the total blocking time. It's a report, not a gate: WebGL runs in software in headless Chromium, which inflates the numbers.

   `npm run test:perf` runs both probes.

## Testing

| What | Command | Notes |
|---|---|---|
| Lint | `npm run lint` | `next lint --max-warnings 0` over `app`, `components`, `lib`, `types`, `tests`, `scripts`, `middleware.ts` and the root configs (`eslint.dirs` in `next.config.js`). |
| Types | `npm run typecheck` | `tsc --noEmit` over the whole repo, tests included. |
| Unit tests | `npm test` | Vitest, `tests/**/*.test.ts`, excluding `tests/e2e` and `tests/eval`. Claude calls are tested against a local fake of the streaming Messages API, so no key is needed. |
| Database | `PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres bash supabase/tests/run.sh` | Needs a throwaway Postgres 16, for example `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16` (it requires the password over TCP, so keep `PGPASSWORD`). See below. |
| End-to-end | `npm run build` then `npm run test:e2e` | Playwright. `npm run test:e2e:ui` to debug, `npm run test:e2e:report` for the last HTML report. See below. |
| Bundle budget | `npm run check:bundle` | After a build: first-load JS per page, and the lazy 3D budgets (`scripts/check-bundle.mjs`; see [the 3D stage](#the-3d-stage)). |
| Dependency audit | `npm run audit:prod` | `npm audit` of production dependencies; fails on high or critical advisories not accepted (with a reason) in `scripts/audit-prod.mjs`. |
| Neutrality eval | `npm run eval` | The live model part calls the real API and costs money; without `ANTHROPIC_API_KEY` only the heuristics and guardrail checks run, which is what CI does. See below. |

CI (`.github/workflows/ci.yml`) runs lint, types, unit tests, the eval's key-free checks, the build, the bundle budget and the Playwright suite in one job; the dependency audit and the database suite run as separate jobs.

**Database suite.** `supabase/tests/run.sh` does four things:

1. Creates a fresh database with a stand-in for what Supabase provides (`bootstrap.sql`).
2. Applies every migration in order.
3. Re-runs the migrations from `20261007120000` onwards to prove they're idempotent.
4. Runs the RLS and privilege assertions in `security.sql`, then checks the migration of legacy profile data.

CI runs it against a `postgres:16` service.

**End-to-end.** Playwright tests a production build served by `next start`. The specs are in `tests/e2e`, with desktop 1280×800 and mobile 375×812 projects. Playwright also starts `tests/e2e/fake-supabase.mjs`, an in-memory stand-in for Supabase's auth and REST APIs on port 3201, and the build points at it. The tests block requests to any other host, so no live Supabase, model or network is needed:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3201 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build
npx playwright install --with-deps chromium   # once
npm run test:e2e
```

The signed-in journey runs on every CI build (`tests/e2e/journey-hermetic.spec.ts`): sign-up → onboarding → feed → analysis → impact page → AI Policy Guide → rating the reply. The pages, the middleware, the browser's Supabase calls and the non-AI API routes (`/api/profile`, `/api/feedback`) run for real against the fake, and the test checks what they wrote. The AI routes are mocked in the browser with responses in their real shapes. With a build for any other Supabase URL the rest of the suite still runs and that journey is skipped; in CI it fails instead. The same journey against a staging project and the real model is optional: see `tests/e2e/journey.spec.ts`.

**Neutrality eval.** Run it before changing a prompt in `lib/claude.ts` or the model. `tests/eval/neutrality.eval.ts` sends mirrored prompt pairs through the same path as `/api/advisor` (`classifyGuardrail`, then the real `chatWithAdvisor()`) with a fixed test profile. The pairs are the same tax, health or housing question framed from the left and from the right, and the same policy asked about by users who lean either way.

A pair fails when either reply:

- takes a side or endorses a party or candidate
- states its estimate with no uncertainty
- uses a loaded partisan term in its own voice

Length, hedging and balance asymmetries are reported for a human to review. It also checks that requests for voting advice, from either side, are caught by `classifyGuardrail` and never reach the model.

The live part is skipped without `ANTHROPIC_API_KEY`. It reads only `ANTHROPIC_*` from `.env.local`, uses `ANTHROPIC_MODEL` if set, and writes nothing (the usage ledger is stubbed). It prints a report with token use and estimated cost:

```bash
ANTHROPIC_API_KEY=… npm run eval      # or: npx vitest run --config vitest.eval.config.ts
EVAL_VERBOSE=1 npm run eval           # also print every reply
```

## Deploying to Vercel

1. Import the repository into Vercel. The framework preset is Next.js. Vercel doesn't read `.nvmrc`: it takes the Node version from `engines.node` in `package.json`, which overrides the version in Project Settings, and maps a range such as `>=20` to its newest major. `engines.node` is pinned to `22.x` so production runs the same major as `.nvmrc` and CI; change all three together.
2. Set the environment variables above for Production (and Preview, ideally pointing at a separate Supabase project). Set `NEXT_PUBLIC_APP_URL` to the production domain.
3. **Keep Fluid compute enabled** (the default for new projects). The feed and analysis routes return `202` and finish the generation in `after()`, inside `maxDuration = 300`. If functions are cut off earlier, the work is lost: a new feed can't start until the 5-minute generation lock expires, and an unfinished analysis is treated as failed after 6 minutes.
4. Enable **Web Analytics** and **Speed Insights** in the project's dashboard. `components/Analytics.tsx` adds Vercel's first-party scripts (`/_vercel/insights/script.js`, `/_vercel/speed-insights/script.js`) to Vercel deployments only, without the npm packages. Opt out with `NEXT_PUBLIC_ANALYTICS_DISABLED=1`.
5. Add the deployment's URLs to the Supabase redirect URLs (see [Auth URLs](#4-auth-urls)).
6. After deploying, check `/api/health` with the token (see below).

`next.config.js` sends the Content-Security-Policy and the other security headers on every route. Scripts and beacons are same-origin, apart from `vercel.live` for preview comments.

## Operations

### Health check

```bash
curl -s https://getpoliticon.app/api/health                                      # {"ok":true}, 200 or 503
curl -s -H "x-health-token: $HEALTHCHECK_TOKEN" https://getpoliticon.app/api/health   # per-dependency details
```

`ok` is true when the required variables are set and all of these checks pass:

- the database answers
- the rate limiter works
- the schema is current
- the Anthropic key can see the configured model
- that model has a price

The token adds:

- which variables are present
- the result of each check
- the Congress.gov and Open States sources (reported, but they don't fail `ok`: without them the feed falls back to items labelled unverified)

Point an uptime monitor at the public URL. It's rate-limited to 60 requests a minute per IP.

### AI controls

- **Kill switch**: set `AI_KILL_SWITCH=1` and redeploy. Every AI route answers `503 ai_disabled` and the rest of the app keeps working. `AI_DISABLED_FEATURES` turns off single features.
- **Spend caps**: `AI_GLOBAL_DAILY_USD` (rolling 24 hours, all users) and `AI_DAILY_LIMIT_<FEATURE>` (per user). Each call reserves its worst-case cost in `ai_usage` before it starts, and the real cost replaces it when the call ends. An interrupted call is charged its full output allowance. A model with no known price is refused.
- **Usage**: the `ai_usage` table holds model, tokens, cost, latency, stop reason and request id for each call:

  ```sql
  select feature, count(*), round(sum(cost_usd)::numeric, 2) as usd
  from public.ai_usage where created_at > now() - interval '24 hours'
  group by feature order by usd desc;
  ```

- **Feedback**: thumbs up/down and reports on AI output go to `ai_feedback`, with the model and prompt version for analyses.

### Product analytics

`lib/track.ts` sends a fixed list of events to Vercel Web Analytics:

`signup_completed`, `onboarding_completed`, `feed_refreshed`, `analysis_requested`, `analysis_ready`, `guide_message_sent`, `policy_dismissed`, `feedback_sent`

Properties are limited to fixed keys (`source`, `category`, `status`, `reading_mode`, `target`, `rating`), each with a fixed list of values. That rule is enforced by the types and again at runtime. Income, dollar amounts, profile answers, policy text, emails and free text can't be sent. Before anything leaves the browser, page URLs lose their query string and fragment, and `/impact/<id>` is reported as `/impact/[policyId]`.

The Privacy Policy (`app/privacy/page.tsx`, "Usage analytics") describes the page views, these events and their properties, and Speed Insights. When either list changes, update it and `PRIVACY_UPDATED` in `lib/legal.ts`.
