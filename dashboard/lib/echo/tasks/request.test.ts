import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidTaskRequestError,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_ESTIMATED_MINUTES,
  MAX_TASK_TITLE_LENGTH,
  MIN_TASK_ESTIMATED_MINUTES,
  parseTaskCreateRequest,
  parseTaskUpdateRequest,
} from "./request.ts";

test("accepts and normalizes the exact create contract", () => {
  assert.deepEqual(
    parseTaskCreateRequest({
      title: "  Ship the task boundary  ",
      responsibilityArea: "echo",
      description: "  Validate every field  ",
      dueAt: "2026-08-10T09:00:00-05:00",
      estimatedMinutes: 45,
      energyRequired: "high",
      priority: "medium",
      deepWork: true,
    }),
    {
      title: "Ship the task boundary",
      responsibilityArea: "echo",
      description: "Validate every field",
      dueAt: "2026-08-10T09:00:00-05:00",
      estimatedMinutes: 45,
      energyRequired: "high",
      priority: "medium",
      deepWork: true,
    },
  );
});

test("accepts exact text and duration boundaries", () => {
  const minimum = parseTaskCreateRequest({
    title: "t".repeat(MAX_TASK_TITLE_LENGTH),
    responsibilityArea: "echo",
    description: "d".repeat(MAX_TASK_DESCRIPTION_LENGTH),
    estimatedMinutes: MIN_TASK_ESTIMATED_MINUTES,
  });
  const maximum = parseTaskCreateRequest({
    title: "Task",
    responsibilityArea: "echo",
    estimatedMinutes: MAX_TASK_ESTIMATED_MINUTES,
  });

  assert.equal(minimum.title.length, MAX_TASK_TITLE_LENGTH);
  assert.equal(minimum.description?.length, MAX_TASK_DESCRIPTION_LENGTH);
  assert.equal(minimum.estimatedMinutes, MIN_TASK_ESTIMATED_MINUTES);
  assert.equal(maximum.estimatedMinutes, MAX_TASK_ESTIMATED_MINUTES);
});

test("normalizes blank descriptions and explicit nullable planning fields", () => {
  assert.deepEqual(
    parseTaskCreateRequest({
      title: "Task",
      responsibilityArea: "echo",
      description: "   ",
      dueAt: null,
      estimatedMinutes: null,
    }),
    {
      title: "Task",
      responsibilityArea: "echo",
      description: null,
      dueAt: null,
      estimatedMinutes: null,
    },
  );
});

test("rejects invalid create fields instead of silently defaulting them", () => {
  for (const value of [
    {},
    { title: " ", responsibilityArea: "echo" },
    { title: "Task", responsibilityArea: "unknown" },
    { title: "Task", responsibilityArea: "echo", priority: "urgent" },
    { title: "Task", responsibilityArea: "echo", energyRequired: null },
    { title: "Task", responsibilityArea: "echo", deepWork: "yes" },
    { title: "Task", responsibilityArea: "echo", description: 42 },
    { title: "Task", responsibilityArea: "echo", userId: "someone-else" },
    null,
    [],
  ]) {
    assert.throws(() => parseTaskCreateRequest(value), InvalidTaskRequestError);
  }
});

test("rejects invalid and timezone-ambiguous due dates", () => {
  for (const dueAt of ["", "not-a-date", "2026-08-10T09:00:00", "2026-02-30T09:00:00Z"]) {
    assert.throws(
      () => parseTaskCreateRequest({ title: "Task", responsibilityArea: "echo", dueAt }),
      InvalidTaskRequestError,
    );
  }
});

test("rejects non-positive, fractional, non-finite, and excessive durations", () => {
  for (const estimatedMinutes of [
    MIN_TASK_ESTIMATED_MINUTES - 1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX_TASK_ESTIMATED_MINUTES + 1,
  ]) {
    assert.throws(
      () =>
        parseTaskCreateRequest({
          title: "Task",
          responsibilityArea: "echo",
          estimatedMinutes,
        }),
      InvalidTaskRequestError,
    );
  }
});

test("patch accepts intentional clears and rejects empty, unknown, or invalid fields", () => {
  assert.deepEqual(
    parseTaskUpdateRequest({ description: null, dueAt: null, estimatedMinutes: null }),
    { description: null, dueAt: null, estimatedMinutes: null },
  );
  assert.deepEqual(parseTaskUpdateRequest({ status: "done", deepWork: false }), {
    status: "done",
    deepWork: false,
  });

  for (const value of [
    {},
    { title: " " },
    { status: "archived" },
    { estimatedMinutes: -15 },
    { dueAt: "2026-08-10T09:00:00" },
    { completedAt: "2026-08-10T09:00:00Z" },
  ]) {
    assert.throws(() => parseTaskUpdateRequest(value), InvalidTaskRequestError);
  }
});

test("rejects overlong task text", () => {
  assert.throws(
    () =>
      parseTaskCreateRequest({
        title: "t".repeat(MAX_TASK_TITLE_LENGTH + 1),
        responsibilityArea: "echo",
      }),
    InvalidTaskRequestError,
  );
  assert.throws(
    () => parseTaskUpdateRequest({ description: "d".repeat(MAX_TASK_DESCRIPTION_LENGTH + 1) }),
    InvalidTaskRequestError,
  );
});
