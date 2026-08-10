-- Make one chat turn's memory extraction atomic and idempotent. The run table
-- stores only the source message ID and outcome count; no prompt or message
-- content is duplicated.

create table public.memory_extraction_runs (
  source_message_id uuid primary key
    references public.messages(id) on delete cascade,
  user_id text not null default 'sebastian',
  applied_count integer not null default 0,
  completed_at timestamptz not null default statement_timestamp(),
  constraint memory_extraction_runs_user_id_check
    check (user_id = 'sebastian'),
  constraint memory_extraction_runs_applied_count_check
    check (applied_count between 0 and 10)
);

alter table public.memory_extraction_runs enable row level security;
alter table public.memory_extraction_runs force row level security;

revoke all privileges on table public.memory_extraction_runs
  from public, anon, authenticated;

create or replace function public.apply_memory_extraction(
  p_source_message_id uuid,
  p_operations jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_operation jsonb;
  v_action text;
  v_target_id uuid;
  v_category text;
  v_title text;
  v_description text;
  v_importance text;
  v_confidence text;
  v_target_ids uuid[] := array[]::uuid[];
  v_applied_count integer := 0;
  v_row_count integer;
begin
  if p_source_message_id is null then
    raise exception 'Source message ID is required';
  end if;

  if not exists (
    select 1
    from public.messages as message
    join public.conversations as conversation
      on conversation.id = message.conversation_id
    where message.id = p_source_message_id
      and conversation.user_id = 'sebastian'
  ) then
    raise exception 'Source message is not owned by the Echo user';
  end if;

  if p_operations is null
    or jsonb_typeof(p_operations) <> 'array'
    or jsonb_array_length(p_operations) > 10
  then
    raise exception 'Memory operations must be an array of at most 10 items';
  end if;

  insert into public.memory_extraction_runs (
    source_message_id,
    user_id,
    applied_count,
    completed_at
  )
  values (p_source_message_id, 'sebastian', 0, statement_timestamp())
  on conflict (source_message_id) do nothing;

  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    select applied_count
      into v_applied_count
      from public.memory_extraction_runs
      where source_message_id = p_source_message_id;
    return v_applied_count;
  end if;

  for v_operation in
    select value from jsonb_array_elements(p_operations)
  loop
    if jsonb_typeof(v_operation) <> 'object'
      or not v_operation ?& array[
        'action',
        'targetMemoryId',
        'category',
        'title',
        'description',
        'importance',
        'confidence'
      ]
      or (select count(*) from jsonb_object_keys(v_operation)) <> 7
    then
      raise exception 'Memory operation fields do not match the contract';
    end if;

    if jsonb_typeof(v_operation -> 'action') <> 'string'
      or jsonb_typeof(v_operation -> 'category') <> 'string'
      or jsonb_typeof(v_operation -> 'title') <> 'string'
      or jsonb_typeof(v_operation -> 'description') <> 'string'
      or jsonb_typeof(v_operation -> 'importance') <> 'string'
      or jsonb_typeof(v_operation -> 'confidence') <> 'string'
    then
      raise exception 'Memory operation values have invalid types';
    end if;

    v_action := v_operation ->> 'action';
    v_category := v_operation ->> 'category';
    v_title := btrim(v_operation ->> 'title');
    v_description := btrim(v_operation ->> 'description');
    v_importance := v_operation ->> 'importance';
    v_confidence := v_operation ->> 'confidence';

    if v_action not in ('create', 'update', 'supersede')
      or v_category not in (
        'identity',
        'preference',
        'goal',
        'project',
        'relationship',
        'routine',
        'creator-style',
        'constraint',
        'other'
      )
      or length(v_title) not between 1 and 100
      or length(v_description) not between 1 and 500
      or v_importance not in ('low', 'medium', 'high')
      or v_confidence not in ('low', 'medium', 'high')
    then
      raise exception 'Memory operation values failed validation';
    end if;

    if v_action = 'create' then
      if jsonb_typeof(v_operation -> 'targetMemoryId') <> 'null' then
        raise exception 'Create operation cannot target a memory';
      end if;
      v_target_id := null;
    else
      if jsonb_typeof(v_operation -> 'targetMemoryId') <> 'string' then
        raise exception 'Update and supersede operations require a target';
      end if;
      begin
        v_target_id := (v_operation ->> 'targetMemoryId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Memory operation target is invalid';
      end;

      if v_target_id = any(v_target_ids) then
        raise exception 'A memory cannot be targeted more than once';
      end if;
      v_target_ids := array_append(v_target_ids, v_target_id);
    end if;

    if v_action = 'create' then
      insert into public.memories (
        user_id,
        category,
        title,
        description,
        importance,
        confidence,
        source_type,
        source_message_id,
        status
      )
      values (
        'sebastian',
        v_category,
        v_title,
        v_description,
        v_importance,
        v_confidence,
        'chat',
        p_source_message_id,
        'active'
      );
    elsif v_action = 'update' then
      update public.memories
      set category = v_category,
          title = v_title,
          description = v_description,
          importance = v_importance,
          confidence = v_confidence,
          updated_at = statement_timestamp()
      where id = v_target_id
        and user_id = 'sebastian'
        and status = 'active';

      get diagnostics v_row_count = row_count;
      if v_row_count <> 1 then
        raise exception 'Memory update target is no longer active';
      end if;
    else
      update public.memories
      set status = 'superseded',
          updated_at = statement_timestamp()
      where id = v_target_id
        and user_id = 'sebastian'
        and status = 'active';

      get diagnostics v_row_count = row_count;
      if v_row_count <> 1 then
        raise exception 'Memory supersede target is no longer active';
      end if;

      insert into public.memories (
        user_id,
        category,
        title,
        description,
        importance,
        confidence,
        source_type,
        source_message_id,
        status
      )
      values (
        'sebastian',
        v_category,
        v_title,
        v_description,
        v_importance,
        v_confidence,
        'chat',
        p_source_message_id,
        'active'
      );
    end if;

    v_applied_count := v_applied_count + 1;
  end loop;

  update public.memory_extraction_runs
  set applied_count = v_applied_count,
      completed_at = statement_timestamp()
  where source_message_id = p_source_message_id;

  return v_applied_count;
end;
$$;

revoke all privileges on function public.apply_memory_extraction(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_memory_extraction(uuid, jsonb)
  to service_role;
