-- One vocabulary for the financial profile (see lib/profileOptions.ts).
--
-- Onboarding and Settings used to store different codes for the same field,
-- so Settings showed blanks and could write values the AI prompts didn't
-- understand. This maps every legacy code, clears anything unknown (the user
-- is asked again rather than guessed at), adds the dependents and consent
-- fields, and enforces the vocabulary with CHECK constraints.
--
-- Profile writes now go through the server (/api/profile), which validates
-- them; end users may only update their name and reading mode directly.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists dependents_count         int,
  add column if not exists dependent_age_bands      text[] not null default '{}',
  add column if not exists investments              text,
  add column if not exists home_value_band          text,
  add column if not exists financial_updated_at     timestamptz,
  add column if not exists onboarding_completed_at  timestamptz,
  add column if not exists terms_version            text,
  add column if not exists terms_accepted_at        timestamptz,
  add column if not exists ai_processing_consent_at timestamptz;

-- ---------------------------------------------------------------------------
-- Map legacy codes onto the current vocabulary
-- ---------------------------------------------------------------------------
-- Drop constraints first so a re-run can remap freely.
alter table public.user_profiles
  drop constraint if exists user_profiles_age_range_check,
  drop constraint if exists user_profiles_education_stage_check,
  drop constraint if exists user_profiles_employment_status_check,
  drop constraint if exists user_profiles_occupation_category_check,
  drop constraint if exists user_profiles_income_range_check,
  drop constraint if exists user_profiles_filing_status_check,
  drop constraint if exists user_profiles_housing_situation_check,
  drop constraint if exists user_profiles_state_check,
  drop constraint if exists user_profiles_debt_types_check,
  drop constraint if exists user_profiles_concerns_check,
  drop constraint if exists user_profiles_dependents_check,
  drop constraint if exists user_profiles_dependent_age_bands_check,
  drop constraint if exists user_profiles_investments_check,
  drop constraint if exists user_profiles_home_value_band_check,
  drop constraint if exists user_profiles_reading_mode_check,
  drop constraint if exists user_profiles_city_length_check,
  drop constraint if exists user_profiles_first_name_length_check,
  drop constraint if exists user_profiles_onboarding_complete_check;

update public.user_profiles set age_range = case age_range
    when '18_22' then '18_24' when '23_30' then '25_34' when '31_45' then '35_44'
    when '46_60' then '45_54' when '60_plus' then '65_plus'
    when '18_25' then '18_24' when '26_30' then '25_34' when '46_55' then '45_54' when '56_65' then '55_64'
    else age_range end;
update public.user_profiles set education_stage = case education_stage
    when 'middle_high' then 'high_school' when 'professional' then 'graduate' when 'doctorate' then 'graduate'
    else education_stage end;
update public.user_profiles set employment_status = 'unable_to_work' where employment_status = 'disabled';
update public.user_profiles set occupation_category = case occupation_category
    when 'tech_software' then 'tech' when 'healthcare_medical' then 'healthcare'
    when 'education_teaching' then 'education' when 'arts_entertainment' then 'creative_media'
    when 'retail_service' then 'service_retail' when 'government_military' then 'public_sector'
    else occupation_category end;
update public.user_profiles set income_range = case income_range
    when 'under_30k' then 'under_25k' when '30k_50k' then '25k_50k'
    when '100k_plus' then '100k_150k' when 'over_250k' then '250k_500k'
    else income_range end;
update public.user_profiles set filing_status = case filing_status
    when 'head_household' then 'head_of_household' when 'qualifying_widow' then 'qualifying_surviving_spouse'
    else filing_status end;
update public.user_profiles set housing_situation = case housing_situation
    when 'own' then 'own_mortgage' when 'family' then 'live_with_family'
    else housing_situation end;

update public.user_profiles set debt_types = coalesce((
    select array_agg(distinct case d when 'auto_loans' then 'auto_loan' else d end)
      from unnest(debt_types) d
     where (case d when 'auto_loans' then 'auto_loan' else d end) in
           ('mortgage','student_loans','auto_loan','credit_card','medical','personal_loan','business_loan','none')
  ), '{}');
-- "No debt" can't be combined with real debts.
update public.user_profiles set debt_types = array_remove(debt_types, 'none')
 where 'none' = any(debt_types) and cardinality(debt_types) > 1;

update public.user_profiles set top_financial_concerns = coalesce((
    select (array_agg(m order by ord))[1:3] from (
      select distinct on (m) m, ord from (
        select case c when 'healthcare' then 'healthcare_costs' when 'housing' then 'housing_costs'
                      when 'investment' then 'investments' else c end as m, ord
          from unnest(top_financial_concerns) with ordinality as t(c, ord)
      ) mapped
      where m in ('cost_of_living','housing_costs','healthcare_costs','student_debt','job_security',
                  'retirement','childcare','taxes','inflation','savings','investments')
      order by m, ord
    ) dedup
  ), '{}');

-- Anything still outside the vocabulary is cleared so the user is asked again
-- (this includes the 'under_18' age option, which is no longer offered).
update public.user_profiles set age_range = null
 where age_range not in ('18_24','25_34','35_44','45_54','55_64','65_plus');
update public.user_profiles set education_stage = null
 where education_stage not in ('high_school','some_college','college_2yr','college_4yr','graduate');
update public.user_profiles set employment_status = null
 where employment_status not in ('employed_full','employed_part','self_employed','unemployed','student','retired','unable_to_work');
update public.user_profiles set occupation_category = null
 where occupation_category not in ('tech','healthcare','education','business_finance','legal','creative_media',
                                   'construction_trades','service_retail','manufacturing','agriculture',
                                   'public_sector','other','not_applicable');
update public.user_profiles set income_range = null
 where income_range not in ('under_25k','25k_50k','50k_75k','75k_100k','100k_150k','150k_250k','250k_500k','over_500k');
update public.user_profiles set filing_status = null
 where filing_status not in ('single','married_joint','married_separate','head_of_household',
                             'qualifying_surviving_spouse','dependent','prefer_not');
update public.user_profiles set housing_situation = null
 where housing_situation not in ('rent','rent_assisted','own_mortgage','own_outright','live_with_family','campus','other');
update public.user_profiles set state = null
 where state is not null and state not in (
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
  'District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota',
  'Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey',
  'New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon',
  'Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah',
  'Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming');
update public.user_profiles set reading_mode = 'expert' where reading_mode is null or reading_mode not in ('simple','expert');
update public.user_profiles set city = left(city, 100) where length(city) > 100;
update public.user_profiles set first_name = left(first_name, 80) where length(first_name) > 80;

-- Dependents were never actually asked before: keep "unknown" (null count)
-- unless the old flag was true, in which case at least one is implied.
update public.user_profiles set dependents_count = 1
 where dependents_count is null and has_dependents is true;

-- A profile is only complete if every required answer is present.
update public.user_profiles set has_completed_onboarding = false
 where has_completed_onboarding
   and (state is null or age_range is null or education_stage is null or employment_status is null
        or occupation_category is null or income_range is null or filing_status is null
        or housing_situation is null or cardinality(debt_types) = 0 or cardinality(top_financial_concerns) = 0);
update public.user_profiles set onboarding_completed_at = coalesce(onboarding_completed_at, updated_at, now())
 where has_completed_onboarding and onboarding_completed_at is null;

-- ---------------------------------------------------------------------------
-- Enforce the vocabulary
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add constraint user_profiles_age_range_check
    check (age_range is null or age_range in ('18_24','25_34','35_44','45_54','55_64','65_plus')),
  add constraint user_profiles_education_stage_check
    check (education_stage is null or education_stage in ('high_school','some_college','college_2yr','college_4yr','graduate')),
  add constraint user_profiles_employment_status_check
    check (employment_status is null or employment_status in ('employed_full','employed_part','self_employed','unemployed','student','retired','unable_to_work')),
  add constraint user_profiles_occupation_category_check
    check (occupation_category is null or occupation_category in ('tech','healthcare','education','business_finance','legal','creative_media','construction_trades','service_retail','manufacturing','agriculture','public_sector','other','not_applicable')),
  add constraint user_profiles_income_range_check
    check (income_range is null or income_range in ('under_25k','25k_50k','50k_75k','75k_100k','100k_150k','150k_250k','250k_500k','over_500k')),
  add constraint user_profiles_filing_status_check
    check (filing_status is null or filing_status in ('single','married_joint','married_separate','head_of_household','qualifying_surviving_spouse','dependent','prefer_not')),
  add constraint user_profiles_housing_situation_check
    check (housing_situation is null or housing_situation in ('rent','rent_assisted','own_mortgage','own_outright','live_with_family','campus','other')),
  add constraint user_profiles_state_check
    check (state is null or state in (
      'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
      'District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
      'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota',
      'Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey',
      'New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon',
      'Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah',
      'Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming')),
  add constraint user_profiles_debt_types_check
    check (debt_types <@ array['mortgage','student_loans','auto_loan','credit_card','medical','personal_loan','business_loan','none']::text[]
           and (not ('none' = any(debt_types)) or cardinality(debt_types) = 1)),
  add constraint user_profiles_concerns_check
    check (top_financial_concerns <@ array['cost_of_living','housing_costs','healthcare_costs','student_debt','job_security','retirement','childcare','taxes','inflation','savings','investments']::text[]
           and cardinality(top_financial_concerns) <= 3),
  add constraint user_profiles_dependents_check
    check (dependents_count is null or (dependents_count between 0 and 10)),
  add constraint user_profiles_dependent_age_bands_check
    check (dependent_age_bands <@ array['under_5','5_12','13_17','18_plus']::text[]),
  add constraint user_profiles_investments_check
    check (investments is null or investments in ('none','retirement_only','brokerage','both')),
  add constraint user_profiles_home_value_band_check
    check (home_value_band is null or home_value_band in ('under_200k','200k_400k','400k_750k','750k_plus')),
  add constraint user_profiles_reading_mode_check
    check (reading_mode in ('simple','expert')),
  add constraint user_profiles_city_length_check
    check (city is null or length(city) <= 100),
  add constraint user_profiles_first_name_length_check
    check (first_name is null or length(first_name) <= 80),
  add constraint user_profiles_onboarding_complete_check
    check (not has_completed_onboarding or (
      state is not null and age_range is not null and education_stage is not null
      and employment_status is not null and occupation_category is not null and income_range is not null
      and filing_status is not null and housing_situation is not null
      and cardinality(debt_types) > 0 and cardinality(top_financial_concerns) > 0));

-- ---------------------------------------------------------------------------
-- Writes: the server validates and saves the financial profile; users may
-- only change their display name and reading mode directly.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.user_profiles from anon, authenticated;
revoke all on public.user_profiles from anon;
grant update (first_name, reading_mode) on public.user_profiles to authenticated;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- New accounts: copy the name (bounded) and the consent recorded at sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_profiles (id, email, first_name, terms_version, terms_accepted_at, ai_processing_consent_at)
  values (
    new.id,
    new.email,
    left(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), 80),
    left(new.raw_user_meta_data->>'terms_version', 20),
    case when new.raw_user_meta_data->>'terms_version' is not null then now() end,
    case when (new.raw_user_meta_data->>'ai_processing_consent') = 'true' then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.schema_version()
returns text language sql immutable set search_path = ''
as $$ select '20261007130000'::text $$;
