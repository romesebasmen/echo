-- Echo intentionally has one Sebastian conversation. Enforce that invariant
-- and make first-use creation atomic across tabs, processes, and deployments.

create unique index conversations_user_id_key
  on public.conversations (user_id);

create or replace function public.get_or_create_echo_conversation()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_conversation_id uuid;
begin
  select id
    into v_conversation_id
    from public.conversations
    where user_id = 'sebastian';

  if found then
    return v_conversation_id;
  end if;

  insert into public.conversations (user_id, title)
    values ('sebastian', 'Echo chat')
    on conflict (user_id) do nothing
    returning id into v_conversation_id;

  if found then
    return v_conversation_id;
  end if;

  -- A concurrent insert may have won while this transaction waited on the
  -- unique index. Read that authoritative row rather than creating another.
  select id
    into v_conversation_id
    from public.conversations
    where user_id = 'sebastian';

  if not found then
    raise exception 'ECHO_CONVERSATION_UNAVAILABLE';
  end if;

  return v_conversation_id;
end;
$$;

revoke all privileges on function public.get_or_create_echo_conversation()
  from public, anon, authenticated;

grant execute on function public.get_or_create_echo_conversation()
  to service_role;
