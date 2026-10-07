do $$
declare
  p record;
begin
  select * into p from public.user_profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if not (p.age_range = '25_34' and p.income_range = '100k_150k' and p.housing_situation = 'own_mortgage'
          and p.filing_status = 'head_of_household' and p.debt_types @> '{auto_loan,student_loans}'
          and p.top_financial_concerns = '{healthcare_costs,housing_costs,taxes}'
          and p.dependents_count = 1 and p.has_completed_onboarding) then
    raise exception 'legacy onboarding profile mapped wrong: %', row_to_json(p);
  end if;

  select * into p from public.user_profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if not (p.age_range = '55_64' and p.education_stage = 'graduate' and p.employment_status = 'unable_to_work'
          and p.occupation_category = 'public_sector' and p.income_range = '250k_500k'
          and p.filing_status = 'qualifying_surviving_spouse' and p.debt_types = '{medical}'
          and cardinality(p.top_financial_concerns) = 3 and p.top_financial_concerns[1] = 'investments'
          and p.dependents_count is null and p.has_completed_onboarding) then
    raise exception 'legacy settings profile mapped wrong: %', row_to_json(p);
  end if;

  select * into p from public.user_profiles where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  if not (p.age_range is null and p.education_stage = 'high_school' and p.housing_situation = 'live_with_family'
          and not p.has_completed_onboarding) then
    raise exception 'minor profile not reset: %', row_to_json(p);
  end if;

  select * into p from public.user_profiles where id = 'aaaaaaaa-0000-0000-0000-000000000004';
  if not (p.state is null and p.age_range is null and p.income_range is null and p.reading_mode = 'expert'
          and p.debt_types = '{}' and p.top_financial_concerns = '{}' and not p.has_completed_onboarding) then
    raise exception 'junk profile not cleared: %', row_to_json(p);
  end if;
end $$;

do $$
declare
  r record;
begin
  if (select relkind from pg_class where relname = 'policy_analyses' and relnamespace = 'public'::regnamespace) <> 'v' then
    raise exception 'policy_analyses should now be a view';
  end if;

  select * into r from public.analyzed_policies where policy_id = 'child-tax-credit';
  if r is null or r.net_annual_impact <> -1200 or not (r.analysis->>'legacy')::boolean
     or r.analysis->>'plainEnglishSummary' <> 'Summary text' then
    raise exception 'legacy analysis not backfilled: %', row_to_json(r);
  end if;

  if exists (select 1 from public.analyzed_policies where policy_id = '3') then
    raise exception 'sample-policy analysis not removed';
  end if;

  select * into r from public.analyzed_policies where policy_id = 'existing-rich';
  if r.net_annual_impact <> 500 then raise exception 'backfill overwrote an existing rich analysis'; end if;

  if (select dollar_impact from public.policy_analyses where policy_id = 'child-tax-credit') <> -1200 then
    raise exception 'view does not expose net impact as dollar_impact';
  end if;
end $$;
