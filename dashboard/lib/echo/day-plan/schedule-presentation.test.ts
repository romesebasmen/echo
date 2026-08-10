import { test } from "node:test";
import assert from "node:assert/strict";
import {
  presentScheduleBlock,
  scheduleStepTiming,
} from "./schedule-presentation.ts";
import type { ScheduleBlock } from "../types/day-plan.ts";

function block(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    id: "block-1",
    dayPlanId: "plan-1",
    sourceType: "task",
    sourceId: "task-1",
    title: "Make today's plan visible",
    responsibilityArea: "echo",
    startTime: "2026-08-09T14:30:00.000Z",
    endTime: "2026-08-09T15:15:00.000Z",
    status: "scheduled",
    orderIndex: 0,
    createdAt: "2026-08-09T14:00:00.000Z",
    updatedAt: "2026-08-09T14:00:00.000Z",
    ...overrides,
  };
}

test("presentScheduleBlock formats persisted instants in America/Chicago", () => {
  assert.deepEqual(presentScheduleBlock(block()), {
    kindLabel: "Task",
    timeRange: "9:30 AM–10:15 AM",
  });
});

test("presentScheduleBlock identifies commitments and breaks", () => {
  assert.equal(
    presentScheduleBlock(block({ sourceType: "commitment" })).kindLabel,
    "Commitment",
  );
  assert.equal(presentScheduleBlock(block({ sourceType: "break" })).kindLabel, "Break");
});

test("scheduleStepTiming distinguishes active, upcoming, and missed work", () => {
  assert.equal(
    scheduleStepTiming(block(), new Date("2026-08-09T14:45:00.000Z")),
    "now",
  );
  assert.equal(
    scheduleStepTiming(block(), new Date("2026-08-09T14:00:00.000Z")),
    "next",
  );
  assert.equal(
    scheduleStepTiming(block(), new Date("2026-08-09T15:15:00.000Z")),
    "needs-attention",
  );
});

test("scheduleStepTiming treats the exact start as active and exact end as missed", () => {
  assert.equal(
    scheduleStepTiming(block(), new Date("2026-08-09T14:30:00.000Z")),
    "now",
  );
  assert.equal(
    scheduleStepTiming(block(), new Date("2026-08-09T15:15:00.000Z")),
    "needs-attention",
  );
});
