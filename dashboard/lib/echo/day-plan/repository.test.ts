import { test } from "node:test";
import assert from "node:assert/strict";
import { mapDayPlanRow, type DayPlanRow } from "./repository.ts";

test("mapDayPlanRow maps nullable daily check-in fields from Supabase naming", () => {
  const row: DayPlanRow = {
    id: "plan-1",
    user_id: "sebastian",
    plan_date: "2026-08-02",
    available_from: "2026-08-02T14:00:00Z",
    energy: 6,
    stress: 8,
    sleep_quality: "poor",
    has_eaten: false,
    check_in_notes: "Long travel day.",
    check_in_completed_at: "2026-08-02T13:55:00Z",
    end_of_work_time: "2026-08-03T01:00:00Z",
    status: "setup",
    created_at: "2026-08-02T13:55:00Z",
    updated_at: "2026-08-02T13:55:00Z",
  };

  assert.deepEqual(mapDayPlanRow(row), {
    id: "plan-1",
    userId: "sebastian",
    planDate: "2026-08-02",
    availableFrom: "2026-08-02T14:00:00Z",
    energy: 6,
    stress: 8,
    sleepQuality: "poor",
    hasEaten: false,
    checkInNotes: "Long travel day.",
    checkInCompletedAt: "2026-08-02T13:55:00Z",
    endOfWorkTime: "2026-08-03T01:00:00Z",
    status: "setup",
    createdAt: "2026-08-02T13:55:00Z",
    updatedAt: "2026-08-02T13:55:00Z",
  });
});

test("mapDayPlanRow preserves an incomplete nullable check-in", () => {
  const row: DayPlanRow = {
    id: "plan-2",
    user_id: "sebastian",
    plan_date: "2026-08-03",
    available_from: "2026-08-03T14:00:00Z",
    energy: 5,
    stress: null,
    sleep_quality: null,
    has_eaten: null,
    check_in_notes: null,
    check_in_completed_at: null,
    end_of_work_time: "2026-08-04T01:00:00Z",
    status: "setup",
    created_at: "2026-08-03T13:55:00Z",
    updated_at: "2026-08-03T13:55:00Z",
  };

  const plan = mapDayPlanRow(row);
  assert.equal(plan.stress, null);
  assert.equal(plan.sleepQuality, null);
  assert.equal(plan.hasEaten, null);
  assert.equal(plan.checkInNotes, null);
  assert.equal(plan.checkInCompletedAt, null);
});

test("mapDayPlanRow normalizes absent old-schema check-in properties to null", () => {
  const oldSchemaRow: DayPlanRow = {
    id: "plan-old",
    user_id: "sebastian",
    plan_date: "2026-08-02",
    available_from: "2026-08-02T14:00:00Z",
    energy: 6,
    end_of_work_time: "2026-08-03T01:00:00Z",
    status: "setup",
    created_at: "2026-08-02T13:55:00Z",
    updated_at: "2026-08-02T13:55:00Z",
  };

  const plan = mapDayPlanRow(oldSchemaRow);
  assert.equal(plan.stress, null);
  assert.equal(plan.sleepQuality, null);
  assert.equal(plan.hasEaten, null);
  assert.equal(plan.checkInNotes, null);
  assert.equal(plan.checkInCompletedAt, null);
});
