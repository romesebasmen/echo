import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260809210000_enforce_core_data_integrity.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

test("core integrity migration enforces Echo's fixed single-user ownership", () => {
  for (const table of [
    "conversations",
    "creative_works",
    "daily_briefings",
    "day_plans",
    "memories",
    "tasks",
    "thoughts",
  ]) {
    assert.match(migration, new RegExp(`${table}_fixed_user_check`));
  }

  assert.match(migration, /check \(user_id = 'sebastian'\)/);
});

test("core integrity migration enforces chronological planning ranges", () => {
  assert.match(migration, /check \(start_time < end_time\)/);
  assert.match(migration, /check \(available_from < end_of_work_time\)/);
  assert.match(migration, /commitments_time_order_check/);
  assert.match(migration, /schedule_blocks_time_order_check/);
});

test("core integrity migration enforces task and generated-plan state", () => {
  assert.match(
    migration,
    /estimated_minutes is null or estimated_minutes between 1 and 1440/,
  );
  assert.match(migration, /tasks_completion_state_check/);
  assert.match(migration, /day_plans_completed_check_in_valid_check/);
  assert.match(migration, /day_plans_generated_check_in_complete_check/);
});

test("core integrity migration protects deterministic block identity and order", () => {
  assert.match(migration, /check \(order_index >= 0\)/);
  assert.match(
    migration,
    /create unique index schedule_blocks_day_plan_id_order_key\s+on public\.schedule_blocks \(day_plan_id, order_index\)/,
  );
});

test("core integrity migration validates checks after adding them without rewriting data", () => {
  assert.match(migration, /not valid/);
  assert.match(migration, /validate constraint/);
  assert.doesNotMatch(migration, /\b(?:insert|update|delete|truncate)\b/);
});
