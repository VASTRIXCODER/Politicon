-- One source of truth for analyses.
--
-- Analyses used to be written twice: the full structured result into
-- analyzed_policies and a text copy into policy_analyses. The two drifted, and
-- the dashboard and /impact disagreed. analyzed_policies is now the only
-- table; policy_analyses becomes a read-only view with the same columns so
-- existing readers keep working. Also adds provenance (which model, prompt and
-- profile produced an analysis), an all-rows totals function, integrity
-- checks, and removes analyses of the old sample (fictional) policies.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Provenance
-- ---------------------------------------------------------------------------
alter table public.analyzed_policies
  add column if not exists model            text,
  add column if not exists prompt_version   text,
  add column if not exists schema_version   int,
  add column if not exists profile_snapshot jsonb,
  -- user_profiles.financial_updated_at at the time of analysis; an older
  -- value than the profile's current one means the analysis is stale.
  add column if not exists profile_version  timestamptz;

-- ---------------------------------------------------------------------------
-- Fold the legacy text table into analyzed_policies, then replace it
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_class where relname = 'policy_analyses' and relnamespace = 'public'::regnamespace and relkind = 'r') then
    insert into public.analyzed_policies
      (user_id, policy_id, policy_title, category, net_annual_impact, net_monthly_impact, analysis, created_at, updated_at)
    select pa.user_id, pa.policy_id, pa.policy_title, pa.category,
           coalesce(pa.dollar_impact, 0), round(coalesce(pa.dollar_impact, 0) / 12),
           -- Marked legacy: the detail page offers to re-run these for the full breakdown.
           jsonb_build_object('plainEnglishSummary', left(coalesce(pa.analysis_text, ''), 2000), 'legacy', true),
           pa.created_at, coalesce(pa.updated_at, pa.created_at)
      from public.policy_analyses pa
     where pa.user_id is not null and pa.policy_id is not null
       and not exists (select 1 from public.analyzed_policies ap
                        where ap.user_id = pa.user_id and ap.policy_id = pa.policy_id);

    begin
      alter publication supabase_realtime drop table public.policy_analyses;
    exception when others then null;
    end;
    drop table public.policy_analyses;
  end if;
end $$;

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
  from public.analyzed_policies;

revoke all on public.policy_analyses from anon;
revoke insert, update, delete on public.policy_analyses from authenticated;
grant select on public.policy_analyses to authenticated;

-- ---------------------------------------------------------------------------
-- Remove analyses of the sample policies that used to be on /policies
-- ---------------------------------------------------------------------------
delete from public.analyzed_policies where policy_id in ('1', '2', '3', '4', '5', '6', '7', '8');

-- ---------------------------------------------------------------------------
-- Integrity (NOT VALID: enforced for new writes without failing on old rows)
-- ---------------------------------------------------------------------------
alter table public.analyzed_policies
  drop constraint if exists analyzed_policies_direction_check,
  drop constraint if exists analyzed_policies_confidence_check,
  drop constraint if exists analyzed_policies_status_check,
  drop constraint if exists analyzed_policies_policy_id_check,
  drop constraint if exists analyzed_policies_analysis_size_check;
alter table public.analyzed_policies
  add constraint analyzed_policies_direction_check
    check (direction is null or direction in ('positive', 'negative', 'neutral')) not valid,
  add constraint analyzed_policies_confidence_check
    check (confidence_score is null or confidence_score between 0 and 100) not valid,
  add constraint analyzed_policies_status_check
    check (status is null or status in ('proposed', 'passed', 'enacted', 'repealed', 'rejected')) not valid,
  add constraint analyzed_policies_policy_id_check
    check (policy_id ~ '^[a-z0-9][a-z0-9-]{0,79}$') not valid,
  add constraint analyzed_policies_analysis_size_check
    check (pg_column_size(analysis) < 200000) not valid;

alter table public.analyzed_policies alter column user_id set not null;

-- ---------------------------------------------------------------------------
-- Indexes: the unique (user_id, policy_id) constraint already covers lookups.
-- ---------------------------------------------------------------------------
drop index if exists public.analyzed_policies_user_idx;
drop index if exists public.analyzed_policies_user_policy_idx;
create index if not exists analyzed_policies_user_updated_idx
  on public.analyzed_policies (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Totals across ALL of the caller's analyses (lists only show the latest few)
-- ---------------------------------------------------------------------------
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
   where user_id = auth.uid();
$$;

revoke execute on function public.analysis_totals() from public, anon;
grant execute on function public.analysis_totals() to authenticated;

-- Realtime for the dashboard comes from analyzed_policies itself.
do $$
begin
  alter publication supabase_realtime add table public.analyzed_policies;
exception when duplicate_object then null; when others then null;
end $$;

create or replace function public.schema_version()
returns text language sql immutable set search_path = ''
as $$ select '20261007140000'::text $$;
