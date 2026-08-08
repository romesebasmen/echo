import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSchedule, repackFrom, selectNextStep } from "./scheduler.ts";
import {
  proposalToSchedulerGuidance,
  validateDayPlanRegenerationProposal,
} from "./regeneration-proposal.ts";
import type { Task } from "../types/task.ts";
import type { Commitment, ScheduleBlock } from "../types/day-plan.ts";
import type { PlanningContext } from "../types/planning-context.ts";
import type {
  DayPlanTaskRecommendation,
  TaskSchedulingGuidance,
} from "../types/day-plan-regeneration.ts";

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
    createdAt: "2026-07-23T15:00:00Z",
    updatedAt: "2026-07-23T15:00:00Z",
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

let blockCounter = 0;
function fakeBlock(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  blockCounter += 1;
  return {
    id: `block-${blockCounter}`,
    dayPlanId: "plan-1",
    sourceType: "task",
    sourceId: `task-${blockCounter}`,
    title: `Block ${blockCounter}`,
    responsibilityArea: "echo",
    startTime: "2026-07-23T15:00:00Z",
    endTime: "2026-07-23T15:30:00Z",
    status: "scheduled",
    orderIndex: 0,
    createdAt: "2026-07-23T10:00:00Z",
    updatedAt: "2026-07-23T10:00:00Z",
    ...overrides,
  };
}

const NOW = new Date("2026-07-23T13:00:00Z"); // 08:00 CDT

function fakePlanningContext(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    planDate: "2026-07-23",
    availableFrom: "2026-07-23T13:00:00Z",
    endOfWorkTime: "2026-07-23T20:00:00Z",
    energy: 6,
    stress: 3,
    sleepQuality: "good",
    hasEaten: true,
    checkInNotes: null,
    checkInCompletedAt: "2026-07-23T12:55:00Z",
    effectiveEnergy: 6,
    capacityTier: "steady",
    maxScheduledTaskMinutes: 300,
    breakAfterMinutes: 90,
    breakDurationMinutes: 10,
    ...overrides,
  };
}

function guidanceFor(
  tasks: Task[],
  recommendations: DayPlanTaskRecommendation[],
  commitments: Commitment[] = [],
): TaskSchedulingGuidance {
  return proposalToSchedulerGuidance(
    validateDayPlanRegenerationProposal(
      { explanation: "A validated test proposal.", recommendations },
      {
        openTaskIds: tasks.map((task) => task.id),
        commitmentIds: commitments.map((commitment) => commitment.id),
      },
    ),
  );
}

// ---- generateSchedule ----

test("generateSchedule carves out fixed commitments and never overlaps them", () => {
  const commitment = fakeCommitment({
    startTime: "2026-07-23T14:00:00Z",
    endTime: "2026-07-23T15:00:00Z",
  });
  const task = fakeTask({ estimatedMinutes: 120 });

  const result = generateSchedule({
    tasks: [task],
    commitments: [commitment],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T18:00:00Z"),
    planningContext: fakePlanningContext(),
    now: NOW,
  });

  const commitmentBlock = result.blocks.find((b) => b.sourceType === "commitment");
  const taskBlocks = result.blocks.filter((b) => b.sourceType === "task");

  assert.ok(commitmentBlock);
  const commitmentStartMs = new Date(commitmentBlock.startTime).getTime();
  const commitmentEndMs = new Date(commitmentBlock.endTime).getTime();

  for (const block of taskBlocks) {
    const overlaps: boolean =
      new Date(block.startTime).getTime() < commitmentEndMs &&
      new Date(block.endTime).getTime() > commitmentStartMs;
    assert.equal(overlaps, false);
  }
});

test("generateSchedule places higher-scored (more urgent) tasks earlier", () => {
  const urgent = fakeTask({
    title: "Urgent",
    dueAt: "2026-07-20T15:00:00Z", // overdue relative to NOW
    priority: "high",
    estimatedMinutes: 30,
  });
  const nonUrgent = fakeTask({
    title: "Not urgent",
    dueAt: null,
    priority: "low",
    estimatedMinutes: 30,
  });

  const result = generateSchedule({
    tasks: [nonUrgent, urgent], // deliberately out of priority order in the input
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T18:00:00Z"),
    planningContext: fakePlanningContext(),
    now: NOW,
  });

  const urgentBlock = result.blocks.find((b) => b.sourceId === urgent.id)!;
  const nonUrgentBlock = result.blocks.find((b) => b.sourceId === nonUrgent.id)!;
  assert.ok(new Date(urgentBlock.startTime) < new Date(nonUrgentBlock.startTime));
});

test("generateSchedule uses effectiveEnergy, not raw energy, for proven task scoring", () => {
  const highEnergyTask = fakeTask({
    title: "High-energy task",
    energyRequired: "high",
    priority: "medium",
  });
  const lowEnergyTask = fakeTask({
    title: "Low-energy task",
    energyRequired: "low",
    priority: "medium",
  });

  const result = generateSchedule({
    tasks: [highEnergyTask, lowEnergyTask],
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T18:00:00Z"),
    planningContext: fakePlanningContext({ energy: 10, effectiveEnergy: 2 }),
    now: NOW,
  });

  const highEnergyBlock = result.blocks.find((block) => block.sourceId === highEnergyTask.id)!;
  const lowEnergyBlock = result.blocks.find((block) => block.sourceId === lowEnergyTask.id)!;
  assert.ok(new Date(lowEnergyBlock.startTime) < new Date(highEnergyBlock.startTime));
});

test("generateSchedule inserts a break after roughly 90 continuous minutes of work", () => {
  const tasks = [
    fakeTask({ title: "A", estimatedMinutes: 60, priority: "high" }),
    fakeTask({ title: "B", estimatedMinutes: 40, priority: "high" }),
  ];

  const result = generateSchedule({
    tasks,
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T18:00:00Z"),
    planningContext: fakePlanningContext(),
    now: NOW,
  });

  const breakBlock = result.blocks.find((b) => b.sourceType === "break");
  assert.ok(breakBlock, "expected a break block after 100 minutes of continuous work");
});

test("generateSchedule prefers the largest interval for deep-work tasks", () => {
  // Two free windows: a small one first (09:00-10:00 CDT) then a large one
  // (11:00-15:00 CDT), created by a commitment in between.
  const commitment = fakeCommitment({
    startTime: "2026-07-23T15:00:00Z", // 10:00 CDT
    endTime: "2026-07-23T16:00:00Z", // 11:00 CDT
  });
  const deepWorkTask = fakeTask({ deepWork: true, estimatedMinutes: 45, priority: "medium" });

  const result = generateSchedule({
    tasks: [deepWorkTask],
    commitments: [commitment],
    availableFrom: new Date("2026-07-23T14:00:00Z"), // 09:00 CDT
    endOfWorkTime: new Date("2026-07-23T20:00:00Z"), // 15:00 CDT
    planningContext: fakePlanningContext(),
    now: NOW,
  });

  const block = result.blocks.find((b) => b.sourceId === deepWorkTask.id)!;
  // Should land in the large post-commitment window, not the small
  // pre-commitment one.
  assert.ok(new Date(block.startTime) >= new Date("2026-07-23T16:00:00Z"));
});

test("generateSchedule surfaces tasks that don't fit as unscheduled, never drops them silently", () => {
  const tasks = [fakeTask({ estimatedMinutes: 600 })]; // 10 hours, won't fit

  const result = generateSchedule({
    tasks,
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T14:00:00Z"), // 1-hour window
    planningContext: fakePlanningContext(),
    now: NOW,
  });

  assert.equal(result.unscheduled.length, 1);
  assert.equal(result.blocks.filter((b) => b.sourceType === "task").length, 0);
});

test("generateSchedule is deterministic: identical input always produces an identical timeline", () => {
  const tasks = [
    fakeTask({ title: "A", priority: "high", estimatedMinutes: 45 }),
    fakeTask({ title: "B", priority: "low", estimatedMinutes: 30, deepWork: true }),
    fakeTask({ title: "C", dueAt: "2026-07-23T20:00:00Z", estimatedMinutes: 20 }),
  ];
  const commitments = [fakeCommitment({ startTime: "2026-07-23T16:00:00Z", endTime: "2026-07-23T16:30:00Z" })];

  const input = {
    tasks,
    commitments,
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T20:00:00Z"),
    planningContext: fakePlanningContext(),
    now: NOW,
  };

  const first = generateSchedule(input);
  const second = generateSchedule(input);

  assert.deepEqual(first, second);
});

test("generateSchedule enforces maxScheduledTaskMinutes as a hard task-work budget", () => {
  const tasks = [
    fakeTask({ title: "First", estimatedMinutes: 60, priority: "high" }),
    fakeTask({ title: "Second", estimatedMinutes: 60, priority: "medium" }),
    fakeTask({ title: "Third", estimatedMinutes: 30, priority: "low" }),
  ];

  const result = generateSchedule({
    tasks,
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T20:00:00Z"),
    planningContext: fakePlanningContext({ maxScheduledTaskMinutes: 90 }),
    now: NOW,
  });

  const scheduledTaskMinutes = result.blocks
    .filter((block) => block.sourceType === "task")
    .reduce(
      (total, block) =>
        total +
        (new Date(block.endTime).getTime() - new Date(block.startTime).getTime()) / 60_000,
      0,
    );
  assert.equal(scheduledTaskMinutes, 90);
  assert.equal(result.unscheduled.length, 1);
  assert.equal(result.unscheduled[0].title, "Second");
});

test("generateSchedule never removes commitments when task capacity is exhausted", () => {
  const commitment = fakeCommitment({
    title: "Class",
    startTime: "2026-07-23T15:00:00Z",
    endTime: "2026-07-23T16:00:00Z",
  });
  const tasks = [
    fakeTask({ estimatedMinutes: 90, priority: "high" }),
    fakeTask({ estimatedMinutes: 30, priority: "low" }),
  ];

  const result = generateSchedule({
    tasks,
    commitments: [commitment],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T20:00:00Z"),
    planningContext: fakePlanningContext({ maxScheduledTaskMinutes: 90 }),
    now: NOW,
  });

  const commitmentBlock = result.blocks.find((block) => block.sourceType === "commitment");
  assert.equal(commitmentBlock?.sourceId, commitment.id);
  assert.equal(commitmentBlock?.title, "Class");
  assert.equal(result.unscheduled.length, 1);
});

test("generateSchedule uses the planning context break policy", () => {
  const tasks = [
    fakeTask({ title: "A", estimatedMinutes: 30, priority: "high" }),
    fakeTask({ title: "B", estimatedMinutes: 30, priority: "high" }),
  ];

  const result = generateSchedule({
    tasks,
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T16:00:00Z"),
    planningContext: fakePlanningContext({
      maxScheduledTaskMinutes: 90,
      breakAfterMinutes: 30,
      breakDurationMinutes: 15,
    }),
    now: NOW,
  });

  const breakBlock = result.blocks.find((block) => block.sourceType === "break");
  assert.ok(breakBlock);
  assert.equal(
    (new Date(breakBlock.endTime).getTime() - new Date(breakBlock.startTime).getTime()) / 60_000,
    15,
  );
});

test("a required break is not skipped when an interval fits only the task", () => {
  const first = fakeTask({ title: "First", estimatedMinutes: 30, priority: "high" });
  const second = fakeTask({ title: "Second", estimatedMinutes: 30, priority: "medium" });

  const result = generateSchedule({
    tasks: [first, second],
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T14:00:00Z"),
    planningContext: fakePlanningContext({
      breakAfterMinutes: 30,
      breakDurationMinutes: 15,
    }),
    now: NOW,
  });

  assert.equal(result.blocks.some((block) => block.sourceId === first.id), true);
  assert.equal(result.blocks.some((block) => block.sourceId === second.id), false);
  assert.deepEqual(result.unscheduled.map((task) => task.id), [second.id]);
});

test("scheduler considers a later interval that can fit the required break and task", () => {
  const commitment = fakeCommitment({
    startTime: "2026-07-23T14:00:00Z",
    endTime: "2026-07-23T14:15:00Z",
  });
  const first = fakeTask({
    title: "First interval work",
    estimatedMinutes: 30,
    priority: "high",
    dueAt: "2026-07-23T12:00:00Z",
  });
  const second = fakeTask({
    title: "Later interval work",
    estimatedMinutes: 30,
    priority: "high",
    deepWork: true,
  });
  const third = fakeTask({ title: "Needs break", estimatedMinutes: 30, priority: "low" });

  const result = generateSchedule({
    tasks: [first, second, third],
    commitments: [commitment],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T15:45:00Z"),
    planningContext: fakePlanningContext({
      breakAfterMinutes: 30,
      breakDurationMinutes: 15,
    }),
    now: NOW,
  });

  const thirdBlock = result.blocks.find((block) => block.sourceId === third.id);
  const breakBlock = result.blocks.find(
    (block) =>
      block.sourceType === "break" && block.startTime === "2026-07-23T14:45:00.000Z",
  );
  assert.ok(breakBlock);
  assert.equal(thirdBlock?.startTime, "2026-07-23T15:00:00.000Z");
});

test("a task remains unscheduled when no interval fits its required break", () => {
  const tasks = [
    fakeTask({ title: "First", estimatedMinutes: 30, priority: "high" }),
    fakeTask({ title: "Cannot bypass break", estimatedMinutes: 30, priority: "low" }),
  ];

  const result = generateSchedule({
    tasks,
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T14:00:00Z"),
    planningContext: fakePlanningContext({
      breakAfterMinutes: 30,
      breakDurationMinutes: 15,
    }),
    now: NOW,
  });

  assert.deepEqual(result.unscheduled.map((task) => task.title), ["Cannot bypass break"]);
  assert.equal(result.blocks.filter((block) => block.sourceType === "break").length, 0);
});

test("a commitment resets continuous-work tracking", () => {
  const commitment = fakeCommitment({
    startTime: "2026-07-23T13:30:00Z",
    endTime: "2026-07-23T13:45:00Z",
  });
  const tasks = [
    fakeTask({ title: "Before commitment", estimatedMinutes: 30, priority: "high" }),
    fakeTask({ title: "After commitment", estimatedMinutes: 30, priority: "low" }),
  ];

  const result = generateSchedule({
    tasks,
    commitments: [commitment],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T14:15:00Z"),
    planningContext: fakePlanningContext({
      breakAfterMinutes: 30,
      breakDurationMinutes: 15,
    }),
    now: NOW,
  });

  assert.equal(result.blocks.filter((block) => block.sourceType === "task").length, 2);
  assert.equal(result.blocks.filter((block) => block.sourceType === "break").length, 0);
  assert.equal(
    result.blocks.find((block) => block.title === "After commitment")?.startTime,
    "2026-07-23T13:45:00.000Z",
  );
});

test("recommendation categories lead ordering while existing scores remain deterministic", () => {
  const prioritizedLowScore = fakeTask({
    id: "guided-prioritize",
    priority: "low",
    dueAt: null,
  });
  const keptHighScore = fakeTask({
    id: "guided-keep",
    priority: "high",
    dueAt: "2026-07-20T15:00:00Z",
  });
  const deprioritizedHighScore = fakeTask({
    id: "guided-deprioritize",
    priority: "high",
    dueAt: "2026-07-20T15:00:00Z",
  });
  const tasks = [deprioritizedHighScore, keptHighScore, prioritizedLowScore];

  const result = generateSchedule({
    tasks,
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T18:00:00Z"),
    planningContext: fakePlanningContext(),
    recommendationGuidance: guidanceFor(tasks, [
      { taskId: deprioritizedHighScore.id, disposition: "deprioritize" },
      { taskId: keptHighScore.id, disposition: "keep" },
      { taskId: prioritizedLowScore.id, disposition: "prioritize" },
    ]),
    now: NOW,
  });

  assert.deepEqual(
    result.blocks.filter((block) => block.sourceType === "task").map((block) => block.sourceId),
    [prioritizedLowScore.id, keptHighScore.id, deprioritizedHighScore.id],
  );
});

test("proposal array order does not replace score ordering within a category", () => {
  const urgent = fakeTask({
    id: "same-category-urgent",
    priority: "high",
    dueAt: "2026-07-20T15:00:00Z",
  });
  const nonUrgent = fakeTask({
    id: "same-category-non-urgent",
    priority: "low",
    dueAt: null,
  });
  const tasks = [nonUrgent, urgent];

  const result = generateSchedule({
    tasks,
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T16:00:00Z"),
    planningContext: fakePlanningContext(),
    recommendationGuidance: guidanceFor(tasks, [
      { taskId: nonUrgent.id, disposition: "keep" },
      { taskId: urgent.id, disposition: "keep" },
    ]),
    now: NOW,
  });

  assert.deepEqual(
    result.blocks.filter((block) => block.sourceType === "task").map((block) => block.sourceId),
    [urgent.id, nonUrgent.id],
  );
});

test("existing task-ID tie-break remains authoritative within a recommendation category", () => {
  const taskZ = fakeTask({ id: "guided-task-z", title: "Z" });
  const taskA = fakeTask({ id: "guided-task-a", title: "A" });
  const tasks = [taskZ, taskA];

  const result = generateSchedule({
    tasks,
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T16:00:00Z"),
    planningContext: fakePlanningContext(),
    recommendationGuidance: guidanceFor(tasks, [
      { taskId: taskZ.id, disposition: "keep" },
      { taskId: taskA.id, disposition: "keep" },
    ]),
    now: NOW,
  });

  assert.deepEqual(
    result.blocks.filter((block) => block.sourceType === "task").map((block) => block.sourceId),
    [taskA.id, taskZ.id],
  );
});

test("deferred tasks are not packed, do not consume capacity, and surface as unscheduled", () => {
  const deferred = fakeTask({
    id: "guided-deferred",
    estimatedMinutes: 60,
    priority: "high",
    dueAt: "2026-07-20T15:00:00Z",
  });
  const kept = fakeTask({ id: "guided-kept", estimatedMinutes: 60, priority: "low" });
  const tasks = [deferred, kept];

  const result = generateSchedule({
    tasks,
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T16:00:00Z"),
    planningContext: fakePlanningContext({ maxScheduledTaskMinutes: 60 }),
    recommendationGuidance: guidanceFor(tasks, [
      { taskId: deferred.id, disposition: "defer" },
      { taskId: kept.id, disposition: "keep" },
    ]),
    now: NOW,
  });

  assert.deepEqual(
    result.blocks.filter((block) => block.sourceType === "task").map((block) => block.sourceId),
    [kept.id],
  );
  assert.deepEqual(result.unscheduled.map((task) => task.id), [deferred.id]);
});

test("recommendation guidance cannot override capacity or commitments", () => {
  const commitment = fakeCommitment({
    id: "guided-commitment",
    title: "Fixed class",
    startTime: "2026-07-23T14:00:00Z",
    endTime: "2026-07-23T15:00:00Z",
  });
  const first = fakeTask({ id: "guided-capacity-first", estimatedMinutes: 60 });
  const second = fakeTask({ id: "guided-capacity-second", estimatedMinutes: 60 });
  const tasks = [first, second];

  const result = generateSchedule({
    tasks,
    commitments: [commitment],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T18:00:00Z"),
    planningContext: fakePlanningContext({ maxScheduledTaskMinutes: 60 }),
    recommendationGuidance: guidanceFor(
      tasks,
      [
        { taskId: first.id, disposition: "prioritize" },
        { taskId: second.id, disposition: "prioritize" },
      ],
      [commitment],
    ),
    now: NOW,
  });

  assert.equal(result.blocks.filter((block) => block.sourceType === "task").length, 1);
  assert.deepEqual(result.unscheduled.map((task) => task.id), [second.id]);
  assert.equal(
    result.blocks.find((block) => block.sourceType === "commitment")?.sourceId,
    commitment.id,
  );
});

test("guided task ordering still obeys the deterministic break policy", () => {
  const first = fakeTask({ id: "guided-break-first", estimatedMinutes: 30 });
  const second = fakeTask({ id: "guided-break-second", estimatedMinutes: 30 });
  const tasks = [first, second];

  const result = generateSchedule({
    tasks,
    commitments: [],
    availableFrom: new Date("2026-07-23T13:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T15:00:00Z"),
    planningContext: fakePlanningContext({
      breakAfterMinutes: 30,
      breakDurationMinutes: 15,
    }),
    recommendationGuidance: guidanceFor(tasks, [
      { taskId: first.id, disposition: "prioritize" },
      { taskId: second.id, disposition: "keep" },
    ]),
    now: NOW,
  });

  const breakBlock = result.blocks.find((block) => block.sourceType === "break");
  assert.ok(breakBlock);
  assert.equal(breakBlock.startTime, "2026-07-23T13:30:00.000Z");
  assert.equal(breakBlock.endTime, "2026-07-23T13:45:00.000Z");
});

test("guided deep-work tasks still choose the largest fitting free interval", () => {
  const commitment = fakeCommitment({
    id: "guided-deep-work-commitment",
    startTime: "2026-07-23T15:00:00Z",
    endTime: "2026-07-23T16:00:00Z",
  });
  const deepWorkTask = fakeTask({
    id: "guided-deep-work",
    deepWork: true,
    estimatedMinutes: 45,
  });

  const result = generateSchedule({
    tasks: [deepWorkTask],
    commitments: [commitment],
    availableFrom: new Date("2026-07-23T14:00:00Z"),
    endOfWorkTime: new Date("2026-07-23T20:00:00Z"),
    planningContext: fakePlanningContext(),
    recommendationGuidance: guidanceFor(
      [deepWorkTask],
      [{ taskId: deepWorkTask.id, disposition: "prioritize" }],
      [commitment],
    ),
    now: NOW,
  });

  assert.equal(
    result.blocks.find((block) => block.sourceId === deepWorkTask.id)?.startTime,
    "2026-07-23T16:00:00.000Z",
  );
});

// ---- repackFrom ----

test("repackFrom leaves completed and skipped blocks untouched", () => {
  const completed = fakeBlock({ status: "completed", startTime: "2026-07-23T12:00:00Z", endTime: "2026-07-23T12:30:00Z" });
  const skipped = fakeBlock({ status: "skipped", startTime: "2026-07-23T12:30:00Z", endTime: "2026-07-23T13:00:00Z" });
  const scheduled = fakeBlock({ status: "scheduled", startTime: "2026-07-23T13:00:00Z", endTime: "2026-07-23T13:30:00Z" });

  const result = repackFrom({
    blocks: [completed, skipped, scheduled],
    commitments: [],
    now: NOW,
    endOfWorkTime: new Date("2026-07-23T20:00:00Z"),
  });

  // orderIndex is expected to change (it reflects final chronological
  // position across the whole re-sorted set) — everything else about a
  // completed/skipped block must stay exactly as it was.
  const untouchedCompleted = result.blocks.find((b) => b.id === completed.id);
  const untouchedSkipped = result.blocks.find((b) => b.id === skipped.id);
  assert.deepEqual({ ...untouchedCompleted, orderIndex: 0 }, { ...completed, orderIndex: 0 });
  assert.deepEqual({ ...untouchedSkipped, orderIndex: 0 }, { ...skipped, orderIndex: 0 });
});

test("repackFrom shifts remaining scheduled blocks to start no earlier than now", () => {
  // A block originally scheduled in the past (before NOW) should be shifted
  // to start at/after NOW when repacked.
  const staleBlock = fakeBlock({
    status: "scheduled",
    startTime: "2026-07-23T11:00:00Z",
    endTime: "2026-07-23T11:30:00Z",
  });

  const result = repackFrom({
    blocks: [staleBlock],
    commitments: [],
    now: NOW,
    endOfWorkTime: new Date("2026-07-23T20:00:00Z"),
  });

  const relaid = result.blocks.find((b) => b.id === staleBlock.id)!;
  assert.ok(new Date(relaid.startTime) >= NOW);
});

test("repackFrom bumps blocks that no longer fit before end of work time", () => {
  const block = fakeBlock({
    status: "scheduled",
    startTime: "2026-07-23T13:00:00Z",
    endTime: "2026-07-23T14:00:00Z", // 60 min
  });

  const result = repackFrom({
    blocks: [block],
    commitments: [],
    now: NOW,
    endOfWorkTime: new Date("2026-07-23T13:30:00Z"), // only 30 min left — doesn't fit
  });

  assert.equal(result.bumped.length, 1);
  assert.equal(result.bumped[0].id, block.id);
});

// ---- selectNextStep ----

test("selectNextStep returns the currently active block when now falls within it", () => {
  const active = fakeBlock({ startTime: "2026-07-23T12:30:00Z", endTime: "2026-07-23T13:30:00Z" });
  const upcoming = fakeBlock({ startTime: "2026-07-23T14:00:00Z", endTime: "2026-07-23T14:30:00Z" });

  const next = selectNextStep([active, upcoming], NOW);
  assert.equal(next?.id, active.id);
});

test("selectNextStep returns the next upcoming block when nothing is currently active", () => {
  const later = fakeBlock({ startTime: "2026-07-23T15:00:00Z", endTime: "2026-07-23T15:30:00Z" });
  const soonest = fakeBlock({ startTime: "2026-07-23T14:00:00Z", endTime: "2026-07-23T14:30:00Z" });

  const next = selectNextStep([later, soonest], NOW);
  assert.equal(next?.id, soonest.id);
});

test("selectNextStep returns an earlier unfinished block needing recovery when nothing is active or upcoming", () => {
  const missed = fakeBlock({ startTime: "2026-07-23T11:00:00Z", endTime: "2026-07-23T11:30:00Z" });

  const next = selectNextStep([missed], NOW);
  assert.equal(next?.id, missed.id);
});

test("selectNextStep prioritizes active over a missed earlier block", () => {
  const missed = fakeBlock({ startTime: "2026-07-23T11:00:00Z", endTime: "2026-07-23T11:30:00Z" });
  const active = fakeBlock({ startTime: "2026-07-23T12:30:00Z", endTime: "2026-07-23T13:30:00Z" });

  const next = selectNextStep([missed, active], NOW);
  assert.equal(next?.id, active.id);
});

test("selectNextStep returns null when all work is complete or skipped", () => {
  const completed = fakeBlock({ status: "completed" });
  const skipped = fakeBlock({ status: "skipped" });

  const next = selectNextStep([completed, skipped], NOW);
  assert.equal(next, null);
});

test("selectNextStep returns null when there are no blocks at all", () => {
  assert.equal(selectNextStep([], NOW), null);
});

test("selectNextStep treats the exact end-time boundary as no longer active", () => {
  // A block ending exactly at `now` should not be "active" (end is exclusive).
  const justEnded = fakeBlock({ startTime: "2026-07-23T12:30:00Z", endTime: "2026-07-23T13:00:00Z" });

  const next = selectNextStep([justEnded], NOW);
  // Falls through to "needs recovery", not "active".
  assert.equal(next?.id, justEnded.id);
});
