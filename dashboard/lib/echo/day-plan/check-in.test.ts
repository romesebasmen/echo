import { test } from "node:test";
import assert from "node:assert/strict";
import { isCheckInComplete, missingCheckInFields } from "./check-in.ts";

const complete = {
  energy: 6,
  stress: 4,
  sleepQuality: "good" as const,
  hasEaten: false,
  checkInCompletedAt: "2026-08-02T14:00:00.000Z",
};

test("requires every raw check-in field", () => {
  assert.equal(isCheckInComplete(complete), true);
  assert.equal(isCheckInComplete({ ...complete, stress: null }), false);
  assert.equal(isCheckInComplete({ ...complete, sleepQuality: null }), false);
  assert.equal(isCheckInComplete({ ...complete, hasEaten: null }), false);
  assert.equal(isCheckInComplete({ ...complete, checkInCompletedAt: null }), false);
});

test("undefined old-schema values cannot count as a complete check-in", () => {
  const oldSchema = {
    ...complete,
    stress: undefined,
    sleepQuality: undefined,
    hasEaten: undefined,
    checkInCompletedAt: undefined,
  };

  assert.equal(isCheckInComplete(oldSchema as never), false);
  assert.deepEqual(missingCheckInFields(oldSchema as never), [
    "stress",
    "sleepQuality",
    "hasEaten",
    "checkInCompletedAt",
  ]);
});
