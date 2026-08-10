-- Preserve the invariants Echo's authenticated server already enforces at the
-- HTTP and service layers. The hosted data was audited before this migration:
-- every constraint below validates without rewriting or deleting rows.

alter table public.conversations
  add constraint conversations_fixed_user_check
  check (user_id = 'sebastian') not valid;
alter table public.creative_works
  add constraint creative_works_fixed_user_check
  check (user_id = 'sebastian') not valid;
alter table public.daily_briefings
  add constraint daily_briefings_fixed_user_check
  check (user_id = 'sebastian') not valid;
alter table public.day_plans
  add constraint day_plans_fixed_user_check
  check (user_id = 'sebastian') not valid;
alter table public.memories
  add constraint memories_fixed_user_check
  check (user_id = 'sebastian') not valid;
alter table public.tasks
  add constraint tasks_fixed_user_check
  check (user_id = 'sebastian') not valid;
alter table public.thoughts
  add constraint thoughts_fixed_user_check
  check (user_id = 'sebastian') not valid;

alter table public.commitments
  add constraint commitments_time_order_check
  check (start_time < end_time) not valid;
alter table public.day_plans
  add constraint day_plans_time_order_check
  check (available_from < end_of_work_time) not valid;
alter table public.schedule_blocks
  add constraint schedule_blocks_time_order_check
  check (start_time < end_time) not valid;

alter table public.tasks
  add constraint tasks_estimated_minutes_range_check
  check (estimated_minutes is null or estimated_minutes between 1 and 1440) not valid;
alter table public.tasks
  add constraint tasks_completion_state_check
  check (
    (status = 'done' and completed_at is not null)
    or (status = 'open' and completed_at is null)
  ) not valid;

alter table public.day_plans
  add constraint day_plans_completed_check_in_valid_check
  check (
    check_in_completed_at is null
    or (
      energy between 1 and 10
      and stress between 1 and 10
      and sleep_quality in ('poor', 'okay', 'good')
      and has_eaten is not null
    )
  ) not valid;
alter table public.day_plans
  add constraint day_plans_generated_check_in_complete_check
  check (
    status <> 'generated'
    or (
      check_in_completed_at is not null
      and stress is not null
      and sleep_quality is not null
      and has_eaten is not null
    )
  ) not valid;

alter table public.tasks
  add constraint tasks_responsibility_area_values_check
  check (responsibility_area in (
    'texas-am', 'nrhh', 'ad-nrhh', 'tiktok', 'youtube', 'etsy',
    'echo', 'family-personal', 'health'
  )) not valid;
alter table public.commitments
  add constraint commitments_responsibility_area_values_check
  check (
    responsibility_area is null
    or responsibility_area in (
      'texas-am', 'nrhh', 'ad-nrhh', 'tiktok', 'youtube', 'etsy',
      'echo', 'family-personal', 'health'
    )
  ) not valid;
alter table public.schedule_blocks
  add constraint schedule_blocks_responsibility_area_values_check
  check (
    responsibility_area is null
    or responsibility_area in (
      'texas-am', 'nrhh', 'ad-nrhh', 'tiktok', 'youtube', 'etsy',
      'echo', 'family-personal', 'health'
    )
  ) not valid;

alter table public.schedule_blocks
  add constraint schedule_blocks_order_index_nonnegative_check
  check (order_index >= 0) not valid;

create unique index schedule_blocks_day_plan_id_order_key
  on public.schedule_blocks (day_plan_id, order_index);
drop index public.schedule_blocks_day_plan_id_order_idx;

alter table public.conversations validate constraint conversations_fixed_user_check;
alter table public.creative_works validate constraint creative_works_fixed_user_check;
alter table public.daily_briefings validate constraint daily_briefings_fixed_user_check;
alter table public.day_plans validate constraint day_plans_fixed_user_check;
alter table public.memories validate constraint memories_fixed_user_check;
alter table public.tasks validate constraint tasks_fixed_user_check;
alter table public.thoughts validate constraint thoughts_fixed_user_check;
alter table public.commitments validate constraint commitments_time_order_check;
alter table public.day_plans validate constraint day_plans_time_order_check;
alter table public.schedule_blocks validate constraint schedule_blocks_time_order_check;
alter table public.tasks validate constraint tasks_estimated_minutes_range_check;
alter table public.tasks validate constraint tasks_completion_state_check;
alter table public.day_plans validate constraint day_plans_completed_check_in_valid_check;
alter table public.day_plans validate constraint day_plans_generated_check_in_complete_check;
alter table public.tasks validate constraint tasks_responsibility_area_values_check;
alter table public.commitments validate constraint commitments_responsibility_area_values_check;
alter table public.schedule_blocks validate constraint schedule_blocks_responsibility_area_values_check;
alter table public.schedule_blocks validate constraint schedule_blocks_order_index_nonnegative_check;
