-- Politicon: Policy Discovery + Full Analysis engine tables
-- Adds user_policy_feed (cached personalized feed) and analyzed_policies
-- (rich structured per-policy financial analysis). Both are safe to re-run.

-- ============================================================
-- user_policy_feed : one cached feed per user (24h TTL handled in app)
-- ============================================================
create table if not exists public.user_policy_feed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  policies jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- analyzed_policies : full structured analysis per (user, policy)
-- The complete analysis object lives in `analysis` (jsonb); the flat
-- columns are denormalized for fast list/aggregate queries + realtime.
-- ============================================================
create table if not exists public.analyzed_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  policy_id text not null,
  policy_title text,
  bill_number text,
  status text,
  category text,
  direction text,
  confidence_score integer default 0,
  net_annual_impact numeric default 0,
  net_monthly_impact numeric default 0,
  analysis jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, policy_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.user_policy_feed enable row level security;
alter table public.analyzed_policies enable row level security;

drop policy if exists "Users manage own policy feed" on public.user_policy_feed;
drop policy if exists "Users manage own analyzed policies" on public.analyzed_policies;

create policy "Users manage own policy feed" on public.user_policy_feed
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own analyzed policies" on public.analyzed_policies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Realtime: ensure the analysis tables broadcast changes so the
-- dashboard net-impact figure updates live. Guarded so re-runs
-- don't error when the table is already in the publication.
-- ============================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.analyzed_policies;
  exception when duplicate_object then null; when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.policy_analyses;
  exception when duplicate_object then null; when others then null;
  end;
end $$;

-- Helpful indexes
create index if not exists analyzed_policies_user_idx on public.analyzed_policies(user_id);
create index if not exists analyzed_policies_user_policy_idx on public.analyzed_policies(user_id, policy_id);
