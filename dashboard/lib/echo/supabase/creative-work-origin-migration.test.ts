import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260810203000_protect_creative_work_thought_origins.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

test("only thought-originated work receives the generated reference", () => {
  assert.match(migration, /add column thought_origin_id uuid/);
  assert.match(
    migration,
    /when origin_type = 'thought' then origin_id\s+else null/,
  );
  assert.match(migration, /generated always as/);
  assert.match(migration, /stored/);
});

test("the database prevents deleting a thought that Creator Loop still uses", () => {
  assert.match(migration, /constraint creative_works_thought_origin_fk/);
  assert.match(
    migration,
    /foreign key \(thought_origin_id\)\s+references public\.thoughts \(id\)\s+on delete restrict/,
  );
});

test("existing source references are validated without changing product data", () => {
  assert.match(migration, /not valid/);
  assert.match(
    migration,
    /validate constraint creative_works_thought_origin_fk/,
  );
  assert.doesNotMatch(
    migration,
    /^\s*(?:insert\s+into|update\s+public\.|delete\s+from|truncate\s+)/m,
  );
});
