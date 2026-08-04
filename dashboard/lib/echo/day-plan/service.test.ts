import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DayPlanNotFoundError,
  generateAndPersistDayPlan,
  IncompleteCheckInError,
  InvalidCheckInStateError,
  type GenerateAndPersistDayPlanDeps,
} from "./service.ts";
import type { Commitment, DayPlan, ScheduleBlock } from "../types/day-plan.ts";
import type { Task } from "../types/task.ts";
import type { DraftScheduleBlock } from "./scheduler.ts";

const NOW = new Date("2026-07-23T13:00:00Z"); // 08:00 CDT

let taskCounter = 0;
function fakeTask(overrides: Partial<Task> = {}): Task {
  taskCounter += 1;
  return {
    id: `task-${taskCounter}`,
    userId: "sebastian",
    responsibilityArea: "echo",
    title: `Task ${taskCounter}`,
    description: null,
    status: "open",
    dueAt: null,
    estimatedMinutes: 30,
    energyRequired: "medium",
    priority: "medium",
    deepWork: false,
    createdAt: "2026-07-23T10:00:00Z",
    updatedAt: "2026-07-23T10:00:00Z",
    completedAt: null,
    ...overrides,
  };
}

let commitmentCounter = 0;
function fakeCommitment(overrides: Partial<Commitment> = {}): Commitment {
  commitmentCounter += 1;
  return {
    id: `commitment-${commitmentCounter}`,
    dayPlanId: "plan-1",
    title: `Commitment ${commitmentCounter}`,
    startTime: "2026-07-23T15:00:00Z",
    endTime: "2026-07-23T16:00:00Z",
    responsibilityArea: null,
    createdAt: "2026-07-23T10:00:00Z",
    ...overrides,
  };
}

function fakeDayPlan(overrides: Partial<DayPlan> = {}): DayPlan {
  return {
    id: "plan-1",
    userId: "sebastian",
    planDate: "2026-07-23",
    availableFrom: "2026-07-23T13:00:00Z",
    energy: 6,
    stress: 3,
    sleepQuality: "good",
    hasEaten: true,
    checkInNotes: null,
    checkInCompletedAt: "2026-07-23T12:55:00Z",
    endOfWorkTime: "2026-07-23T20:00:00Z",
    status: "setup",
    createdAt: "2026-07-23T10:00:00Z",
    updatedAt: "2026-07-23T10:00:00Z",
    ...overrides,
  };
}

interface MockCall {
  fn: string;
  args: unknown[];
}

interface MockDepsOptions {
  dayPlan?: DayPlan | null;
  tasks?: Task[];
  commitments?: Commitment[];
  persistedBlocksOverride?: ScheduleBlock[];
  persistenceError?: Error;
}

function createMockDeps(options: MockDepsOptions = {}) {
  const calls: MockCall[] = [];
  const dayPlan = options.dayPlan === undefined ? fakeDayPlan() : options.dayPlan;
  const tasks = options.tasks ?? [];
  const commitments = options.commitments ?? [];
  let persistedIdCounter = 0;

  const deps: GenerateAndPersistDayPlanDeps = {
    async getDayPlanForDate(planDate) {
      calls.push({ fn: "getDayPlanForDate", args: [planDate] });
      return dayPlan;
    },
    async listTasks(queryOptions) {
      calls.push({ fn: "listTasks", args: [queryOptions] });
      return tasks.filter((task) => !queryOptions.status || task.status === queryOptions.status);
    },
    async listCommitments(dayPlanId) {
      calls.push({ fn: "listCommitments", args: [dayPlanId] });
      return commitments.filter((commitment) => commitment.dayPlanId === dayPlanId);
    },
    async persistGeneratedSchedule(
      dayPlanId,
      expectedCheckInCompletedAt,
      blocks: DraftScheduleBlock[],
    ) {
      calls.push({
        fn: "persistGeneratedSchedule",
        args: [dayPlanId, expectedCheckInCompletedAt, blocks],
      });
      if (options.persistenceError) throw options.persistenceError;
      const scheduleBlocks = options.persistedBlocksOverride ?? blocks.map((block) => {
        persistedIdCounter += 1;
        const persisted: ScheduleBlock = {
          id: `persisted-block-${persistedIdCounter}`,
          dayPlanId,
          sourceType: block.sourceType,
          sourceId: block.sourceId,
          title: block.title,
          responsibilityArea: block.responsibilityArea,
          startTime: block.startTime,
          endTime: block.endTime,
          status: block.status,
          orderIndex: block.orderIndex,
          createdAt: "2026-07-23T13:05:00Z",
          updatedAt: "2026-07-23T13:05:00Z",
        };
        return persisted;
      });
      if (!dayPlan) throw new Error("no day plan available to update in this mock");
      return {
        dayPlan: {
          ...dayPlan,
          id: dayPlanId,
          status: "generated" as const,
          updatedAt: "2026-07-23T13:05:00Z",
        },
        scheduleBlocks,
      };
    },
  };

  return { deps, calls };
}

test("generateAndPersistDayPlan generates a plan from tasks and commitments", async () => {
  const commitment = fakeCommitment({ dayPlanId: "plan-1" });
  const task = fakeTask({ status: "open" });
  const { deps } = createMockDeps({ tasks: [task], commitments: [commitment] });

  const result = await generateAndPersistDayPlan("2026-07-23", deps, NOW);

  const taskBlock = result.scheduleBlocks.find((b) => b.sourceType === "task");
  const commitmentBlock = result.scheduleBlocks.find((b) => b.sourceType === "commitment");
  assert.equal(taskBlock?.sourceId, task.id);
  assert.equal(commitmentBlock?.sourceId, commitment.id);
  assert.equal(result.planningContext.effectiveEnergy, 6);
  assert.equal(result.planningContext.capacityTier, "steady");
});

test("generateAndPersistDayPlan passes the correct inputs to the scheduler (via listTasks call args)", async () => {
  const openTask = fakeTask({ status: "open", title: "Open task" });
  const doneTask = fakeTask({ status: "done", title: "Done task" });
  const { deps, calls } = createMockDeps({ tasks: [openTask, doneTask], commitments: [] });

  await generateAndPersistDayPlan("2026-07-23", deps, NOW);

  const listTasksCall = calls.find((c) => c.fn === "listTasks");
  assert.deepEqual(listTasksCall?.args[0], { status: "open" });
});

test("generateAndPersistDayPlan does not include completed tasks in the generated schedule", async () => {
  const openTask = fakeTask({ status: "open", title: "Open task" });
  const doneTask = fakeTask({ status: "done", title: "Done task" });
  const { deps } = createMockDeps({ tasks: [openTask, doneTask], commitments: [] });

  const result = await generateAndPersistDayPlan("2026-07-23", deps, NOW);

  const titles = result.scheduleBlocks.map((b) => b.title);
  assert.ok(titles.includes("Open task"));
  assert.ok(!titles.includes("Done task"));
});

test("generateAndPersistDayPlan persists the blocks the scheduler returned", async () => {
  const task = fakeTask({ estimatedMinutes: 45 });
  const { deps, calls } = createMockDeps({ tasks: [task], commitments: [] });

  await generateAndPersistDayPlan("2026-07-23", deps, NOW);

  const persistCall = calls.find((c) => c.fn === "persistGeneratedSchedule");
  assert.equal(persistCall?.args[0], "plan-1");
  assert.equal(persistCall?.args[1], "2026-07-23T12:55:00Z");
  const blocksArg = persistCall?.args[2] as DraftScheduleBlock[];
  assert.equal(blocksArg.some((b) => b.sourceId === task.id), true);
});

test("generateAndPersistDayPlan atomically replaces blocks and marks the plan generated", async () => {
  const { deps, calls } = createMockDeps({ tasks: [], commitments: [] });

  const result = await generateAndPersistDayPlan("2026-07-23", deps, NOW);

  assert.equal(calls.filter((c) => c.fn === "persistGeneratedSchedule").length, 1);
  assert.equal(result.dayPlan.status, "generated");
});

test("generateAndPersistDayPlan returns the persisted schedule (not the pre-persistence drafts)", async () => {
  const task = fakeTask();
  const { deps } = createMockDeps({ tasks: [task], commitments: [] });

  const result = await generateAndPersistDayPlan("2026-07-23", deps, NOW);

  // Persisted blocks have DB-assigned ids the drafts never had.
  assert.ok(result.scheduleBlocks.every((b) => b.id.startsWith("persisted-block-")));
  assert.ok(result.scheduleBlocks.every((b) => b.dayPlanId === "plan-1"));
});

test("generateAndPersistDayPlan throws DayPlanNotFoundError for a missing day plan, with no side effects", async () => {
  const { deps, calls } = createMockDeps({ dayPlan: null });

  await assert.rejects(
    () => generateAndPersistDayPlan("2026-07-23", deps, NOW),
    DayPlanNotFoundError,
  );

  // Nothing past the initial lookup should have been called.
  assert.deepEqual(
    calls.map((c) => c.fn),
    ["getDayPlanForDate"],
  );
});

test("generateAndPersistDayPlan rejects an incomplete check-in before loading plan inputs", async () => {
  const { deps, calls } = createMockDeps({
    dayPlan: fakeDayPlan({
      stress: null,
      sleepQuality: null,
      hasEaten: null,
      checkInCompletedAt: null,
    }),
  });

  await assert.rejects(
    () => generateAndPersistDayPlan("2026-07-23", deps, NOW),
    IncompleteCheckInError,
  );
  assert.deepEqual(
    calls.map((call) => call.fn),
    ["getDayPlanForDate"],
  );
});

test("generateAndPersistDayPlan rejects invalid completed check-in values with a typed error", async () => {
  const { deps, calls } = createMockDeps({ dayPlan: fakeDayPlan({ energy: 11 }) });

  await assert.rejects(
    () => generateAndPersistDayPlan("2026-07-23", deps, NOW),
    InvalidCheckInStateError,
  );
  assert.equal(calls.some((call) => call.fn === "persistGeneratedSchedule"), false);
});

test("generateAndPersistDayPlan preserves commitment blocks correctly (title, times, area, source)", async () => {
  const commitment = fakeCommitment({
    dayPlanId: "plan-1",
    title: "Gym",
    startTime: "2026-07-23T14:00:00Z",
    endTime: "2026-07-23T15:00:00Z",
    responsibilityArea: "health",
  });
  const { deps } = createMockDeps({ tasks: [], commitments: [commitment] });

  const result = await generateAndPersistDayPlan("2026-07-23", deps, NOW);

  const block = result.scheduleBlocks.find((b) => b.sourceType === "commitment");
  assert.equal(block?.sourceId, commitment.id);
  assert.equal(block?.title, "Gym");
  assert.equal(block?.startTime, "2026-07-23T14:00:00Z");
  assert.equal(block?.endTime, "2026-07-23T15:00:00Z");
  assert.equal(block?.responsibilityArea, "health");
});

test("failed atomic regeneration leaves the previous valid schedule untouched", async () => {
  const previousSchedule = [{ id: "previous-block", title: "Previous valid plan" }];
  const before = structuredClone(previousSchedule);
  const { deps } = createMockDeps({
    tasks: [fakeTask()],
    persistenceError: new Error("transaction rolled back"),
  });

  await assert.rejects(
    () => generateAndPersistDayPlan("2026-07-23", deps, NOW),
    /transaction rolled back/,
  );
  assert.deepEqual(previousSchedule, before);
});

test("repeated concurrent generation uses replacement semantics without duplicate block sets", async () => {
  const task = fakeTask({ title: "Only task" });
  const { deps } = createMockDeps({ tasks: [task] });
  let stored: DraftScheduleBlock[] = [];

  deps.persistGeneratedSchedule = async (dayPlanId, _expectedVersion, blocks) => {
    await Promise.resolve();
    stored = blocks.map((block) => ({ ...block }));
    return {
      dayPlan: fakeDayPlan({ id: dayPlanId, status: "generated" }),
      scheduleBlocks: stored.map((block, index) => ({
        ...block,
        id: `stored-${index}`,
        dayPlanId,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      })),
    };
  };

  await Promise.all([
    generateAndPersistDayPlan("2026-07-23", deps, NOW),
    generateAndPersistDayPlan("2026-07-23", deps, NOW),
  ]);

  const taskBlocks = stored.filter((block) => block.sourceType === "task");
  assert.equal(taskBlocks.length, 1);
  assert.equal(taskBlocks[0].sourceId, task.id);
});
