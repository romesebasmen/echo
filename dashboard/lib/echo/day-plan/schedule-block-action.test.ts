import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidScheduleBlockActionRequestError,
  parseScheduleBlockId,
  parseScheduleBlockActionRequest,
} from "./schedule-block-action.ts";

test("schedule block IDs require a UUID", () => {
  assert.equal(
    parseScheduleBlockId("123e4567-e89b-42d3-a456-426614174000"),
    "123e4567-e89b-42d3-a456-426614174000",
  );
  for (const id of ["", "block-1", "123e4567-e89b-02d3-a456-426614174000"]) {
    assert.throws(() => parseScheduleBlockId(id), InvalidScheduleBlockActionRequestError);
  }
});

test("schedule task block actions accept only completed or skipped", () => {
  assert.deepEqual(parseScheduleBlockActionRequest({ status: "completed" }), {
    status: "completed",
  });
  assert.deepEqual(parseScheduleBlockActionRequest({ status: "skipped" }), {
    status: "skipped",
  });
});

test("schedule task block actions reject malformed, extra, and unsupported input", () => {
  for (const input of [
    null,
    [],
    {},
    { status: "scheduled" },
    { status: "completed", sourceId: "task-1" },
  ]) {
    assert.throws(
      () => parseScheduleBlockActionRequest(input),
      InvalidScheduleBlockActionRequestError,
    );
  }
});
