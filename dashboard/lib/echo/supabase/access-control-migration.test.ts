import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260809190000_lock_down_echo_data_access.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

const PRIVATE_TABLES = [
  "commitments",
  "conversations",
  "creative_works",
  "daily_briefings",
  "day_plans",
  "memories",
  "messages",
  "schedule_blocks",
  "tasks",
  "thoughts",
] as const;

test("access-control migration covers every private Echo table", () => {
  for (const table of PRIVATE_TABLES) {
    assert.match(migration, new RegExp(`'${table}'`));
  }

  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /drop policy if exists/);
});

test("access-control migration denies direct data and function access", () => {
  assert.match(
    migration,
    /revoke all privileges on all tables in schema public\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke all privileges on all sequences in schema public\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke all privileges on all functions in schema public\s+from public, anon, authenticated/,
  );
});

test("access-control migration preserves only server-side application access", () => {
  assert.match(
    migration,
    /grant select, insert, update, delete on all tables in schema public\s+to service_role/,
  );
  assert.match(migration, /save_day_plan_check_in[\s\S]*to service_role/);
  assert.match(migration, /replace_day_plan_schedule[\s\S]*to service_role/);
});

test("access-control migration makes future postgres objects private by default", () => {
  assert.match(
    migration,
    /alter default privileges for role postgres in schema public\s+revoke all privileges on tables from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /alter default privileges for role postgres in schema public\s+revoke execute on functions from public, anon, authenticated/,
  );
});
