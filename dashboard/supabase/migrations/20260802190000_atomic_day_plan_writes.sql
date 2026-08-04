create or replace function public.save_day_plan_check_in(
  p_user_id text,
  p_plan_date date,
  p_available_from timestamptz,
  p_energy integer,
  p_stress integer,
  p_sleep_quality text,
  p_has_eaten boolean,
  p_check_in_notes text,
  p_check_in_completed_at timestamptz,
  p_end_of_work_time timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan public.day_plans%rowtype;
  v_changed boolean;
begin
  if p_energy is null or p_energy not between 1 and 10
    or p_stress is null or p_stress not between 1 and 10
    or p_sleep_quality is null or p_sleep_quality not in ('poor', 'okay', 'good')
    or p_has_eaten is null
    or p_check_in_completed_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'ECHO_INVALID_CHECK_IN';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id || ':' || p_plan_date::text, 0)
  );

  select *
  into v_plan
  from public.day_plans
  where user_id = p_user_id
    and plan_date = p_plan_date
  for update;

  if found then
    v_changed :=
      v_plan.available_from is distinct from p_available_from
      or v_plan.energy is distinct from p_energy
      or v_plan.stress is distinct from p_stress
      or v_plan.sleep_quality is distinct from p_sleep_quality
      or v_plan.has_eaten is distinct from p_has_eaten
      or v_plan.check_in_notes is distinct from p_check_in_notes
      or v_plan.end_of_work_time is distinct from p_end_of_work_time;

    if v_changed then
      update public.day_plans
      set
        available_from = p_available_from,
        energy = p_energy,
        stress = p_stress,
        sleep_quality = p_sleep_quality,
        has_eaten = p_has_eaten,
        check_in_notes = p_check_in_notes,
        check_in_completed_at = p_check_in_completed_at,
        end_of_work_time = p_end_of_work_time,
        status = 'setup',
        updated_at = now()
      where id = v_plan.id
      returning * into v_plan;

      delete from public.schedule_blocks
      where day_plan_id = v_plan.id;
    end if;
  else
    insert into public.day_plans (
      user_id,
      plan_date,
      available_from,
      energy,
      stress,
      sleep_quality,
      has_eaten,
      check_in_notes,
      check_in_completed_at,
      end_of_work_time,
      status,
      updated_at
    )
    values (
      p_user_id,
      p_plan_date,
      p_available_from,
      p_energy,
      p_stress,
      p_sleep_quality,
      p_has_eaten,
      p_check_in_notes,
      p_check_in_completed_at,
      p_end_of_work_time,
      'setup',
      now()
    )
    returning * into v_plan;
  end if;

  return to_jsonb(v_plan);
end;
$$;

create or replace function public.replace_day_plan_schedule(
  p_user_id text,
  p_day_plan_id text,
  p_expected_check_in_completed_at timestamptz,
  p_blocks jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan public.day_plans%rowtype;
  v_blocks jsonb;
begin
  select *
  into v_plan
  from public.day_plans
  where id::text = p_day_plan_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ECHO_DAY_PLAN_NOT_FOUND';
  end if;

  if v_plan.check_in_completed_at is distinct from p_expected_check_in_completed_at then
    raise exception using
      errcode = 'P0001',
      message = 'ECHO_CHECK_IN_CHANGED';
  end if;

  delete from public.schedule_blocks
  where day_plan_id = v_plan.id;

  insert into public.schedule_blocks (
    day_plan_id,
    source_type,
    source_id,
    title,
    responsibility_area,
    start_time,
    end_time,
    status,
    order_index
  )
  select
    v_plan.id,
    block.source_type,
    block.source_id,
    block.title,
    block.responsibility_area,
    block.start_time,
    block.end_time,
    block.status,
    block.order_index
  from jsonb_populate_recordset(
    null::public.schedule_blocks,
    coalesce(p_blocks, '[]'::jsonb)
  ) as block;

  update public.day_plans
  set status = 'generated', updated_at = now()
  where id = v_plan.id
  returning * into v_plan;

  select coalesce(
    jsonb_agg(to_jsonb(schedule_block) order by schedule_block.order_index),
    '[]'::jsonb
  )
  into v_blocks
  from public.schedule_blocks as schedule_block
  where schedule_block.day_plan_id = v_plan.id;

  return jsonb_build_object(
    'day_plan', to_jsonb(v_plan),
    'schedule_blocks', v_blocks
  );
end;
$$;

revoke all on function public.save_day_plan_check_in(
  text, date, timestamptz, integer, integer, text, boolean, text, timestamptz, timestamptz
) from public;
revoke all on function public.replace_day_plan_schedule(
  text, text, timestamptz, jsonb
) from public;

grant execute on function public.save_day_plan_check_in(
  text, date, timestamptz, integer, integer, text, boolean, text, timestamptz, timestamptz
) to anon, authenticated;
grant execute on function public.replace_day_plan_schedule(
  text, text, timestamptz, jsonb
) to anon, authenticated;
