-- Record execution of today's task blocks atomically. Commitments and breaks
-- are immutable here. Completing a task block completes its source task in
-- the same transaction; skipping leaves the task open for later planning.

create or replace function public.transition_day_plan_task_block(
  p_block_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_block public.schedule_blocks%rowtype;
  v_plan public.day_plans%rowtype;
  v_task public.tasks%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_block_id is null then
    raise exception 'ECHO_SCHEDULE_BLOCK_NOT_FOUND';
  end if;

  if p_status is null or p_status not in ('completed', 'skipped') then
    raise exception 'ECHO_INVALID_SCHEDULE_BLOCK_STATUS';
  end if;

  select schedule_block, day_plan
    into v_block, v_plan
    from public.schedule_blocks as schedule_block
    join public.day_plans as day_plan
      on day_plan.id = schedule_block.day_plan_id
    where schedule_block.id = p_block_id
      and day_plan.user_id = 'sebastian'
    for update of schedule_block, day_plan;

  if not found then
    raise exception 'ECHO_SCHEDULE_BLOCK_NOT_FOUND';
  end if;

  if v_plan.status <> 'generated'
    or v_plan.plan_date <> (v_now at time zone 'America/Chicago')::date
  then
    raise exception 'ECHO_SCHEDULE_BLOCK_NOT_CURRENT';
  end if;

  if v_block.source_type <> 'task' or v_block.source_id is null then
    raise exception 'ECHO_SCHEDULE_BLOCK_NOT_TASK';
  end if;

  if v_block.status = p_status then
    return jsonb_build_object('schedule_block', to_jsonb(v_block));
  end if;

  if v_block.status <> 'scheduled' then
    raise exception 'ECHO_INVALID_SCHEDULE_BLOCK_TRANSITION';
  end if;

  if p_status = 'completed' then
    select *
      into v_task
      from public.tasks
      where id = v_block.source_id
        and user_id = 'sebastian'
      for update;

    if not found then
      raise exception 'ECHO_SCHEDULE_BLOCK_TASK_NOT_FOUND';
    end if;

    update public.tasks
      set status = 'done',
          completed_at = coalesce(completed_at, v_now),
          updated_at = v_now
      where id = v_task.id;
  end if;

  update public.schedule_blocks
    set status = p_status,
        updated_at = v_now
    where id = v_block.id
    returning * into v_block;

  return jsonb_build_object('schedule_block', to_jsonb(v_block));
end;
$$;

revoke all privileges on function public.transition_day_plan_task_block(uuid, text)
  from public, anon, authenticated;

grant execute on function public.transition_day_plan_task_block(uuid, text)
  to service_role;
