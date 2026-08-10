import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260809220000_add_ai_operation_leases.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

test("AI operation leases are private, fixed-user, and expire", () => {
  assert.match(migration, /create table public\.ai_operation_leases/);
  assert.match(migration, /check \(user_id = 'sebastian'\)/);
  assert.match(migration, /expires_at > acquired_at/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(
    migration,
    /revoke all privileges on table public\.ai_operation_leases\s+from public, anon, authenticated/,
  );
});

test("lease acquisition is atomic and only replaces expired leases", () => {
  assert.match(migration, /on conflict \(operation_key\) do update/);
  assert.match(
    migration,
    /where leases\.expires_at <= statement_timestamp\(\)/,
  );
  assert.match(migration, /p_ttl_seconds not between 30 and 900/);
});

test("lease release requires the matching opaque lease token", () => {
  assert.match(migration, /and lease_id = p_lease_id/);
});

test("lease RPCs are callable only by the server service role", () => {
  for (const functionName of [
    "acquire_ai_operation_lease",
    "release_ai_operation_lease",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all privileges on function public\\.${functionName}\\([\\s\\S]*?from public, anon, authenticated`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `grant execute on function public\\.${functionName}\\([\\s\\S]*?to service_role`,
      ),
    );
  }
});
