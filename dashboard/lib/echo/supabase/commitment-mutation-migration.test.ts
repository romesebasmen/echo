import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../../supabase/migrations/20260810192216_manage_day_plan_commitments.sql",
    import.meta.url,
  ),
  "utf8",
);

test("commitment persistence enforces a bounded nonblank title", () => {
  assert.match(migration, /commitments_title_valid_check/);
  assert.match(
    migration,
    /char_length\(btrim\(title\)\) between 1 and 200/i,
  );
  assert.match(migration, /validate constraint commitments_title_valid_check/i);
});

test("commitment RPCs lock the Sebastian plan and validate its Chicago day", () => {
  assert.match(
    migration,
    /create or replace function public\.create_day_plan_commitment/i,
  );
  assert.match(
    migration,
    /create or replace function public\.delete_day_plan_commitment/i,
  );
  assert.match(migration, /user_id = 'sebastian'[\s\S]*?for update/gi);
  assert.match(
    migration,
    /p_start_time at time zone 'America\/Chicago'[\s\S]*?v_plan\.plan_date/i,
  );
  assert.match(
    migration,
    /p_end_time at time zone 'America\/Chicago'[\s\S]*?v_plan\.plan_date/i,
  );
});

test("every commitment mutation atomically invalidates the previous schedule", () => {
  const revisionUpdates = migration.match(
    /set status = 'setup',[\s\S]*?check_in_completed_at = v_now,[\s\S]*?updated_at = v_now/gi,
  );
  const staleBlockDeletes = migration.match(
    /delete from public\.schedule_blocks\s+where day_plan_id = v_plan\.id/gi,
  );

  assert.equal(revisionUpdates?.length, 2);
  assert.equal(staleBlockDeletes?.length, 2);
  assert.ok(
    migration.indexOf("insert into public.commitments") <
      migration.indexOf("delete from public.schedule_blocks"),
  );
});

test("commitment RPCs are executable only by the server service role", () => {
  assert.match(
    migration,
    /security definer\s+set search_path = pg_catalog, pg_temp/gi,
  );
  assert.match(
    migration,
    /revoke all privileges on function public\.create_day_plan_commitment\([\s\S]*?from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /revoke all privileges on function public\.delete_day_plan_commitment\(uuid, uuid\)[\s\S]*?from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_day_plan_commitment\([\s\S]*?to service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.delete_day_plan_commitment\(uuid, uuid\)\s+to service_role/i,
  );
});
