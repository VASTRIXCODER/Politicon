-- Add updated_at to policy_analyses and chat_sessions
alter table public.policy_analyses
  add column if not exists updated_at timestamptz default now();

alter table public.chat_sessions
  add column if not exists updated_at timestamptz default now();

-- Back-fill existing rows
update public.policy_analyses set updated_at = created_at where updated_at is null;
update public.chat_sessions   set updated_at = created_at where updated_at is null;
