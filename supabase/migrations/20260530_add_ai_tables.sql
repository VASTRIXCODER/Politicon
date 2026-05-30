-- AI tables for Politicon: policy analyses and chat sessions

create table if not exists policy_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  policy_id text,
  policy_title text,
  analysis_text text,
  dollar_impact numeric,
  category text,
  created_at timestamptz default now(),
  unique(user_id, policy_id)
);

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  messages jsonb default '[]',
  policy_id text,
  created_at timestamptz default now()
);

alter table policy_analyses enable row level security;
alter table chat_sessions enable row level security;

create policy "Users can manage their own analyses" on policy_analyses
  for all using (auth.uid() = user_id);

create policy "Users can manage their own chat sessions" on chat_sessions
  for all using (auth.uid() = user_id);
