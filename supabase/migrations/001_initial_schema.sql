-- Enable UUID extension
extension if not exists "uuid-ossp";

-- User profiles table
create table if not exists public.user_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  first_name text,
  has_completed_onboarding boolean default false,

  -- Stage 1: Core Context
  country text default 'United States',
  state text,
  city text,
  age_range text,
  education_stage text,

  -- Stage 2: Economic Position
  employment_status text,
  occupation_category text,
  income_range text,
  filing_status text,

  -- Stage 3: Life Situation
  housing_situation text,
  debt_types text[] default '{}',
  has_dependents boolean default false,
  top_financial_concerns text[] default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tracked policies table
create table if not exists public.tracked_policies (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.user_profiles(id) on delete cascade,
  policy_id text not null,
  policy_title text not null,
  policy_category text,
  analysis_result text,
  net_impact_monthly numeric,
  net_impact_annual numeric,
  tracked_at timestamptz default now()
);

-- Policy alerts
create table if not exists public.policy_alerts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.user_profiles(id) on delete cascade,
  policy_id text not null,
  policy_title text not null,
  alert_type text check (alert_type in ('status_change', 'new_analysis', 'impact_update')),
  message text,
  read boolean default false,
  created_at timestamptz default now()
);

-- Newsletter subscribers
create table if not exists public.newsletter_subscribers (
  id uuid default uuid_generate_v4() primary key,
  email text unique not null,
  subscribed_at timestamptz default now(),
  state text,
  income_range text
);

-- Row Level Security
alter table public.user_profiles enable row level security;
alter table public.tracked_policies enable row level security;
alter table public.policy_alerts enable row level security;

create policy "Users can view own profile" on public.user_profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.user_profiles
  for all using (auth.uid() = id);

create policy "Users can manage own tracked policies" on public.tracked_policies
  for all using (auth.uid() = user_id);

create policy "Users can view own alerts" on public.policy_alerts
  for all using (auth.uid() = user_id);

-- Trigger to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, first_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
