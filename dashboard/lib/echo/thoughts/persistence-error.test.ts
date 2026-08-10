import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ThoughtInUseError,
  throwIfThoughtInUse,
} from "./persistence-error.ts";

test("maps the protected Creator Loop foreign key to a typed conflict", () => {
  assert.throws(
    () =>
      throwIfThoughtInUse({
        code: "23503",
        message:
          'update or delete on table "thoughts" violates foreign key constraint "creative_works_thought_origin_fk"',
      }),
    ThoughtInUseError,
  );
});

test("recognizes the constraint when PostgREST places it in safe details", () => {
  assert.throws(
    () =>
      throwIfThoughtInUse({
        code: "23503",
        message: "foreign key violation",
        details:
          "Key is still referenced from constraint creative_works_thought_origin_fk.",
      }),
    ThoughtInUseError,
  );
});

test("does not misclassify unrelated database failures", () => {
  assert.doesNotThrow(() =>
    throwIfThoughtInUse({
      code: "23503",
      message: "another_foreign_key",
    }),
  );
  assert.doesNotThrow(() =>
    throwIfThoughtInUse({
      code: "42501",
      message: "creative_works_thought_origin_fk",
    }),
  );
});
