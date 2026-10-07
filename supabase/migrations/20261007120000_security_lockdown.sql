-- Security lockdown and AI spend containment.
--
-- 1. newsletter_subscribers and rate_limits had RLS disabled, so anyone with the
--    public anon key could read/modify subscriber emails, user ids and raw IPs.
-- 2. check_rate_limit was callable by anon through PostgREST, so limits could be
--    reset or other users locked out.
-- 3. Server-generated tables (analyses, feeds) were writable by end users.
-- 4. Adds an AI usage ledger + atomic budget reservation so Claude spend has a hard ceiling.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Lock down tables only the server should touch
-- ---------------------------------------------------------------------------
-- Same definition as 20260626_rate_limits.sql, in case that was never applied.
create table if not exists public.rate_limits (
  id           text primary key,
  identifier   text        not null,
  route        text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  expires_at   timestamptz not null
);
create index if not exists rate_limits_expires_at_idx on public.rate_limits (expires_at);

alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Identifiers are now HMAC-hashed ("iph:..."); drop rows that stored raw IPs.
delete from public.rate_limits where identifier like 'ip:%';

-- ---------------------------------------------------------------------------
-- 2. check_rate_limit: service_role only, fixed search_path, argument guards
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_identifier     text,
  p_route          text,
  p_limit          int,
  p_window_seconds int
)
returns table(allowed boolean, current_count int, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_reset_at     timestamptz;
  v_id           text;
  v_count        int;
begin
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid window';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid limit';
  end if;
  if p_identifier is null or length(p_identifier) > 200 or p_route is null or length(p_route) > 64 then
    raise exception 'invalid key';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);
  v_id := p_identifier || ':' || p_route || ':' || extract(epoch from v_window_start)::bigint;

  insert into public.rate_limits (id, identifier, route, window_start, count, expires_at)
    values (v_id, p_identifier, p_route, v_window_start, 1, v_reset_at)
  on conflict (id) do update
    set count = public.rate_limits.count + 1
  returning count into v_count;

  delete from public.rate_limits where expires_at < now() - interval '1 hour';

  return query select (v_count <= p_limit), v_count, v_reset_at;
end;
$$;

revoke execute on function public.check_rate_limit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Server-generated tables: users may read their own rows, only the server
--    (service_role, after authenticating the user) may write them.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.analyzed_policies from anon, authenticated;
revoke insert, update, delete on public.policy_analyses   from anon, authenticated;
revoke insert, update, delete on public.user_policy_feed  from anon, authenticated;
revoke all on public.analyzed_policies, public.policy_analyses, public.user_policy_feed from anon;

-- Single-flight lock + negative cache for feed generation.
alter table public.user_policy_feed
  add column if not exists generating_until timestamptz,
  add column if not exists failed_until     timestamptz;

-- ---------------------------------------------------------------------------
-- 4. AI usage ledger and budget check
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id                 bigint generated always as identity primary key,
  user_id            uuid references auth.users(id) on delete set null,
  feature            text        not null,
  model              text        not null,
  input_tokens       int         not null default 0,
  output_tokens      int         not null default 0,
  cache_read_tokens  int         not null default 0,
  cache_write_tokens int         not null default 0,
  cost_usd           numeric(12, 6) not null default 0,
  stop_reason        text,
  request_id         text,
  latency_ms         int,
  ok                 boolean     not null default true,
  pending            boolean     not null default false,
  created_at         timestamptz not null default now()
);

create index if not exists ai_usage_user_feature_created_idx on public.ai_usage (user_id, feature, created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Atomically check the budget and reserve a ledger row for one Claude call.
-- A per-user advisory lock serializes concurrent requests, and the reserved
-- (pending) row counts toward the quota immediately, so parallel requests
-- can't all slip under the limit. Calls that failed on the provider side
-- (ok = false) don't count against the user's quota.
create or replace function public.reserve_ai_call(
  p_user_id          uuid,
  p_feature          text,
  p_model            text,
  p_user_daily_limit int,
  p_global_daily_usd numeric
)
returns table(allowed boolean, reason text, usage_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_global numeric;
  v_user   int;
  v_id     bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select coalesce(sum(cost_usd), 0) into v_global
    from public.ai_usage
   where created_at > now() - interval '24 hours';
  if v_global >= p_global_daily_usd then
    return query select false, 'global_budget'::text, null::bigint;
    return;
  end if;

  select count(*) into v_user
    from public.ai_usage
   where user_id = p_user_id
     and feature = p_feature
     and (ok or pending)
     and created_at > now() - interval '24 hours';
  if v_user >= p_user_daily_limit then
    return query select false, 'user_quota'::text, null::bigint;
    return;
  end if;

  insert into public.ai_usage (user_id, feature, model, pending)
    values (p_user_id, p_feature, p_model, true)
  returning id into v_id;

  return query select true, null::text, v_id;
end;
$$;

revoke execute on function public.reserve_ai_call(uuid, text, text, int, numeric) from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, text, text, int, numeric) to service_role;

-- Lets /api/health confirm this migration has been applied.
create or replace function public.schema_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '20261007120000'::text $$;

revoke execute on function public.schema_version() from public, anon, authenticated;
grant execute on function public.schema_version() to service_role;

-- Daily cost view for the owner (service_role / dashboard only).
create or replace view public.ai_usage_daily
with (security_invoker = true) as
select date_trunc('day', created_at) as day,
       feature,
       count(*)                    as calls,
       sum(input_tokens)           as input_tokens,
       sum(output_tokens)          as output_tokens,
       round(sum(cost_usd), 4)     as cost_usd
  from public.ai_usage
 group by 1, 2;

revoke all on public.ai_usage_daily from anon, authenticated;
