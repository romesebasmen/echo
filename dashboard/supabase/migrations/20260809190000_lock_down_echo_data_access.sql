-- Echo is a private, single-user application. All database access must pass
-- through Echo's authenticated server, which uses the service_role credential.
-- The publishable key must not grant direct access to Sebastian's data.

do $$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array[
    'commitments',
    'conversations',
    'creative_works',
    'daily_briefings',
    'day_plans',
    'memories',
    'messages',
    'schedule_blocks',
    'tasks',
    'thoughts'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Required Echo table public.% is missing', v_table;
    end if;

    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        v_policy.policyname,
        v_table
      );
    end loop;

    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
  end loop;
end;
$$;

revoke all privileges on all tables in schema public
  from public, anon, authenticated;
revoke all privileges on all sequences in schema public
  from public, anon, authenticated;
revoke all privileges on all functions in schema public
  from public, anon, authenticated;

grant select, insert, update, delete on all tables in schema public
  to service_role;
grant usage, select on all sequences in schema public
  to service_role;

-- These are the only application RPCs. Both also validate the fixed Sebastian
-- identity internally, and remain callable only with the server-only role.
grant execute on function public.save_day_plan_check_in(
  text, date, timestamptz, integer, integer, text, boolean, text, timestamptz, timestamptz
) to service_role;
grant execute on function public.replace_day_plan_schedule(
  text, text, timestamptz, jsonb
) to service_role;

-- Prevent future migrations owned by postgres from silently recreating the
-- legacy Supabase auto-exposure defaults in the public schema.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

-- Hosted Supabase may also create public-schema objects as supabase_admin.
-- Tighten that role's future defaults when the migration role can administer it.
do $$
begin
  if pg_has_role(current_user, 'supabase_admin', 'MEMBER') then
    execute 'alter default privileges for role supabase_admin in schema public revoke all privileges on tables from public, anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke all privileges on sequences from public, anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon, authenticated';
  end if;
end;
$$;
