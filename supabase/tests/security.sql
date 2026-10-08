-- Security assertions for the Politicon schema. Run by supabase/tests/run.sh
-- against a database built from supabase/migrations. Any failure raises.

-- Run p_sql as an API role (with an optional auth.uid()) and check the outcome.
create function pg_temp.expect(p_role text, p_sub text, p_sql text, p_ok boolean) returns void
language plpgsql as $$
declare
  v_err text;
begin
  begin
    perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
    execute format('set local role %I', p_role);
    execute p_sql;
    v_err := null;
  exception when others then
    v_err := sqlerrm;
  end;
  execute 'reset role';
  if p_ok and v_err is not null then
    raise exception 'expected OK as %, got "%" for: %', p_role, v_err, p_sql;
  elsif not p_ok and v_err is null then
    raise exception 'expected DENIED as %, but it succeeded: %', p_role, p_sql;
  end if;
end $$;

create function pg_temp.denied(p_role text, p_sub text, p_sql text) returns void
language sql as $$ select pg_temp.expect(p_role, p_sub, p_sql, false) $$;
create function pg_temp.allowed(p_role text, p_sub text, p_sql text) returns void
language sql as $$ select pg_temp.expect(p_role, p_sub, p_sql, true) $$;

-- Fixtures
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
insert into public.newsletter_subscribers (email) values ('subscriber@example.com');
insert into public.analyzed_policies (user_id, policy_id, analysis)
  values ('11111111-1111-1111-1111-111111111111', 'us-hr-1', '{"plainEnglishSummary":"x"}');

do $$
declare
  r text;
  a constant text := '11111111-1111-1111-1111-111111111111';
  b constant text := '22222222-2222-2222-2222-222222222222';
begin
  foreach r in array array['anon', 'authenticated'] loop
    -- Server-only tables are invisible to API roles.
    perform pg_temp.denied(r, a, 'select email from public.newsletter_subscribers');
    perform pg_temp.denied(r, a, $q$insert into public.newsletter_subscribers(email) values ('evil@example.com')$q$);
    perform pg_temp.denied(r, a, 'delete from public.newsletter_subscribers');
    perform pg_temp.denied(r, a, 'select * from public.rate_limits');
    perform pg_temp.denied(r, a, 'delete from public.rate_limits');
    perform pg_temp.denied(r, a, 'select * from public.ai_usage');
    -- Server-only functions can't be called through PostgREST.
    perform pg_temp.denied(r, a, $q$select * from public.check_rate_limit('user:x', 'analyze', 1, 60)$q$);
    perform pg_temp.denied(r, a, format($q$select * from public.reserve_ai_call(%L, 'analyze', 'm', 10, 50)$q$, a));
    perform pg_temp.denied(r, a, 'select public.schema_version()');
    -- AI output is written only by the server.
    perform pg_temp.denied(r, a, format($q$insert into public.analyzed_policies(user_id, policy_id, analysis) values (%L, 'p2', '{}')$q$, a));
    perform pg_temp.denied(r, a, 'update public.analyzed_policies set net_annual_impact = 999');
    perform pg_temp.denied(r, a, format($q$insert into public.user_policy_feed(user_id, policies) values (%L, '[]')$q$, a));
  end loop;

  -- Users read only their own analyses.
  perform pg_temp.allowed('authenticated', a, 'select 1 from public.analyzed_policies');
  if (select count(*) from public.analyzed_policies) <> 1 then raise exception 'fixture missing'; end if;
end $$;

-- Row visibility under RLS (checked outside the helper so we can read counts).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true) \g /dev/null
do $$ begin
  if (select count(*) from public.analyzed_policies) <> 0 then
    raise exception 'user B can see user A''s analyses';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true) \g /dev/null
do $$ begin
  if (select count(*) from public.analyzed_policies) <> 1 then
    raise exception 'user A cannot see their own analysis';
  end if;
end $$;
commit;

-- Every table in public has RLS enabled.
do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity
  loop
    raise exception 'RLS is disabled on public.%', t;
  end loop;
end $$;

-- Budget reservation enforces the per-user quota and the global ceiling.
do $$
declare
  u constant uuid := '11111111-1111-1111-1111-111111111111';
  i int;
  allowed_count int := 0;
  ok boolean;
  why text;
begin
  for i in 1..5 loop
    select r.allowed into ok from public.reserve_ai_call(u, 'test', 'm', 3, 1000) r;
    if ok then allowed_count := allowed_count + 1; end if;
  end loop;
  if allowed_count <> 3 then raise exception 'quota 3 allowed % calls', allowed_count; end if;

  -- Provider failures don't count against the quota.
  update public.ai_usage set pending = false, ok = false where user_id = u and feature = 'test';
  select r.allowed into ok from public.reserve_ai_call(u, 'test', 'm', 3, 1000) r;
  if not ok then raise exception 'failed calls were counted against the quota'; end if;

  insert into public.ai_usage (user_id, feature, model, cost_usd) values (u, 'other', 'm', 2000);
  select r.allowed, r.reason into ok, why from public.reserve_ai_call(u, 'test2', 'm', 100, 1000) r;
  if ok or why <> 'global_budget' then raise exception 'global ceiling not enforced'; end if;
end $$;

-- Rate limiter allows exactly the limit per window.
do $$
declare
  n int := 0;
  ok boolean;
  i int;
begin
  for i in 1..4 loop
    select r.allowed into ok from public.check_rate_limit('user:test', 'analyze', 2, 60) r;
    if ok then n := n + 1; end if;
  end loop;
  if n <> 2 then raise exception 'rate limiter allowed % of 4 with limit 2', n; end if;
end $$;

-- Profiles: users may change only their name and reading mode directly; the
-- financial profile (and the onboarding flag) is written by the server.
do $$
declare
  a constant text := '11111111-1111-1111-1111-111111111111';
begin
  perform pg_temp.allowed('authenticated', a, format($q$update public.user_profiles set first_name = 'Ann', reading_mode = 'simple' where id = %L$q$, a));
  perform pg_temp.denied('authenticated', a, format($q$update public.user_profiles set income_range = 'over_500k' where id = %L$q$, a));
  perform pg_temp.denied('authenticated', a, format($q$update public.user_profiles set has_completed_onboarding = true where id = %L$q$, a));
  perform pg_temp.denied('authenticated', a, $q$insert into public.user_profiles (id) values ('33333333-3333-3333-3333-333333333333')$q$);
  perform pg_temp.denied('anon', null, 'select * from public.user_profiles');

  -- The vocabulary is enforced even for the server.
  begin
    update public.user_profiles set income_range = 'lots' where id = a::uuid;
    raise exception 'invalid income_range was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.user_profiles set has_completed_onboarding = true where id = a::uuid;
    raise exception 'incomplete profile was marked complete';
  exception when check_violation then null;
  end;
end $$;

-- policy_analyses is a read-only view over analyzed_policies that respects RLS.
do $$
declare
  a constant text := '11111111-1111-1111-1111-111111111111';
  b constant text := '22222222-2222-2222-2222-222222222222';
begin
  perform pg_temp.denied('authenticated', a, format($q$insert into public.policy_analyses (user_id, policy_id) values (%L, 'x')$q$, a));
  perform pg_temp.denied('anon', null, 'select * from public.policy_analyses');
  perform pg_temp.denied('anon', null, 'select * from public.analysis_totals()');
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true) \g /dev/null
do $$ begin
  if (select count(*) from public.policy_analyses) <> 0 then raise exception 'view leaks other users'' rows'; end if;
  if (select analysis_count from public.analysis_totals()) <> 0 then raise exception 'totals leak other users'' rows'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true) \g /dev/null
do $$ begin
  if (select count(*) from public.policy_analyses) <> 1 then raise exception 'view hides own rows'; end if;
  if (select analysis_count from public.analysis_totals()) <> 1 then raise exception 'totals miss own rows'; end if;
end $$;
commit;

-- Retention purge is server-only and removes only expired rows.
do $$
declare
  a constant uuid := '11111111-1111-1111-1111-111111111111';
begin
  perform pg_temp.denied('authenticated', a::text, 'select * from public.purge_expired_data()');

  insert into auth.users (id, email, created_at) values ('44444444-4444-4444-4444-444444444444', 'stale@example.com', now() - interval '30 days');
  insert into public.user_policy_feed (user_id, policies, updated_at) values (a, '[]', now() - interval '40 days');
  perform public.purge_expired_data();
  if exists (select 1 from auth.users where id = '44444444-4444-4444-4444-444444444444') then
    raise exception 'unconfirmed account was not purged';
  end if;
  if exists (select 1 from public.user_policy_feed where user_id = a) then
    raise exception 'expired feed was not purged';
  end if;
  if not exists (select 1 from auth.users where id = a) then
    raise exception 'purge removed a live account';
  end if;
end $$;

-- Profile email follows a confirmed auth email change.
do $$
begin
  update auth.users set email = 'new-a@example.com' where id = '11111111-1111-1111-1111-111111111111';
  if (select email from public.user_profiles where id = '11111111-1111-1111-1111-111111111111') <> 'new-a@example.com' then
    raise exception 'profile email not synced';
  end if;
end $$;

-- Background jobs: placeholder rows stay out of lists and totals; the insight
-- cache is server-written and readable only by its owner.
insert into public.analyzed_policies (user_id, policy_id, analysis, generation_status, generation_started_at)
values ('11111111-1111-1111-1111-111111111111', 'us-hr-2', '{}', 'pending', now());

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true) \g /dev/null
do $$ begin
  if exists (select 1 from public.policy_analyses where policy_id = 'us-hr-2') then
    raise exception 'pending placeholder shows in the analyses list';
  end if;
  if (select analysis_count from public.analysis_totals()) <> 1 then
    raise exception 'pending placeholder counted in totals';
  end if;
  if not exists (select 1 from public.analyzed_policies where policy_id = 'us-hr-2' and generation_status = 'pending') then
    raise exception 'owner cannot see their pending job';
  end if;
end $$;
commit;

do $$
declare
  a constant text := '11111111-1111-1111-1111-111111111111';
begin
  perform pg_temp.denied('authenticated', a, format($q$insert into public.ai_insights (user_id, cache_key, insight) values (%L, 'k', 'x')$q$, a));
  perform pg_temp.denied('authenticated', a, $q$update public.analyzed_policies set generation_status = 'ready'$q$);
  perform pg_temp.denied('anon', null, 'select * from public.ai_insights');
  begin
    update public.analyzed_policies set generation_status = 'done' where policy_id = 'us-hr-2';
    raise exception 'invalid generation_status accepted';
  exception when check_violation then null;
  end;
end $$;

-- Reservations carry an estimated cost that counts against the global ceiling
-- until the real cost replaces it; abandoned reservations stay counted.
do $$
declare
  u constant uuid := '22222222-2222-2222-2222-222222222222';
  ok boolean;
  why text;
  v_usage bigint;
begin
  delete from public.ai_usage;
  select r.allowed, r.usage_id into ok, v_usage from public.reserve_ai_call(u, 'analyze', 'm', 10, 1.00, 0.40) r;
  if not ok or (select cost_usd from public.ai_usage where ai_usage.id = v_usage) <> 0.40 then
    raise exception 'estimate not reserved';
  end if;
  select r.allowed into ok from public.reserve_ai_call(u, 'analyze', 'm', 10, 1.00, 0.40) r;
  if not ok then raise exception 'second in-flight call should still fit under $1'; end if;
  select r.allowed, r.reason into ok, why from public.reserve_ai_call(u, 'analyze', 'm', 10, 1.00, 0.40) r;
  if ok or why <> 'global_budget' then raise exception 'in-flight estimates ignored by the ceiling'; end if;

  -- The 5-argument call shape used by older code still works.
  select r.allowed into ok from public.reserve_ai_call(u, 'feed', 'm', 10, 100) r;
  if not ok then raise exception '5-argument call broke'; end if;

  update public.ai_usage set created_at = now() - interval '20 minutes' where pending;
  perform public.purge_expired_data();
  if exists (select 1 from public.ai_usage where pending) then raise exception 'abandoned reservation not closed'; end if;
  if (select sum(cost_usd) from public.ai_usage) < 0.80 then raise exception 'abandoned reservation lost its cost'; end if;
end $$;

-- Legislation cache is server-only; feedback is insert/read-own.
do $$
declare
  a constant text := '11111111-1111-1111-1111-111111111111';
  b constant text := '22222222-2222-2222-2222-222222222222';
begin
  perform pg_temp.denied('authenticated', a, 'select * from public.legislation_cache');
  perform pg_temp.denied('anon', null, $q$insert into public.legislation_cache (key, items) values ('federal', '[]')$q$);
  perform pg_temp.allowed('authenticated', a, format($q$insert into public.ai_feedback (user_id, target_type, target_id, rating) values (%L, 'analysis', 'us-hr-1', 'down')$q$, a));
  perform pg_temp.denied('authenticated', a, format($q$insert into public.ai_feedback (user_id, target_type, target_id, rating) values (%L, 'analysis', 'us-hr-1', 'down')$q$, b));
  perform pg_temp.denied('authenticated', a, $q$update public.ai_feedback set rating = 'up'$q$);
  perform pg_temp.denied('authenticated', a, $q$delete from public.ai_feedback$q$);
  perform pg_temp.denied('anon', null, 'select * from public.ai_feedback');
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true) \g /dev/null
do $$ begin
  if exists (select 1 from public.ai_feedback) then raise exception 'feedback visible to another user'; end if;
end $$;
commit;
