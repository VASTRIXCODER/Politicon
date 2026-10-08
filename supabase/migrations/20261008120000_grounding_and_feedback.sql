-- Grounding in official records, and feedback on AI output.
--
-- legislation_cache holds bill lists and official summaries fetched from
-- Congress.gov and Open States, shared across users (server-only).
-- ai_feedback records users' thumbs-up/down and reports on AI output.
--
-- Safe to re-run.

create table if not exists public.legislation_cache (
  key        text primary key,
  items      jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.legislation_cache enable row level security;
revoke all on public.legislation_cache from anon, authenticated;

create table if not exists public.ai_feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('analysis', 'feed_item', 'chat_reply', 'insight')),
  target_id   text not null check (length(target_id) <= 120),
  rating      text not null check (rating in ('up', 'down', 'not_relevant', 'report')),
  reason      text check (reason is null or length(reason) <= 1000),
  -- Provenance at the time of feedback (model / prompt version), for review.
  context     jsonb not null default '{}' check (pg_column_size(context) < 8000),
  created_at  timestamptz not null default now()
);

create index if not exists ai_feedback_user_created_idx on public.ai_feedback (user_id, created_at desc);
create index if not exists ai_feedback_target_idx on public.ai_feedback (target_type, target_id);

alter table public.ai_feedback enable row level security;
revoke all on public.ai_feedback from anon;
revoke update, delete on public.ai_feedback from authenticated;
grant select, insert on public.ai_feedback to authenticated;

drop policy if exists "Users read own feedback" on public.ai_feedback;
create policy "Users read own feedback" on public.ai_feedback
  for select using (auth.uid() = user_id);
drop policy if exists "Users add own feedback" on public.ai_feedback;
create policy "Users add own feedback" on public.ai_feedback
  for insert with check (auth.uid() = user_id);

create or replace function public.schema_version()
returns text language sql immutable set search_path = ''
as $$ select '20261008120000'::text $$;
