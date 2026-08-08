import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sourceUrl = new URL("./service-role-client.ts", import.meta.url);
const source = readFileSync(sourceUrl, "utf8");

test("service-role client is server-poisoned and uses only a private environment variable", () => {
  assert.match(source, /^import "server-only";/);
  assert.match(source, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/);
});

test("service-role client disables browser-oriented auth session behavior", () => {
  assert.match(source, /persistSession: false/);
  assert.match(source, /autoRefreshToken: false/);
  assert.match(source, /detectSessionInUrl: false/);
});
