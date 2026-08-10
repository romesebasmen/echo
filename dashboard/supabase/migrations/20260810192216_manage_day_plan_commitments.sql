-- Add and remove fixed commitments through short, service-role-only
-- transactions. A commitment is an authoritative planning input, so every
-- mutation also advances the existing check_in_completed_at revision token,
-- resets the plan to setup, and removes the now-stale schedule atomically.

alter table public.commitments
  add constraint commitments_title_valid_check
  check (char_length(btrim(title)) between 1 and 200) not valid;

alter table public.commitments
  validate constraint commitments_title_valid_check;

create or replace function public.create_day_plan_commitment(
  p_day_plan_id uuid,
  p_title text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_responsibility_area text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_plan public.day_plans%rowtype;
  v_commitment public.commitments%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_day_plan_id is null then
    raise exception 'ECHO_DAY_PLAN_NOT_FOUND';
  end if;

  if p_title is null
    or char_length(btrim(p_title)) not between 1 and 200
    or p_start_time is null
    or p_end_time is null
    or p_start_time >= p_end_time
  then
    raise exception 'ECHO_INVALID_COMMITMENT';
  end if;

  select *
    into v_plan
    from public.day_plans
    where id = p_day_plan_id
      and user_id = 'sebastian'
    for update;

  if not found then
    raise exception 'ECHO_DAY_PLAN_NOT_FOUND';
  end if;

  if (p_start_time at time zone 'America/Chicago')::date <> v_plan.plan_date
    or (p_end_time at time zone 'America/Chicago')::date <> v_plan.plan_date
  then
    raise exception 'ECHO_COMMITMENT_WRONG_DAY';
  end if;

  insert into public.commitments (
    day_plan_id,
    title,
    start_time,
    end_time,
    responsibility_area
  )
  values (
    v_plan.id,
    btrim(p_title),
    p_start_time,
    p_end_time,
    p_responsibility_area
  )
  returning * into v_commitment;

  update public.day_plans
    set status = 'setup',
        check_in_completed_at = v_now,
        updated_at = v_now
    where id = v_plan.id;

  delete from public.schedule_blocks
    where day_plan_id = v_plan.id;

  return to_jsonb(v_commitment);
end;
$$;

create or replace function public.delete_day_plan_commitment(
  p_day_plan_id uuid,
  p_commitment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_plan public.day_plans%rowtype;
  v_commitment public.commitments%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_day_plan_id is null then
    raise exception 'ECHO_DAY_PLAN_NOT_FOUND';
  end if;

  if p_commitment_id is null then
    raise exception 'ECHO_COMMITMENT_NOT_FOUND';
  end if;

  -- Match every day-plan write path's plan-first lock order.
  select *
    into v_plan
    from public.day_plans
    where id = p_day_plan_id
      and user_id = 'sebastian'
    for update;

  if not found then
    raise exception 'ECHO_DAY_PLAN_NOT_FOUND';
  end if;

  delete from public.commitments
    where id = p_commitment_id
      and day_plan_id = v_plan.id
    returning * into v_commitment;

  if not found then
    raise exception 'ECHO_COMMITMENT_NOT_FOUND';
  end if;

  update public.day_plans
    set status = 'setup',
        check_in_completed_at = v_now,
        updated_at = v_now
    where id = v_plan.id;

  delete from public.schedule_blocks
    where day_plan_id = v_plan.id;

  return to_jsonb(v_commitment);
end;
$$;

revoke all privileges on function public.create_day_plan_commitment(
  uuid, text, timestamptz, timestamptz, text
) from public, anon, authenticated;

revoke all privileges on function public.delete_day_plan_commitment(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.create_day_plan_commitment(
  uuid, text, timestamptz, timestamptz, text
) to service_role;

grant execute on function public.delete_day_plan_commitment(uuid, uuid)
  to service_role;
