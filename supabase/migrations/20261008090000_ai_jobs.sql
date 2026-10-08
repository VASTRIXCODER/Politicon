-- Background AI generation.
--
-- A full analysis takes longer than a serverless request should block, so it
-- now runs in the background: the row is marked pending, the work finishes
-- after the response is sent, and the client follows the row's status. A
-- re-analysis keeps the previous result visible until the new one is ready.
-- Also adds a per-user cache for the dashboard insight, and reserves an
-- estimated cost with every AI call so in-flight calls count against the
-- spend ceiling.
--
-- Safe to re-run.

alter table public.analyzed_policies
  add column if not exists generation_status     text not null default 'ready',
  add column if not exists generation_error      text,
  add column if not exists generation_started_at timestamptz;

alter table public.analyzed_policies drop constraint if exists analyzed_policies_generation_status_check;
alter table public.analyzed_policies
  add constraint analyzed_policies_generation_status_check
    check (generation_status in ('pending', 'ready', 'failed'));

-- Placeholder rows (no analysis yet) are not shown in lists or totals.
create or replace view public.policy_analyses
with (security_invoker = true) as
select id,
       user_id,
       policy_id,
       policy_title,
       coalesce(analysis->>'plainEnglishSummary', '') as analysis_text,
       net_annual_impact as dollar_impact,
       category,
       status,
       created_at,
       updated_at
  from public.analyzed_policies
 where analysis <> '{}'::jsonb;

revoke all on public.policy_analyses from anon;
revoke insert, update, delete on public.policy_analyses from authenticated;
grant select on public.policy_analyses to authenticated;

create or replace function public.analysis_totals()
returns table(analysis_count bigint, net_annual numeric, enacted_annual numeric, pending_annual numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*),
         coalesce(sum(net_annual_impact), 0),
         coalesce(sum(net_annual_impact) filter (where status = 'enacted'), 0),
         coalesce(sum(net_annual_impact) filter (where status is distinct from 'enacted'), 0)
    from public.analyzed_policies
   where user_id = auth.uid()
     and analysis <> '{}'::jsonb;
$$;

revoke execute on function public.analysis_totals() from public, anon;
grant execute on function public.analysis_totals() to authenticated;

-- Dashboard insight cache: regenerated only when the set of analyses changes.
create table if not exists public.ai_insights (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  cache_key  text not null,
  insight    text not null,
  created_at timestamptz not null default now()
);

alter table public.ai_insights enable row level security;
revoke all on public.ai_insights from anon;
revoke insert, update, delete on public.ai_insights from authenticated;
drop policy if exists "Users read own insight" on public.ai_insights;
create policy "Users read own insight" on public.ai_insights
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Budget reservations carry a worst-case cost estimate, so calls still in
-- flight count against the global ceiling; the real cost replaces it when
-- the call finishes. (Replaces the 5-argument version; the new parameter has
-- a default, so existing callers keep working.)
-- ---------------------------------------------------------------------------
drop function if exists public.reserve_ai_call(uuid, text, text, int, numeric);

create or replace function public.reserve_ai_call(
  p_user_id          uuid,
  p_feature          text,
  p_model            text,
  p_user_daily_limit int,
  p_global_daily_usd numeric,
  p_estimated_usd    numeric default 0
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
  if v_global + greatest(coalesce(p_estimated_usd, 0), 0) > p_global_daily_usd then
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

  insert into public.ai_usage (user_id, feature, model, pending, cost_usd)
    values (p_user_id, p_feature, p_model, true, greatest(coalesce(p_estimated_usd, 0), 0))
  returning id into v_id;

  return query select true, null::text, v_id;
end;
$$;

revoke execute on function public.reserve_ai_call(uuid, text, text, int, numeric, numeric) from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, text, text, int, numeric, numeric) to service_role;

-- A reservation whose worker died (e.g. the function was killed) is closed
-- out by the nightly purge, keeping its estimated cost on the books.
create or replace function public.purge_expired_data()
returns table(item text, deleted bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  update public.ai_usage set pending = false, ok = true, stop_reason = coalesce(stop_reason, 'abandoned')
   where pending and created_at < now() - interval '15 minutes';
  get diagnostics n = row_count; item := 'abandoned_ai_calls'; deleted := n; return next;

  delete from public.user_policy_feed where coalesce(updated_at, created_at) < now() - interval '30 days';
  get diagnostics n = row_count; item := 'user_policy_feed'; deleted := n; return next;

  delete from public.chat_sessions where coalesce(updated_at, created_at) < now() - interval '18 months';
  get diagnostics n = row_count; item := 'chat_sessions'; deleted := n; return next;

  delete from public.ai_usage where created_at < now() - interval '13 months';
  get diagnostics n = row_count; item := 'ai_usage'; deleted := n; return next;

  delete from public.rate_limits where expires_at < now() - interval '1 hour';
  get diagnostics n = row_count; item := 'rate_limits'; deleted := n; return next;

  delete from auth.users where email_confirmed_at is null and created_at < now() - interval '7 days';
  get diagnostics n = row_count; item := 'unconfirmed_users'; deleted := n; return next;
end;
$$;

revoke execute on function public.purge_expired_data() from public, anon, authenticated;
grant execute on function public.purge_expired_data() to service_role;

create or replace function public.schema_version()
returns text language sql immutable set search_path = ''
as $$ select '20261008090000'::text $$;
