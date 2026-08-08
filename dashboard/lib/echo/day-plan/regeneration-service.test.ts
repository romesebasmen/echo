import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDayPlanRegeneration,
  DayPlanRecommendationProviderUnavailableError,
  InvalidDayPlanRegenerationApplicationError,
  InvalidDayPlanRecommendationProviderOutputError,
  proposeDayPlanRegeneration,
  StaleDayPlanRegenerationProposalError,
  type ApplyDayPlanRegenerationDeps,
  type DayPlanRecommendationProvider,
  type ProposeDayPlanRegenerationDeps,
} from "./regeneration-service.ts";
import { createDayPlanRegenerationFingerprint } from "./regeneration-fingerprint.ts";
import { createPlanningContext } from "./planning-context.ts";
import { generateSchedule as deterministicGenerateSchedule } from "./scheduler.ts";
import type { DraftScheduleBlock, GenerateScheduleInput } from "./scheduler.ts";
import { IncompleteCheckInError } from "./service.ts";
import { InvalidDayPlanRegenerationProposalError } from "./regeneration-proposal.ts";
import type {
  ApplyDayPlanRegenerationRequest,
  DayPlanRecommendationInput,
  DayPlanRegenerationProposalEnvelope,
} from "../types/day-plan-regeneration.ts";
import type { Commitment, DayPlan, ScheduleBlock } from "../types/day-plan.ts";
import type { PlanningContext } from "../types/planning-context.ts";
import type { Task } from "../types/task.ts";

const NOW = new Date("2026-07-23T13:00:00Z");

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
    checkInNotes: "A distracting home repair is happening today.",
    checkInCompletedAt: "2026-07-23T12:55:00Z",
    endOfWorkTime: "2026-07-23T20:00:00Z",
    status: "generated",
    createdAt: "2026-07-23T10:00:00Z",
    updatedAt: "2026-07-23T12:55:00Z",
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
    createdAt: "2026-07-20T10:00:00Z",
    updatedAt: "2026-07-20T10:00:00Z",
    completedAt: null,
    ...overrides,
  };
}

function fakeCommitment(id: string, overrides: Partial<Commitment> = {}): Commitment {
  return {
    id,
    dayPlanId: "plan-1",
    title: `Commitment ${id}`,
    startTime: "2026-07-23T16:00:00Z",
    endTime: "2026-07-23T17:00:00Z",
    responsibilityArea: null,
    createdAt: "2026-07-20T10:00:00Z",
    ...overrides,
  };
}

function planningContextFor(dayPlan: DayPlan): PlanningContext {
  return createPlanningContext({
    planDate: dayPlan.planDate,
    availableFrom: dayPlan.availableFrom,
    endOfWorkTime: dayPlan.endOfWorkTime,
    energy: dayPlan.energy,
    stress: dayPlan.stress!,
    sleepQuality: dayPlan.sleepQuality!,
    hasEaten: dayPlan.hasEaten!,
    checkInNotes: dayPlan.checkInNotes,
    checkInCompletedAt: dayPlan.checkInCompletedAt!,
  });
}

function applicationFrom(
  envelope: DayPlanRegenerationProposalEnvelope,
  recommendation: unknown = envelope.recommendation,
): ApplyDayPlanRegenerationRequest {
  return {
    schemaVersion: envelope.schemaVersion,
    recommendation,
    inputFingerprint: envelope.inputFingerprint,
    expectedCheckInCompletedAt: envelope.expectedCheckInCompletedAt,
  };
}

interface HarnessOptions {
  dayPlan?: DayPlan;
  tasks?: Task[];
  commitments?: Commitment[];
  providerOutput?: unknown | ((input: DayPlanRecommendationInput) => unknown);
  providerError?: Error;
  persistenceError?: Error;
  initialBlocks?: ScheduleBlock[];
}

function createHarness(options: HarnessOptions = {}) {
  const state = {
    dayPlan: options.dayPlan ?? fakeDayPlan(),
    tasks: options.tasks ?? [fakeTask("task-1"), fakeTask("task-2")],
    commitments: options.commitments ?? [fakeCommitment("commitment-1")],
    scheduleBlocks: [...(options.initialBlocks ?? [])],
  };
  const calls = {
    provider: [] as DayPlanRecommendationInput[],
    scheduler: [] as GenerateScheduleInput[],
    persistence: [] as DraftScheduleBlock[][],
  };

  const provider: DayPlanRecommendationProvider = {
    async recommend(input) {
      calls.provider.push(input);
      if (options.providerError) throw options.providerError;
      if (typeof options.providerOutput === "function") {
        return options.providerOutput(input);
      }
      if (options.providerOutput !== undefined) return options.providerOutput;
      return {
        explanation: "Keep the day focused and realistic.",
        recommendations: input.tasks.map((task) => ({
          taskId: task.id,
          disposition: "keep",
        })),
      };
    },
  };

  const deps: ProposeDayPlanRegenerationDeps & ApplyDayPlanRegenerationDeps = {
    provider,
    async getDayPlanForDate(planDate) {
      return state.dayPlan.planDate === planDate ? state.dayPlan : null;
    },
    async listTasks(query) {
      return state.tasks.filter((task) => !query.status || task.status === query.status);
    },
    async listCommitments(dayPlanId) {
      return state.commitments.filter((commitment) => commitment.dayPlanId === dayPlanId);
    },
    generateSchedule(input) {
      calls.scheduler.push(input);
      return deterministicGenerateSchedule(input);
    },
    async persistGeneratedSchedule(dayPlanId, expectedCheckInCompletedAt, blocks) {
      calls.persistence.push(blocks);
      if (options.persistenceError) throw options.persistenceError;
      if (state.dayPlan.checkInCompletedAt !== expectedCheckInCompletedAt) {
        throw new Error("atomic check-in version mismatch");
      }

      const persisted = blocks.map((block, index): ScheduleBlock => ({
        id: `persisted-${calls.persistence.length}-${index}`,
        dayPlanId,
        ...block,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      }));
      // Replacement semantics: prior blocks are not appended to the new set.
      state.scheduleBlocks = persisted;
      state.dayPlan = {
        ...state.dayPlan,
        status: "generated",
        updatedAt: new Date(NOW.getTime() + calls.persistence.length).toISOString(),
      };
      return { dayPlan: state.dayPlan, scheduleBlocks: persisted };
    },
  };

  return { state, calls, deps };
}

async function createProposal(
  harness: ReturnType<typeof createHarness>,
): Promise<DayPlanRegenerationProposalEnvelope> {
  return proposeDayPlanRegeneration(
    harness.state.dayPlan.planDate,
    harness.state.dayPlan.checkInCompletedAt!,
    harness.deps,
    NOW,
  );
}

test("proposal provider receives PlanningContext including checkInNotes", async () => {
  const harness = createHarness();

  await createProposal(harness);

  assert.equal(harness.calls.provider.length, 1);
  assert.equal(
    harness.calls.provider[0].planningContext.checkInNotes,
    "A distracting home repair is happening today.",
  );
  assert.equal(harness.calls.provider[0].planningContext.capacityTier, "steady");
  assert.equal(harness.calls.provider[0].planningContext.maxScheduledTaskMinutes, 300);
});

test("proposal provider receives current open tasks and commitments in canonical order", async () => {
  const done = fakeTask("task-done", { status: "done", completedAt: NOW.toISOString() });
  const harness = createHarness({
    tasks: [fakeTask("task-z"), done, fakeTask("task-a")],
    commitments: [fakeCommitment("commitment-z"), fakeCommitment("commitment-a")],
  });

  const proposal = await createProposal(harness);
  const input = harness.calls.provider[0];

  assert.deepEqual(input.tasks.map((task) => task.id), ["task-a", "task-z"]);
  assert.deepEqual(input.commitments.map((commitment) => commitment.id), [
    "commitment-a",
    "commitment-z",
  ]);
  assert.deepEqual(proposal.taskSummaries.map((task) => task.id), ["task-a", "task-z"]);
});

test("proposal creation calls the provider exactly once and performs no scheduling or writes", async () => {
  const harness = createHarness();

  const proposal = await createProposal(harness);

  assert.equal(harness.calls.provider.length, 1);
  assert.equal(harness.calls.scheduler.length, 0);
  assert.equal(harness.calls.persistence.length, 0);
  assert.equal(proposal.schemaVersion, 1);
  assert.equal(proposal.generatedAt, NOW.toISOString());
  assert.equal(proposal.expectedCheckInCompletedAt, "2026-07-23T12:55:00Z");
  assert.match(proposal.inputFingerprint, /^[a-f0-9]{64}$/);
});

test("invalid provider output is typed and never schedules or persists", async () => {
  const harness = createHarness({
    providerOutput: {
      explanation: "Invalid because one task is omitted.",
      recommendations: [{ taskId: "task-1", disposition: "keep" }],
    },
  });

  await assert.rejects(
    () => createProposal(harness),
    InvalidDayPlanRecommendationProviderOutputError,
  );
  assert.equal(harness.calls.provider.length, 1);
  assert.equal(harness.calls.scheduler.length, 0);
  assert.equal(harness.calls.persistence.length, 0);
});

test("provider failure is typed and never schedules or persists", async () => {
  const providerError = new Error("provider offline");
  const harness = createHarness({ providerError });

  await assert.rejects(
    () => createProposal(harness),
    (error: unknown) =>
      error instanceof DayPlanRecommendationProviderUnavailableError &&
      error.cause === providerError,
  );
  assert.equal(harness.calls.provider.length, 1);
  assert.equal(harness.calls.scheduler.length, 0);
  assert.equal(harness.calls.persistence.length, 0);
});

test("proposal creation rejects an incomplete check-in before calling the provider", async () => {
  const harness = createHarness({ dayPlan: fakeDayPlan({ stress: null }) });

  await assert.rejects(() => createProposal(harness), IncompleteCheckInError);
  assert.equal(harness.calls.provider.length, 0);
  assert.equal(harness.calls.persistence.length, 0);
});

test("proposal creation rejects a stale expected check-in before calling the provider", async () => {
  const harness = createHarness();

  await assert.rejects(
    () =>
      proposeDayPlanRegeneration(
        harness.state.dayPlan.planDate,
        "2026-07-23T12:00:00Z",
        harness.deps,
        NOW,
      ),
    (error: unknown) =>
      error instanceof StaleDayPlanRegenerationProposalError &&
      error.reason === "check-in-changed",
  );
  assert.equal(harness.calls.provider.length, 0);
});

test("repository task and commitment ordering does not change the fingerprint", async () => {
  const harness = createHarness({
    tasks: [fakeTask("task-z"), fakeTask("task-a")],
    commitments: [fakeCommitment("commitment-z"), fakeCommitment("commitment-a")],
  });
  const first = await createProposal(harness);

  harness.state.tasks.reverse();
  harness.state.commitments.reverse();
  const second = await createProposal(harness);

  assert.equal(first.inputFingerprint, second.inputFingerprint);
});

function fingerprintFor(
  dayPlan: DayPlan,
  openTasks: Task[],
  commitments: Commitment[],
): string {
  return createDayPlanRegenerationFingerprint({
    dayPlan,
    planningContext: planningContextFor(dayPlan),
    openTasks,
    commitments,
  });
}

test("fingerprint changes with saved check-in values and checkInNotes", () => {
  const dayPlan = fakeDayPlan();
  const tasks = [fakeTask("task-1")];
  const commitments = [fakeCommitment("commitment-1")];
  const original = fingerprintFor(dayPlan, tasks, commitments);

  assert.notEqual(
    fingerprintFor({ ...dayPlan, energy: 4 }, tasks, commitments),
    original,
  );
  assert.notEqual(
    fingerprintFor({ ...dayPlan, checkInNotes: "A different constraint." }, tasks, commitments),
    original,
  );
});

test("fingerprint changes with task metadata and open-task membership", () => {
  const dayPlan = fakeDayPlan();
  const task = fakeTask("task-1");
  const added = fakeTask("task-2");
  const commitments = [fakeCommitment("commitment-1")];
  const original = fingerprintFor(dayPlan, [task], commitments);

  assert.notEqual(
    fingerprintFor(dayPlan, [{ ...task, title: "Changed title" }], commitments),
    original,
  );
  assert.notEqual(fingerprintFor(dayPlan, [task, added], commitments), original);
  assert.notEqual(fingerprintFor(dayPlan, [], commitments), original);
  // Completion removes the task from the open-task set used for fingerprinting.
  const taskRepositoryRows: Task[] = [{ ...task, status: "done" }];
  const completedTasks = taskRepositoryRows.filter(
    (candidate) => candidate.status === "open",
  );
  assert.notEqual(fingerprintFor(dayPlan, completedTasks, commitments), original);
});

test("fingerprint changes with commitment times and details", () => {
  const dayPlan = fakeDayPlan();
  const tasks = [fakeTask("task-1")];
  const commitment = fakeCommitment("commitment-1");
  const original = fingerprintFor(dayPlan, tasks, [commitment]);

  assert.notEqual(
    fingerprintFor(dayPlan, tasks, [
      { ...commitment, startTime: "2026-07-23T17:00:00Z" },
    ]),
    original,
  );
  assert.notEqual(
    fingerprintFor(dayPlan, tasks, [{ ...commitment, title: "Changed commitment" }]),
    original,
  );
});

test("malformed application input is rejected with a typed error before scheduling", async () => {
  const harness = createHarness();

  await assert.rejects(
    () => applyDayPlanRegeneration(harness.state.dayPlan.planDate, null, harness.deps, NOW),
    InvalidDayPlanRegenerationApplicationError,
  );
  assert.equal(harness.calls.scheduler.length, 0);
  assert.equal(harness.calls.persistence.length, 0);
});

test("valid current proposal reaches deterministic scheduling and atomic persistence", async () => {
  const harness = createHarness();
  const proposal = await createProposal(harness);

  const result = await applyDayPlanRegeneration(
    harness.state.dayPlan.planDate,
    applicationFrom(proposal),
    harness.deps,
    NOW,
  );

  assert.equal(harness.calls.scheduler.length, 1);
  assert.equal(harness.calls.persistence.length, 1);
  assert.equal(result.dayPlan.status, "generated");
  assert.deepEqual(result.scheduleBlocks, harness.state.scheduleBlocks);
});

for (const change of ["task", "commitment"] as const) {
  test(`changed ${change} invalidates the proposal before scheduling or persistence`, async () => {
    const harness = createHarness();
    const proposal = await createProposal(harness);
    if (change === "task") {
      harness.state.tasks[0] = {
        ...harness.state.tasks[0],
        estimatedMinutes: 75,
        updatedAt: "2026-07-23T13:10:00Z",
      };
    } else {
      harness.state.commitments[0] = {
        ...harness.state.commitments[0],
        endTime: "2026-07-23T18:00:00Z",
      };
    }

    await assert.rejects(
      () =>
        applyDayPlanRegeneration(
          harness.state.dayPlan.planDate,
          applicationFrom(proposal),
          harness.deps,
          NOW,
        ),
      (error: unknown) =>
        error instanceof StaleDayPlanRegenerationProposalError &&
        error.reason === "planning-inputs-changed",
    );
    assert.equal(harness.calls.scheduler.length, 0);
    assert.equal(harness.calls.persistence.length, 0);
  });
}

test("changed check-in invalidates the proposal before scheduling or persistence", async () => {
  const harness = createHarness();
  const proposal = await createProposal(harness);
  harness.state.dayPlan = {
    ...harness.state.dayPlan,
    stress: 9,
    checkInCompletedAt: "2026-07-23T13:15:00Z",
  };

  await assert.rejects(
    () =>
      applyDayPlanRegeneration(
        harness.state.dayPlan.planDate,
        applicationFrom(proposal),
        harness.deps,
        NOW,
      ),
    (error: unknown) =>
      error instanceof StaleDayPlanRegenerationProposalError &&
      error.reason === "check-in-changed",
  );
  assert.equal(harness.calls.scheduler.length, 0);
  assert.equal(harness.calls.persistence.length, 0);
});

for (const invalidKind of ["unknown", "duplicate", "omitted"] as const) {
  test(`${invalidKind} task IDs are rejected again at apply time`, async () => {
    const harness = createHarness();
    const proposal = await createProposal(harness);
    const recommendations = proposal.recommendation.recommendations.map((item) => ({
      ...item,
    }));
    if (invalidKind === "unknown") recommendations[1].taskId = "task-unknown";
    if (invalidKind === "duplicate") recommendations[1].taskId = recommendations[0].taskId;
    if (invalidKind === "omitted") recommendations.pop();

    await assert.rejects(
      () =>
        applyDayPlanRegeneration(
          harness.state.dayPlan.planDate,
          applicationFrom(proposal, {
            explanation: proposal.recommendation.explanation,
            recommendations,
          }),
          harness.deps,
          NOW,
        ),
      InvalidDayPlanRegenerationProposalError,
    );
    assert.equal(harness.calls.scheduler.length, 0);
    assert.equal(harness.calls.persistence.length, 0);
  });
}

test("deferred and prioritized guidance reaches the deterministic scheduler", async () => {
  const lowScore = fakeTask("task-low", { priority: "low" });
  const urgent = fakeTask("task-urgent", {
    priority: "high",
    dueAt: "2026-07-20T10:00:00Z",
  });
  const deferred = fakeTask("task-deferred", { priority: "high" });
  const harness = createHarness({
    tasks: [urgent, deferred, lowScore],
    commitments: [],
    providerOutput: {
      explanation: "Prioritize the lighter task and defer one item.",
      recommendations: [
        { taskId: urgent.id, disposition: "keep" },
        { taskId: deferred.id, disposition: "defer" },
        { taskId: lowScore.id, disposition: "prioritize" },
      ],
    },
  });
  const proposal = await createProposal(harness);

  const result = await applyDayPlanRegeneration(
    harness.state.dayPlan.planDate,
    applicationFrom(proposal),
    harness.deps,
    NOW,
  );

  const guidance = harness.calls.scheduler[0].recommendationGuidance!;
  assert.equal(guidance.taskDispositions.get(lowScore.id), "prioritize");
  assert.equal(guidance.taskDispositions.get(deferred.id), "defer");
  assert.deepEqual(result.unscheduled.map((task) => task.id), [deferred.id]);
  assert.deepEqual(
    result.scheduleBlocks
      .filter((block) => block.sourceType === "task")
      .map((block) => block.sourceId),
    [lowScore.id, urgent.id],
  );
});

test("application ignores display-only task summaries and reloads authoritative tasks", async () => {
  const harness = createHarness();
  const proposal = await createProposal(harness);
  const request = {
    ...applicationFrom(proposal),
    taskSummaries: [{ id: "fake", title: "Injected", estimatedMinutes: 9999 }],
  };

  const result = await applyDayPlanRegeneration(
    harness.state.dayPlan.planDate,
    request,
    harness.deps,
    NOW,
  );

  assert.equal(result.scheduleBlocks.some((block) => block.title === "Injected"), false);
});

test("repeated valid application replaces blocks instead of creating duplicates", async () => {
  const harness = createHarness();
  const proposal = await createProposal(harness);
  const request = applicationFrom(proposal);

  const first = await applyDayPlanRegeneration(
    harness.state.dayPlan.planDate,
    request,
    harness.deps,
    NOW,
  );
  const second = await applyDayPlanRegeneration(
    harness.state.dayPlan.planDate,
    request,
    harness.deps,
    NOW,
  );

  assert.equal(harness.calls.persistence.length, 2);
  assert.equal(harness.state.scheduleBlocks.length, second.scheduleBlocks.length);
  assert.equal(harness.state.scheduleBlocks.length, first.scheduleBlocks.length);
});

test("persistence failure leaves the previous schedule untouched", async () => {
  const oldBlock: ScheduleBlock = {
    id: "old-block",
    dayPlanId: "plan-1",
    sourceType: "task",
    sourceId: "old-task",
    title: "Previous valid work",
    responsibilityArea: "echo",
    startTime: "2026-07-23T13:00:00Z",
    endTime: "2026-07-23T13:30:00Z",
    status: "scheduled",
    orderIndex: 0,
    createdAt: "2026-07-23T12:00:00Z",
    updatedAt: "2026-07-23T12:00:00Z",
  };
  const harness = createHarness({
    initialBlocks: [oldBlock],
    persistenceError: new Error("transaction rolled back"),
  });
  const proposal = await createProposal(harness);

  await assert.rejects(() =>
    applyDayPlanRegeneration(
      harness.state.dayPlan.planDate,
      applicationFrom(proposal),
      harness.deps,
      NOW,
    ),
  );

  assert.equal(harness.calls.scheduler.length, 1);
  assert.equal(harness.calls.persistence.length, 1);
  assert.deepEqual(harness.state.scheduleBlocks, [oldBlock]);
});
