import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260810200000_atomic_creative_work_opportunities.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

test("sourced creative-work identity is unique while manual work remains allowed", () => {
  assert.match(
    migration,
    /create unique index creative_works_sourced_identity_key\s+on public\.creative_works \(user_id, origin_type, origin_id, platform\)\s+where origin_id is not null/,
  );
});

test("atomic creation verifies Sebastian's source thought before insert", () => {
  const sourceCheck = migration.indexOf("from public.thoughts");
  const insert = migration.indexOf("insert into public.creative_works");

  assert.ok(sourceCheck >= 0);
  assert.ok(insert > sourceCheck);
  assert.match(
    migration,
    /from public\.thoughts\s+where id = p_thought_id\s+and user_id = 'sebastian'/,
  );
  assert.match(migration, /message = 'echo_thought_not_found'/);
});

test("concurrent creates converge on the authoritative unique row", () => {
  assert.match(
    migration,
    /on conflict \(user_id, origin_type, origin_id, platform\)\s+where origin_id is not null\s+do nothing/,
  );
  assert.match(migration, /'created', v_created/);
  assert.match(migration, /'creative_work', to_jsonb\(v_work\)/);
});

test("atomic opportunity RPC is server-only", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, pg_temp/);
  assert.match(
    migration,
    /revoke execute on function public\.get_or_create_thought_creative_work\(uuid, text\)\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_or_create_thought_creative_work\(uuid, text\)\s+to service_role/,
  );
});
