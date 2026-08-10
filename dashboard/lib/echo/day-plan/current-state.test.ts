import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadCurrentDayPlanState,
  type LoadCurrentDayPlanStateDeps,
} from "./current-state.ts";
import type { DayPlan, ScheduleBlock } from "../types/day-plan.ts";
import type { Task } from "../types/task.ts";

function fakeDayPlan(overrides: Partial<DayPlan> = {}): DayPlan {
  return {
    id: "plan-1",
    userId: "sebastian",
    planDate: "2026-08-09",
    availableFrom: "2026-08-09T14:00:00.000Z",
    energy: 7,
    stress: 4,
    sleepQuality: "good",
    hasEaten: true,
    checkInNotes: null,
    checkInCompletedAt: "2026-08-09T13:55:00.000Z",
    endOfWorkTime: "2026-08-10T01:00:00.000Z",
    status: "generated",
    createdAt: "2026-08-09T13:55:00.000Z",
    updatedAt: "2026-08-09T14:00:00.000Z",
    ...overrides,
  };
}

function fakeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    userId: "sebastian",
    responsibilityArea: "echo",
    title: `Task ${id}`,
    description: null,
    status: "open",
    dueAt: null,
    estimatedMinutes: 30,
    energyRequired: "medium",
    priority: "medium",
    deepWork: false,
    createdAt: "2026-08-09T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function fakeBlock(
  id: string,
  sourceType: ScheduleBlock["sourceType"],
  sourceId: string | null,
): ScheduleBlock {
  return {
    id,
    dayPlanId: "plan-1",
    sourceType,
    sourceId,
    title: `Block ${id}`,
    responsibilityArea: sourceType === "task" ? "echo" : null,
    startTime: "2026-08-09T14:00:00.000Z",
    endTime: "2026-08-09T14:30:00.000Z",
    status: "scheduled",
    orderIndex: 0,
    createdAt: "2026-08-09T14:00:00.000Z",
    updatedAt: "2026-08-09T14:00:00.000Z",
  };
}

function depsFor(options: {
  dayPlan: DayPlan | null;
  blocks?: ScheduleBlock[];
  tasks?: Task[];
  calls?: string[];
}): LoadCurrentDayPlanStateDeps {
  return {
    async getDayPlanForDate() {
      options.calls?.push("getDayPlanForDate");
      return options.dayPlan;
    },
    async listScheduleBlocks() {
      options.calls?.push("listScheduleBlocks");
      return options.blocks ?? [];
    },
    async listTasks(query) {
      options.calls?.push(`listTasks:${query.status ?? "all"}`);
      return options.tasks ?? [];
    },
  };
}

test("loadCurrentDayPlanState returns an empty state when today's plan does not exist", async () => {
  const calls: string[] = [];
  const result = await loadCurrentDayPlanState(
    "2026-08-09",
    depsFor({ dayPlan: null, calls }),
  );

  assert.deepEqual(result, {
    dayPlan: null,
    planningContext: null,
    scheduleBlocks: [],
    unscheduled: [],
  });
  assert.deepEqual(calls, ["getDayPlanForDate"]);
});

test("loadCurrentDayPlanState does not expose blocks for a setup plan", async () => {
  const calls: string[] = [];
  const dayPlan = fakeDayPlan({ status: "setup" });
  const result = await loadCurrentDayPlanState(
    dayPlan.planDate,
    depsFor({ dayPlan, blocks: [fakeBlock("old", "task", "task-1")], calls }),
  );

  assert.equal(result.planningContext?.capacityTier, "steady");
  assert.deepEqual(result.scheduleBlocks, []);
  assert.deepEqual(result.unscheduled, []);
  assert.deepEqual(calls, ["getDayPlanForDate"]);
});

test("loadCurrentDayPlanState does not expose a generated plan with an incomplete check-in", async () => {
  const calls: string[] = [];
  const dayPlan = fakeDayPlan({ stress: null });
  const result = await loadCurrentDayPlanState(
    dayPlan.planDate,
    depsFor({ dayPlan, blocks: [fakeBlock("old", "task", "task-1")], calls }),
  );

  assert.equal(result.planningContext, null);
  assert.deepEqual(result.scheduleBlocks, []);
  assert.deepEqual(result.unscheduled, []);
  assert.deepEqual(calls, ["getDayPlanForDate"]);
});

test("loadCurrentDayPlanState reloads persisted blocks and derives unscheduled open tasks", async () => {
  const dayPlan = fakeDayPlan();
  const scheduled = fakeTask("scheduled");
  const deferred = fakeTask("deferred");
  const result = await loadCurrentDayPlanState(
    dayPlan.planDate,
    depsFor({
      dayPlan,
      blocks: [
        fakeBlock("task", "task", scheduled.id),
        fakeBlock("commitment", "commitment", "commitment-1"),
        fakeBlock("break", "break", null),
      ],
      tasks: [scheduled, deferred],
    }),
  );

  assert.equal(result.scheduleBlocks.length, 3);
  assert.deepEqual(result.unscheduled.map((task) => task.id), [deferred.id]);
});

test("only task blocks remove tasks from the unscheduled list", async () => {
  const task = fakeTask("shared-id");
  const result = await loadCurrentDayPlanState(
    "2026-08-09",
    depsFor({
      dayPlan: fakeDayPlan(),
      blocks: [fakeBlock("commitment", "commitment", task.id)],
      tasks: [task],
    }),
  );

  assert.deepEqual(result.unscheduled.map((item) => item.id), [task.id]);
});

test("a skipped task block returns its still-open task to unscheduled", async () => {
  const task = fakeTask("skipped-task");
  const result = await loadCurrentDayPlanState(
    "2026-08-09",
    depsFor({
      dayPlan: fakeDayPlan(),
      blocks: [
        { ...fakeBlock("skipped", "task", task.id), status: "skipped" },
      ],
      tasks: [task],
    }),
  );

  assert.deepEqual(result.unscheduled.map((item) => item.id), [task.id]);
});

test("a task completed outside the plan no longer appears actionable", async () => {
  const task = fakeTask("done-elsewhere", {
    status: "done",
    completedAt: "2026-08-09T15:00:00.000Z",
  });
  const result = await loadCurrentDayPlanState(
    "2026-08-09",
    depsFor({
      dayPlan: fakeDayPlan(),
      blocks: [fakeBlock("scheduled", "task", task.id)],
      tasks: [task],
    }),
  );

  assert.equal(result.scheduleBlocks[0]?.status, "completed");
  assert.deepEqual(result.unscheduled, []);
});

test("a reopened task with a completed block returns to unscheduled", async () => {
  const task = fakeTask("reopened");
  const result = await loadCurrentDayPlanState(
    "2026-08-09",
    depsFor({
      dayPlan: fakeDayPlan(),
      blocks: [
        { ...fakeBlock("completed", "task", task.id), status: "completed" },
      ],
      tasks: [task],
    }),
  );

  assert.equal(result.scheduleBlocks[0]?.status, "completed");
  assert.deepEqual(result.unscheduled.map((item) => item.id), [task.id]);
});

test("a deleted task cannot remain as an actionable persisted block", async () => {
  const result = await loadCurrentDayPlanState(
    "2026-08-09",
    depsFor({
      dayPlan: fakeDayPlan(),
      blocks: [
        fakeBlock("deleted-task", "task", "missing-task"),
        fakeBlock("commitment", "commitment", "commitment-1"),
      ],
      tasks: [],
    }),
  );

  assert.deepEqual(result.scheduleBlocks.map((block) => block.sourceType), [
    "commitment",
  ]);
});
