alter table public.day_plans
  add column stress smallint null,
  add column sleep_quality text null,
  add column has_eaten boolean null,
  add column check_in_notes text null,
  add column check_in_completed_at timestamptz null;

alter table public.day_plans
  add constraint day_plans_stress_range
    check (stress is null or stress between 1 and 10),
  add constraint day_plans_sleep_quality_values
    check (sleep_quality is null or sleep_quality in ('poor', 'okay', 'good')),
  add constraint day_plans_check_in_notes_length
    check (check_in_notes is null or char_length(check_in_notes) <= 1000);
