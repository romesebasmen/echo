import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260810010000_complete_day_plan_task_blocks.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

test("task block transitions lock and validate the current Sebastian plan", () => {
  assert.match(migration, /from public\.day_plans as day_plan/);
  assert.match(migration, /join public\.schedule_blocks as schedule_block/);
  assert.match(migration, /day_plan\.user_id = 'sebastian'/);
  const planLock = migration.indexOf("for update of day_plan");
  const blockLock = migration.indexOf("and day_plan_id = v_plan.id");
  assert.ok(planLock >= 0);
  assert.ok(blockLock > planLock);
  assert.match(migration.slice(blockLock), /for update/);
  assert.match(migration, /v_plan\.status <> 'generated'/);
  assert.match(migration, /at time zone 'america\/chicago'/);
  assert.match(migration, /v_block\.source_type <> 'task'/);
});

test("completion updates the source task in the same function while skip leaves it open", () => {
  assert.match(migration, /if p_status = 'completed' then[\s\S]*?update public\.tasks/);
  assert.match(migration, /set status = 'done'/);
  assert.match(migration, /completed_at = coalesce\(completed_at, v_now\)/);
  assert.match(migration, /update public\.schedule_blocks[\s\S]*?set status = p_status/);
  assert.doesNotMatch(migration, /if p_status = 'skipped' then[\s\S]*?update public\.tasks/);
});

test("task block transitions are idempotent but terminal states cannot be changed", () => {
  assert.match(migration, /if v_block\.status = p_status then/);
  assert.match(migration, /if v_block\.status <> 'scheduled' then/);
});

test("the task block transition RPC is service-role only", () => {
  assert.match(
    migration,
    /revoke all privileges on function public\.transition_day_plan_task_block\(uuid, text\)\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.transition_day_plan_task_block\(uuid, text\)\s+to service_role/,
  );
});
