-- Background AI generation.
--
-- A full analysis takes longer than a serverless request should block, so it
-- now runs in the background: the row is marked pending, the work finishes
-- after the response is sent, and the client follows the row's status. A
-- re-analysis keeps the previous result visible until the new one is ready.
-- Also adds a per-user cache for the dashboard insight.
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

create or replace function public.schema_version()
returns text language sql immutable set search_path = ''
as $$ select '20261008090000'::text $$;
