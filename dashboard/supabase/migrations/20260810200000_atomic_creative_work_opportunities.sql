-- A sourced idea may enter Creator Loop only once per platform. The RPC also
-- verifies the fixed Sebastian-owned thought in the same transaction, closing
-- the read-then-insert race between tabs and application instances.

create unique index creative_works_sourced_identity_key
  on public.creative_works (user_id, origin_type, origin_id, platform)
  where origin_id is not null;

create or replace function public.get_or_create_thought_creative_work(
  p_thought_id uuid,
  p_platform text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_work public.creative_works%rowtype;
  v_created boolean := false;
begin
  if p_thought_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ECHO_THOUGHT_NOT_FOUND';
  end if;

  if p_platform is null
    or p_platform not in ('YouTube', 'TikTok', 'Instagram') then
    raise exception using
      errcode = '22023',
      message = 'ECHO_INVALID_CREATIVE_WORK_PLATFORM';
  end if;

  perform 1
  from public.thoughts
  where id = p_thought_id
    and user_id = 'sebastian';

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ECHO_THOUGHT_NOT_FOUND';
  end if;

  insert into public.creative_works (
    user_id,
    origin_type,
    origin_id,
    platform,
    status
  )
  values (
    'sebastian',
    'thought',
    p_thought_id,
    p_platform,
    'opportunity'
  )
  on conflict (user_id, origin_type, origin_id, platform)
    where origin_id is not null
  do nothing
  returning * into v_work;

  if v_work.id is not null then
    v_created := true;
  else
    select *
    into v_work
    from public.creative_works
    where user_id = 'sebastian'
      and origin_type = 'thought'
      and origin_id = p_thought_id
      and platform = p_platform;
  end if;

  if v_work.id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ECHO_CREATIVE_WORK_UNAVAILABLE';
  end if;

  return jsonb_build_object(
    'created', v_created,
    'creative_work', to_jsonb(v_work)
  );
end;
$function$;

revoke execute on function public.get_or_create_thought_creative_work(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_or_create_thought_creative_work(uuid, text)
  to service_role;
