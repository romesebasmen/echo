-- Limit password guesses at the database boundary shared by every Echo server
-- instance. The password never enters Postgres: the server submits only the
-- result of its timing-safe comparison. A single fixed-user bucket is
-- deliberate for Echo's single-user deployment and avoids storing IP data.

create table public.echo_login_throttle (
  singleton_id boolean primary key default true,
  failed_attempts integer not null default 0,
  window_started_at timestamptz not null default statement_timestamp(),
  locked_until timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint echo_login_throttle_singleton_check check (singleton_id),
  constraint echo_login_throttle_failed_attempts_check
    check (failed_attempts between 0 and 5),
  constraint echo_login_throttle_lock_order_check
    check (locked_until is null or locked_until > window_started_at)
);

alter table public.echo_login_throttle enable row level security;
alter table public.echo_login_throttle force row level security;

revoke all privileges on table public.echo_login_throttle
  from public, anon, authenticated;

create or replace function public.register_echo_login_attempt(
  p_password_valid boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_failed_attempts integer;
  v_window_started_at timestamptz;
  v_locked_until timestamptz;
  v_now timestamptz := statement_timestamp();
begin
  if p_password_valid is null then
    return false;
  end if;

  insert into public.echo_login_throttle (singleton_id)
  values (true)
  on conflict (singleton_id) do nothing;

  select failed_attempts, window_started_at, locked_until
    into v_failed_attempts, v_window_started_at, v_locked_until
    from public.echo_login_throttle
    where singleton_id = true
    for update;

  if v_locked_until is not null and v_locked_until > v_now then
    return false;
  end if;

  if p_password_valid then
    update public.echo_login_throttle
      set failed_attempts = 0,
          window_started_at = v_now,
          locked_until = null,
          updated_at = v_now
      where singleton_id = true;
    return true;
  end if;

  if v_window_started_at <= v_now - interval '15 minutes' then
    v_failed_attempts := 0;
    v_window_started_at := v_now;
  end if;

  v_failed_attempts := least(v_failed_attempts + 1, 5);

  update public.echo_login_throttle
    set failed_attempts = v_failed_attempts,
        window_started_at = v_window_started_at,
        locked_until = case
          when v_failed_attempts >= 5 then v_now + interval '15 minutes'
          else null
        end,
        updated_at = v_now
    where singleton_id = true;

  return false;
end;
$$;

revoke all privileges on function public.register_echo_login_attempt(boolean)
  from public, anon, authenticated;

grant execute on function public.register_echo_login_attempt(boolean)
  to service_role;
