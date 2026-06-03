-- Persist the user's Simple/Expert reading-level preference
alter table public.user_profiles
  add column if not exists reading_mode text default 'expert';
