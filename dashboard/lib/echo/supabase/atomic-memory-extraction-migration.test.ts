import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260809230000_atomic_memory_extraction.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

test("memory extraction run markers are private and fixed-user", () => {
  assert.match(migration, /create table public\.memory_extraction_runs/);
  assert.match(migration, /check \(user_id = 'sebastian'\)/);
  assert.match(migration, /references public\.messages\(id\) on delete cascade/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(
    migration,
    /revoke all privileges on table public\.memory_extraction_runs\s+from public, anon, authenticated/,
  );
});

test("atomic RPC validates ownership and the strict bounded operation contract", () => {
  assert.match(migration, /conversation\.user_id = 'sebastian'/);
  assert.match(migration, /jsonb_array_length\(p_operations\) > 10/);
  assert.match(migration, /jsonb_object_keys\(v_operation\)\) <> 7/);
  assert.match(migration, /a memory cannot be targeted more than once/);
  assert.match(migration, /status = 'active'/);
});

test("run marker and every memory mutation execute inside one function transaction", () => {
  const marker = migration.indexOf("insert into public.memory_extraction_runs");
  const memoryInsert = migration.indexOf("insert into public.memories", marker);
  const runCompletion = migration.indexOf("update public.memory_extraction_runs", memoryInsert);
  assert.ok(marker >= 0);
  assert.ok(memoryInsert > marker);
  assert.ok(runCompletion > memoryInsert);
  assert.match(migration, /on conflict \(source_message_id\) do nothing/);
});

test("atomic memory RPC is executable only by the server service role", () => {
  assert.match(
    migration,
    /revoke all privileges on function public\.apply_memory_extraction\(uuid, jsonb\)\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.apply_memory_extraction\(uuid, jsonb\)\s+to service_role/,
  );
});
