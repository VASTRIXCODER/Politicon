-- Seeded test accounts never count as public figures.
--
-- scripts/seed-accounts.mjs creates confirmed accounts for testing and tags
-- each one raw_app_meta_data.seeded = true. They are not people, so the
-- landing page must not count them: public_stats() now leaves them out of
-- members, and leaves their analyses out of analyses, contributors and the
-- median. (The masked member list drops them too: lib/server/memberDirectory.ts.)
-- Same columns, grants and security as 20261008150000.
--
-- Safe to re-run.

drop function if exists public.public_stats();

create function public.public_stats()
returns table(members bigint, analyses bigint, contributors bigint, median_abs_annual_impact numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with people as (
    select id, email_confirmed_at
      from auth.users
     where coalesce(raw_app_meta_data->>'seeded', '') <> 'true'
  ),
  finished as (
    select p.user_id, p.net_annual_impact
      from public.analyzed_policies p
      join people on people.id = p.user_id
     where p.analysis <> '{}'::jsonb
       and jsonb_typeof(p.analysis) = 'object'
  ),
  per_member as (
    select percentile_cont(0.5) within group (order by abs(net_annual_impact)) as median_abs
      from finished
     where net_annual_impact is not null
     group by user_id
  )
  select (select count(*) from people where email_confirmed_at is not null),
         (select count(*) from finished),
         (select count(distinct user_id) from finished),
         (select round(percentile_cont(0.5) within group (order by median_abs)::numeric) from per_member);
$$;

revoke execute on function public.public_stats() from public, anon, authenticated;
grant execute on function public.public_stats() to service_role;

create or replace function public.schema_version()
returns text language sql immutable set search_path = ''
as $$ select '20261019090000'::text $$;
