-- Public aggregate figures for the landing page.
--
-- public_stats() returns the numbers the landing page may show, so they are
-- measured instead of written into the page:
--   members:  accounts whose email address is confirmed (unconfirmed and
--             abandoned sign-ups are not counted).
--   analyses: personal analyses with a finished result. A re-analysis in
--             progress keeps its previous result, so it still counts; a
--             placeholder whose first run hasn't finished does not.
--   contributors: distinct members who own those finished analyses. The app
--             publishes analyses and the median only when this is large
--             enough, so one busy account can't stand in for "the community".
--   median_abs_annual_impact: the median size of an estimate's net annual
--             impact, gains and costs alike (whole dollars). Each member counts
--             once: it is the median of each member's own median, so a member
--             with many analyses weighs no more than one with a single one.
-- Only aggregates leave the function. It reads auth.users, so it runs as its
-- owner and only the server (service role) may call it; the app also hides a
-- figure below a minimum count.
--
-- Safe to re-run. The drop lets a re-run replace an earlier version that
-- returned fewer columns (create or replace can't change the result type).

drop function if exists public.public_stats();

create function public.public_stats()
returns table(members bigint, analyses bigint, contributors bigint, median_abs_annual_impact numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with finished as (
    select user_id, net_annual_impact
      from public.analyzed_policies
     where analysis <> '{}'::jsonb
       and jsonb_typeof(analysis) = 'object'
  ),
  per_member as (
    select percentile_cont(0.5) within group (order by abs(net_annual_impact)) as median_abs
      from finished
     where net_annual_impact is not null
     group by user_id
  )
  select (select count(*) from auth.users where email_confirmed_at is not null),
         (select count(*) from finished),
         (select count(distinct user_id) from finished),
         (select round(percentile_cont(0.5) within group (order by median_abs)::numeric) from per_member);
$$;

revoke execute on function public.public_stats() from public, anon, authenticated;
grant execute on function public.public_stats() to service_role;

create or replace function public.schema_version()
returns text language sql immutable set search_path = ''
as $$ select '20261008150000'::text $$;
