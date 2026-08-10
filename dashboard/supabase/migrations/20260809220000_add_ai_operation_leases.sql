-- Serialize paid AI operations across server instances. Leases expire so a
-- crashed process cannot block Echo permanently, and release requires the
-- opaque lease UUID so an old request cannot release a newer lease.

create table public.ai_operation_leases (
  operation_key text primary key,
  lease_id uuid not null,
  user_id text not null default 'sebastian',
  acquired_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  constraint ai_operation_leases_operation_key_check
    check (
      length(operation_key) between 1 and 160
      and operation_key ~ '^[a-z0-9][a-z0-9:-]*$'
    ),
  constraint ai_operation_leases_user_id_check
    check (user_id = 'sebastian'),
  constraint ai_operation_leases_expiry_check
    check (expires_at > acquired_at)
);

alter table public.ai_operation_leases enable row level security;
alter table public.ai_operation_leases force row level security;

revoke all privileges on table public.ai_operation_leases
  from public, anon, authenticated;

create or replace function public.acquire_ai_operation_lease(
  p_operation_key text,
  p_lease_id uuid,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_acquired boolean;
begin
  if p_operation_key is null
    or length(p_operation_key) not between 1 and 160
    or p_operation_key !~ '^[a-z0-9][a-z0-9:-]*$'
  then
    raise exception 'Invalid AI operation key';
  end if;

  if p_lease_id is null then
    raise exception 'AI operation lease ID is required';
  end if;

  if p_ttl_seconds is null or p_ttl_seconds not between 30 and 900 then
    raise exception 'AI operation lease TTL must be between 30 and 900 seconds';
  end if;

  with acquired as (
    insert into public.ai_operation_leases as leases (
      operation_key,
      lease_id,
      user_id,
      acquired_at,
      expires_at
    )
    values (
      p_operation_key,
      p_lease_id,
      'sebastian',
      statement_timestamp(),
      statement_timestamp() + make_interval(secs => p_ttl_seconds)
    )
    on conflict (operation_key) do update
      set lease_id = excluded.lease_id,
          user_id = excluded.user_id,
          acquired_at = excluded.acquired_at,
          expires_at = excluded.expires_at
      where leases.expires_at <= statement_timestamp()
    returning true
  )
  select coalesce(bool_or(true), false)
    into v_acquired
    from acquired;

  return v_acquired;
end;
$$;

create or replace function public.release_ai_operation_lease(
  p_operation_key text,
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_released boolean;
begin
  if p_operation_key is null or p_lease_id is null then
    return false;
  end if;

  with released as (
    delete from public.ai_operation_leases
    where operation_key = p_operation_key
      and lease_id = p_lease_id
    returning true
  )
  select coalesce(bool_or(true), false)
    into v_released
    from released;

  return v_released;
end;
$$;

revoke all privileges on function public.acquire_ai_operation_lease(
  text, uuid, integer
) from public, anon, authenticated;
revoke all privileges on function public.release_ai_operation_lease(
  text, uuid
) from public, anon, authenticated;

grant execute on function public.acquire_ai_operation_lease(
  text, uuid, integer
) to service_role;
grant execute on function public.release_ai_operation_lease(
  text, uuid
) to service_role;
