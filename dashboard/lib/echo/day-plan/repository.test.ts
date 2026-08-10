import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CommitmentDayPlanNotFoundError,
  CommitmentNotFoundError,
  createCommitmentWithRpc,
  deleteCommitmentWithRpc,
  InvalidCommitmentPersistenceError,
  mapDayPlanRow,
  mapCommitmentRow,
  MissingCommitmentMutationMigrationError,
  saveDayPlanCheckInWithRpc,
  type CommitmentRow,
  type DayPlanRow,
} from "./repository.ts";

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

test("saveDayPlanCheckIn delegates the atomic write through an injected RPC caller", async () => {
  const row: DayPlanRow = {
    id: "plan-1",
    user_id: "sebastian",
    plan_date: "2026-08-02",
    available_from: "2026-08-02T14:00:00Z",
    energy: 6,
    stress: 4,
    sleep_quality: "good",
    has_eaten: true,
    check_in_notes: null,
    check_in_completed_at: "2026-08-02T13:55:00Z",
    end_of_work_time: "2026-08-03T01:00:00Z",
    status: "setup",
    created_at: "2026-08-02T13:55:00Z",
    updated_at: "2026-08-02T13:55:00Z",
  };
  let calledFunction = "";
  let calledParameters: Record<string, unknown> = {};

  const plan = await saveDayPlanCheckInWithRpc(
    {
      planDate: row.plan_date,
      availableFrom: row.available_from,
      energy: row.energy,
      stress: row.stress!,
      sleepQuality: "good",
      hasEaten: true,
      checkInNotes: null,
      checkInCompletedAt: row.check_in_completed_at!,
      endOfWorkTime: row.end_of_work_time,
    },
    async (functionName, parameters) => {
      calledFunction = functionName;
      calledParameters = parameters;
      return { data: row, error: null };
    },
  );

  assert.equal(calledFunction, "save_day_plan_check_in");
  assert.equal(calledParameters.p_user_id, "sebastian");
  assert.equal(calledParameters.p_check_in_completed_at, row.check_in_completed_at);
  assert.equal(plan.id, row.id);
});

const commitmentRow: CommitmentRow = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  day_plan_id: "550e8400-e29b-41d4-a716-446655440001",
  title: "Class",
  start_time: "2026-08-10T14:00:00.000Z",
  end_time: "2026-08-10T15:00:00.000Z",
  responsibility_area: "texas-am",
  created_at: "2026-08-10T13:00:00.000Z",
};

test("commitment mapping preserves Supabase provenance fields", () => {
  assert.deepEqual(mapCommitmentRow(commitmentRow), {
    id: commitmentRow.id,
    dayPlanId: commitmentRow.day_plan_id,
    title: commitmentRow.title,
    startTime: commitmentRow.start_time,
    endTime: commitmentRow.end_time,
    responsibilityArea: "texas-am",
    createdAt: commitmentRow.created_at,
  });
});

test("create commitment delegates only authoritative fields to the atomic RPC", async () => {
  let calledFunction = "";
  let calledParameters: Record<string, unknown> = {};
  const commitment = await createCommitmentWithRpc(
    {
      dayPlanId: commitmentRow.day_plan_id,
      title: commitmentRow.title,
      startTime: commitmentRow.start_time,
      endTime: commitmentRow.end_time,
      responsibilityArea: "texas-am",
    },
    async (functionName, parameters) => {
      calledFunction = functionName;
      calledParameters = parameters;
      return { data: commitmentRow, error: null };
    },
  );

  assert.equal(calledFunction, "create_day_plan_commitment");
  assert.deepEqual(calledParameters, {
    p_day_plan_id: commitmentRow.day_plan_id,
    p_title: commitmentRow.title,
    p_start_time: commitmentRow.start_time,
    p_end_time: commitmentRow.end_time,
    p_responsibility_area: "texas-am",
  });
  assert.equal(commitment.id, commitmentRow.id);
});

test("delete commitment scopes the RPC to both plan and commitment", async () => {
  let calledParameters: Record<string, unknown> = {};
  await deleteCommitmentWithRpc(
    commitmentRow.day_plan_id,
    commitmentRow.id,
    async (functionName, parameters) => {
      assert.equal(functionName, "delete_day_plan_commitment");
      calledParameters = parameters;
      return { data: commitmentRow, error: null };
    },
  );

  assert.deepEqual(calledParameters, {
    p_day_plan_id: commitmentRow.day_plan_id,
    p_commitment_id: commitmentRow.id,
  });
});

test("commitment RPC failures map to useful typed errors", async () => {
  const input = {
    dayPlanId: commitmentRow.day_plan_id,
    title: commitmentRow.title,
    startTime: commitmentRow.start_time,
    endTime: commitmentRow.end_time,
  };

  await assert.rejects(
    () =>
      createCommitmentWithRpc(input, async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message: "create_day_plan_commitment was not found",
        },
      })),
    MissingCommitmentMutationMigrationError,
  );
  await assert.rejects(
    () =>
      createCommitmentWithRpc(input, async () => ({
        data: null,
        error: { code: "P0001", message: "ECHO_DAY_PLAN_NOT_FOUND" },
      })),
    CommitmentDayPlanNotFoundError,
  );
  await assert.rejects(
    () =>
      deleteCommitmentWithRpc(
        commitmentRow.day_plan_id,
        commitmentRow.id,
        async () => ({
          data: null,
          error: { code: "P0001", message: "ECHO_COMMITMENT_NOT_FOUND" },
        }),
      ),
    CommitmentNotFoundError,
  );
  await assert.rejects(
    () =>
      createCommitmentWithRpc(input, async () => ({ data: null, error: null })),
    InvalidCommitmentPersistenceError,
  );
});
