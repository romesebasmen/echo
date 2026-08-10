import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../../supabase/migrations/20260810193713_make_echo_conversation_singleton.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Echo enforces one conversation for its fixed single user", () => {
  assert.match(
    migration,
    /create unique index conversations_user_id_key\s+on public\.conversations \(user_id\)/i,
  );
  assert.match(
    migration,
    /where user_id = 'sebastian'/gi,
  );
});

test("conversation creation is idempotent under concurrent first use", () => {
  assert.match(
    migration,
    /insert into public\.conversations \(user_id, title\)[\s\S]*?on conflict \(user_id\) do nothing[\s\S]*?returning id/i,
  );
  const authoritativeReads = migration.match(
    /from public\.conversations\s+where user_id = 'sebastian'/gi,
  );
  assert.equal(authoritativeReads?.length, 2);
  assert.match(migration, /ECHO_CONVERSATION_UNAVAILABLE/);
});

test("conversation bootstrap is callable only by the server service role", () => {
  assert.match(
    migration,
    /security definer\s+set search_path = pg_catalog, pg_temp/i,
  );
  assert.match(
    migration,
    /revoke all privileges on function public\.get_or_create_echo_conversation\(\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_or_create_echo_conversation\(\)\s+to service_role/i,
  );
});
