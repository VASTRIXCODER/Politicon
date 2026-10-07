-- Account lifecycle: keep the profile email in sync with auth, enforce data
-- retention, and drop tables that were never used.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Unused tables (no code reads or writes them)
-- ---------------------------------------------------------------------------
drop table if exists public.policy_alerts;
drop table if exists public.tracked_policies;

-- ---------------------------------------------------------------------------
-- Profile email follows the auth email after a confirmed email change
-- ---------------------------------------------------------------------------
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.user_profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute procedure public.sync_profile_email();

-- ---------------------------------------------------------------------------
-- chat_sessions: keep updated_at current; index the sidebar query
-- ---------------------------------------------------------------------------
drop trigger if exists chat_sessions_set_updated_at on public.chat_sessions;
create trigger chat_sessions_set_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();

create index if not exists chat_sessions_user_updated_idx on public.chat_sessions (user_id, updated_at desc);

alter table public.chat_sessions
  drop constraint if exists chat_sessions_title_length_check,
  drop constraint if exists chat_sessions_messages_size_check;
alter table public.chat_sessions
  add constraint chat_sessions_title_length_check check (title is null or length(title) <= 200) not valid,
  add constraint chat_sessions_messages_size_check check (pg_column_size(messages) < 500000) not valid;

-- ---------------------------------------------------------------------------
-- Retention (documented on /privacy):
--   - cached policy feeds: 30 days after their last refresh
--   - chats: 18 months after their last message
--   - AI usage ledger: 13 months
--   - accounts never confirmed: 7 days
--   - rate-limit counters: 1 hour after their window
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_data()
returns table(item text, deleted bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
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

-- Run nightly when pg_cron is enabled (Database → Extensions → pg_cron).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'politicon-retention';
    perform cron.schedule('politicon-retention', '17 3 * * *', 'select public.purge_expired_data()');
  end if;
end $$;

create or replace function public.schema_version()
returns text language sql immutable set search_path = ''
as $$ select '20261007150000'::text $$;
