-- Profiles exactly as the old onboarding and Settings screens stored them.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'onboarding@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'settings@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'minor@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'junk@example.com');

-- Old onboarding codes, complete profile, dependents flag true.
update public.user_profiles set has_completed_onboarding = true, state = 'Ohio', city = 'Columbus',
  age_range = '23_30', education_stage = 'college_4yr', employment_status = 'employed_full',
  occupation_category = 'tech', income_range = '100k_plus', filing_status = 'head_of_household',
  housing_situation = 'own', debt_types = '{auto_loans,student_loans}', has_dependents = true,
  top_financial_concerns = '{healthcare,housing,taxes}'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Old Settings codes, five concerns (Settings allowed up to five).
update public.user_profiles set has_completed_onboarding = true, state = 'District of Columbia',
  age_range = '56_65', education_stage = 'doctorate', employment_status = 'disabled',
  occupation_category = 'government_military', income_range = 'over_250k', filing_status = 'qualifying_widow',
  housing_situation = 'own_outright', debt_types = '{none,medical}',
  top_financial_concerns = '{investment,savings,retirement,inflation,taxes}'
 where id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- A minor (no longer allowed) and unknown junk values.
update public.user_profiles set has_completed_onboarding = true, state = 'Texas', age_range = 'under_18',
  education_stage = 'middle_high', employment_status = 'student', occupation_category = 'not_applicable',
  income_range = 'under_25k', filing_status = 'single', housing_situation = 'family',
  debt_types = '{none}', top_financial_concerns = '{student_debt}'
 where id = 'aaaaaaaa-0000-0000-0000-000000000003';
update public.user_profiles set has_completed_onboarding = true, state = 'Narnia', age_range = 'ancient',
  income_range = 'lots', reading_mode = 'shouty', debt_types = '{gambling}', top_financial_concerns = '{dragons}'
 where id = 'aaaaaaaa-0000-0000-0000-000000000004';

-- Legacy text-only analyses, including one of the old sample policies.
insert into public.policy_analyses (user_id, policy_id, policy_title, analysis_text, dollar_impact, category)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'child-tax-credit', 'Child Tax Credit', 'Summary text', -1200, 'taxes'),
       ('aaaaaaaa-0000-0000-0000-000000000001', '3', 'Sample homebuyer credit', 'Fake', 15000, 'housing');
insert into public.analyzed_policies (user_id, policy_id, policy_title, net_annual_impact, analysis)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'existing-rich', 'Existing', 500, '{"plainEnglishSummary":"rich"}');
insert into public.policy_analyses (user_id, policy_id, policy_title, analysis_text, dollar_impact)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'existing-rich', 'Existing', 'stale copy', 999);
