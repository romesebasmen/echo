import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_COMMITMENT_TITLE_LENGTH,
  parseCommitmentCreateRequest,
  parseCommitmentId,
} from "./commitment-request.ts";

const PLAN_DATE = "2026-08-10";

test("commitment request accepts and normalizes the exact contract", () => {
  assert.deepEqual(
    parseCommitmentCreateRequest(
      {
        title: "  Class  ",
        startTime: "2026-08-10T09:00:00-05:00",
        endTime: "2026-08-10T10:15:00-05:00",
        responsibilityArea: "texas-am",
      },
      PLAN_DATE,
    ),
    {
      title: "Class",
      startTime: "2026-08-10T14:00:00.000Z",
      endTime: "2026-08-10T15:15:00.000Z",
      responsibilityArea: "texas-am",
    },
  );
});

test("commitment request permits an omitted or null responsibility area", () => {
  const base = {
    title: "Appointment",
    startTime: "2026-08-10T13:00:00-05:00",
    endTime: "2026-08-10T14:00:00-05:00",
  };

  assert.equal(
    parseCommitmentCreateRequest(base, PLAN_DATE).responsibilityArea,
    null,
  );
  assert.equal(
    parseCommitmentCreateRequest(
      { ...base, responsibilityArea: null },
      PLAN_DATE,
    ).responsibilityArea,
    null,
  );
});

test("commitment request enforces text, time, day, and field boundaries", () => {
  const valid = {
    title: "Appointment",
    startTime: "2026-08-10T13:00:00-05:00",
    endTime: "2026-08-10T14:00:00-05:00",
  };

  assert.throws(
    () => parseCommitmentCreateRequest({ ...valid, title: " " }, PLAN_DATE),
    /Title is required/,
  );
  assert.throws(
    () =>
      parseCommitmentCreateRequest(
        { ...valid, title: "x".repeat(MAX_COMMITMENT_TITLE_LENGTH + 1) },
        PLAN_DATE,
      ),
    /200 characters or fewer/,
  );
  assert.throws(
    () =>
      parseCommitmentCreateRequest(
        { ...valid, startTime: "2026-08-10T13:00" },
        PLAN_DATE,
      ),
    /explicit timezone offset/,
  );
  assert.throws(
    () =>
      parseCommitmentCreateRequest(
        { ...valid, endTime: valid.startTime },
        PLAN_DATE,
      ),
    /earlier than endTime/,
  );
  assert.throws(
    () =>
      parseCommitmentCreateRequest(
        { ...valid, endTime: "2026-08-11T00:15:00-05:00" },
        PLAN_DATE,
      ),
    /Chicago calendar date/,
  );
  assert.throws(
    () =>
      parseCommitmentCreateRequest(
        { ...valid, responsibilityArea: "unknown" },
        PLAN_DATE,
      ),
    /Responsibility area is invalid/,
  );
  assert.throws(
    () => parseCommitmentCreateRequest({ ...valid, duration: 60 }, PLAN_DATE),
    /unknown field/,
  );
});

test("commitment dates are evaluated in America/Chicago around UTC midnight", () => {
  const result = parseCommitmentCreateRequest(
    {
      title: "Evening event",
      startTime: "2026-08-10T23:00:00-05:00",
      endTime: "2026-08-10T23:45:00-05:00",
    },
    PLAN_DATE,
  );

  assert.equal(result.startTime, "2026-08-11T04:00:00.000Z");
  assert.equal(result.endTime, "2026-08-11T04:45:00.000Z");
});

test("commitment IDs must be UUIDs", () => {
  assert.equal(
    parseCommitmentId("550e8400-e29b-41d4-a716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000",
  );
  assert.throws(() => parseCommitmentId("commitment-1"), /valid UUID/);
});
