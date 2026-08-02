import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSchedule, repackFrom, selectNextStep } from "./scheduler.ts";
import type { Task } from "../types/task.ts";
import type { Commitment, ScheduleBlock } from "../types/day-plan.ts";

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
    currentEnergy: 6,
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
    currentEnergy: 6,
    now: NOW,
  });

  const urgentBlock = result.blocks.find((b) => b.sourceId === urgent.id)!;
  const nonUrgentBlock = result.blocks.find((b) => b.sourceId === nonUrgent.id)!;
  assert.ok(new Date(urgentBlock.startTime) < new Date(nonUrgentBlock.startTime));
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
    currentEnergy: 6,
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
    currentEnergy: 6,
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
    currentEnergy: 6,
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
    currentEnergy: 6,
    now: NOW,
  };

  const first = generateSchedule(input);
  const second = generateSchedule(input);

  assert.deepEqual(first, second);
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
