import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260802190000_atomic_day_plan_writes.sql",
  import.meta.url,
);
const sql = readFileSync(migrationUrl, "utf8").toLowerCase();

function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} must exist in the migration`);
  const end = sql.indexOf("$$;", start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return sql.slice(start, end);
}

test("check-in save atomically resets setup status and invalidates stale blocks", () => {
  const body = functionBody("save_day_plan_check_in");
  const lock = body.indexOf("pg_advisory_xact_lock");
  const changeCheck = body.indexOf("v_changed :=");
  const setup = body.indexOf("status = 'setup'");
  const deleteBlocks = body.indexOf("delete from public.schedule_blocks");

  assert.ok(lock >= 0);
  assert.ok(changeCheck > lock);
  assert.ok(setup > changeCheck);
  assert.ok(deleteBlocks > setup);
  assert.match(body, /return to_jsonb\(v_plan\)/);
});

test("an unchanged check-in is idempotent and keeps its generated schedule valid", () => {
  const body = functionBody("save_day_plan_check_in");
  assert.match(body, /if v_changed then/);
  assert.match(body, /check_in_completed_at = p_check_in_completed_at/);
  assert.ok(
    body.indexOf("delete from public.schedule_blocks") > body.indexOf("if v_changed then"),
  );
});

test("schedule replacement locks and version-checks before replacing and marking generated", () => {
  const body = functionBody("replace_day_plan_schedule");
  const lock = body.indexOf("for update");
  const versionCheck = body.indexOf("echo_check_in_changed");
  const deleteBlocks = body.indexOf("delete from public.schedule_blocks");
  const insertBlocks = body.indexOf("insert into public.schedule_blocks");
  const generated = body.indexOf("status = 'generated'");

  assert.ok(lock >= 0);
  assert.ok(versionCheck > lock);
  assert.ok(deleteBlocks > versionCheck);
  assert.ok(insertBlocks > deleteBlocks);
  assert.ok(generated > insertBlocks);
});

test("database function rejects incomplete check-ins before writing completion state", () => {
  const body = functionBody("save_day_plan_check_in");
  const validation = body.indexOf("echo_invalid_check_in");
  const insert = body.indexOf("insert into public.day_plans");
  assert.ok(validation >= 0);
  assert.ok(insert > validation);
  assert.match(body, /p_check_in_completed_at is null/);
  assert.match(body, /p_has_eaten is null/);
});
