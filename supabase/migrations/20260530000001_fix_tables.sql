-- Fix tables: ensure all required tables + RLS policies exist safely

-- policy_analyses
create table if not exists policy_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  policy_id text not null,
  policy_title text,
  analysis_text text,
  dollar_impact numeric default 0,
  category text,
  created_at timestamptz default now(),
  unique(user_id, policy_id)
);

-- chat_sessions
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  messages jsonb default '[]',
  policy_id text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table policy_analyses enable row level security;
alter table chat_sessions enable row level security;

-- Drop and recreate policies to avoid conflicts
drop policy if exists "Users can manage their own analyses" on policy_analyses;
drop policy if exists "Users can manage their own chat sessions" on chat_sessions;

create policy "Users can manage their own analyses" on policy_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage their own chat sessions" on chat_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
