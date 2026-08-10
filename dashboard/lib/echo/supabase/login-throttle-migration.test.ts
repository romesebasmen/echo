import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260810000000_rate_limit_echo_login.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

test("login throttling is private, fixed to one bucket, and stores no password", () => {
  assert.match(migration, /create table public\.echo_login_throttle/);
  assert.match(migration, /singleton_id boolean primary key default true/);
  assert.match(migration, /check \(singleton_id\)/);
  assert.doesNotMatch(migration, /password text|password varchar|client_ip|ip_address/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(
    migration,
    /revoke all privileges on table public\.echo_login_throttle\s+from public, anon, authenticated/,
  );
});

test("five failures lock login for fifteen minutes and expired windows reset", () => {
  assert.match(migration, /failed_attempts between 0 and 5/);
  assert.match(migration, /v_failed_attempts >= 5/);
  assert.match(migration, /v_now \+ interval '15 minutes'/);
  assert.match(migration, /v_window_started_at <= v_now - interval '15 minutes'/);
  assert.match(migration, /for update/);
});

test("a correct password cannot bypass an active lock and clears an expired bucket", () => {
  const lockCheckIndex = migration.indexOf("v_locked_until > v_now");
  const successIndex = migration.indexOf("if p_password_valid then");

  assert.ok(lockCheckIndex >= 0);
  assert.ok(successIndex > lockCheckIndex);
  assert.match(migration, /set failed_attempts = 0,[\s\S]*?locked_until = null/);
});

test("the login throttle RPC is callable only by service_role", () => {
  assert.match(
    migration,
    /revoke all privileges on function public\.register_echo_login_attempt\(boolean\)\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.register_echo_login_attempt\(boolean\)\s+to service_role/,
  );
});
