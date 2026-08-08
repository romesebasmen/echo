import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createApplyDayPlanRegenerationHandler,
  createProposeDayPlanRegenerationHandler,
  type ApplyDayPlanRegenerationHttpDeps,
  type ProposeDayPlanRegenerationHttpDeps,
} from "./regeneration-http.ts";
import {
  DayPlanNotFoundError,
  IncompleteCheckInError,
  InvalidCheckInStateError,
  type GenerateAndPersistDayPlanResult,
} from "./service.ts";
import {
  DayPlanRecommendationProviderUnavailableError,
  InvalidDayPlanRecommendationProviderOutputError,
  InvalidDayPlanRegenerationApplicationError,
  proposeDayPlanRegenerationWithContext,
  StaleDayPlanRegenerationProposalError,
  type ProposeDayPlanRegenerationResult,
} from "./regeneration-service.ts";
import { InvalidDayPlanRegenerationProposalError } from "./regeneration-proposal.ts";
import { MissingDailyCheckInMigrationError } from "./migration-error.ts";
import type { Commitment, DayPlan } from "../types/day-plan.ts";

const EXPECTED_CHECK_IN = "2026-07-23T12:55:00Z";

function planningContext() {
  return {
    planDate: "2026-07-23",
    availableFrom: "2026-07-23T13:00:00Z",
    endOfWorkTime: "2026-07-23T20:00:00Z",
    energy: 6,
    stress: 3,
    sleepQuality: "good" as const,
    hasEaten: true,
    checkInNotes: null,
    checkInCompletedAt: EXPECTED_CHECK_IN,
    effectiveEnergy: 6,
    capacityTier: "steady" as const,
    maxScheduledTaskMinutes: 300,
    breakAfterMinutes: 75,
    breakDurationMinutes: 10,
  };
}

function proposalResult(): ProposeDayPlanRegenerationResult {
  return {
    proposal: {
      schemaVersion: 1,
      recommendation: {
        explanation: "A focused plan.",
        recommendations: [],
      } as ProposeDayPlanRegenerationResult["proposal"]["recommendation"],
      inputFingerprint: "a".repeat(64),
      expectedCheckInCompletedAt: EXPECTED_CHECK_IN,
      generatedAt: "2026-07-23T13:00:00Z",
      taskSummaries: [],
    },
    planningContext: planningContext(),
  };
}

function generatedResult(): GenerateAndPersistDayPlanResult {
  return {
    dayPlan: {
      id: "plan-1",
      userId: "sebastian",
      planDate: "2026-07-23",
      availableFrom: "2026-07-23T13:00:00Z",
      energy: 6,
      stress: 3,
      sleepQuality: "good",
      hasEaten: true,
      checkInNotes: null,
      checkInCompletedAt: EXPECTED_CHECK_IN,
      endOfWorkTime: "2026-07-23T20:00:00Z",
      status: "generated",
      createdAt: "2026-07-23T12:00:00Z",
      updatedAt: "2026-07-23T13:00:00Z",
    },
    planningContext: planningContext(),
    scheduleBlocks: [],
    unscheduled: [],
  };
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeProposeDeps(
  overrides: Partial<ProposeDayPlanRegenerationHttpDeps> = {},
) {
  return {
    propose: async () => proposalResult(),
    logError: () => undefined,
    ...overrides,
  } satisfies ProposeDayPlanRegenerationHttpDeps;
}

function fakeApplyDeps(overrides: Partial<ApplyDayPlanRegenerationHttpDeps> = {}) {
  return {
    apply: async () => generatedResult(),
    logError: () => undefined,
    ...overrides,
  } satisfies ApplyDayPlanRegenerationHttpDeps;
}

test("regenerate POST accepts only expectedCheckInCompletedAt and returns proposal plus context", async () => {
  let captured: string | null = null;
  const handler = createProposeDayPlanRegenerationHandler(
    fakeProposeDeps({
      async propose(expected) {
        captured = expected;
        return proposalResult();
      },
    }),
  );

  const response = await handler(
    jsonRequest("/api/day-plan/regenerate", {
      expectedCheckInCompletedAt: EXPECTED_CHECK_IN,
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(captured, EXPECTED_CHECK_IN);
  assert.deepEqual(await response.json(), proposalResult());
});

for (const body of [
  {},
  { expectedCheckInCompletedAt: 123 },
  { expectedCheckInCompletedAt: "" },
  { expectedCheckInCompletedAt: EXPECTED_CHECK_IN, planningContext: {} },
]) {
  test(`regenerate POST rejects malformed body ${JSON.stringify(body)}`, async () => {
    let calls = 0;
    const handler = createProposeDayPlanRegenerationHandler(
      fakeProposeDeps({
        async propose() {
          calls += 1;
          return proposalResult();
        },
      }),
    );

    const response = await handler(jsonRequest("/api/day-plan/regenerate", body));

    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  });
}

test("regenerate POST rejects invalid JSON before orchestration", async () => {
  let calls = 0;
  const handler = createProposeDayPlanRegenerationHandler(
    fakeProposeDeps({
      async propose() {
        calls += 1;
        return proposalResult();
      },
    }),
  );
  const request = new Request("http://localhost/api/day-plan/regenerate", {
    method: "POST",
    body: "{broken",
  });

  const response = await handler(request);

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("zero-open-task HTTP flow returns a valid proposal without provider usage", async () => {
  let providerCalls = 0;
  const dayPlan: DayPlan = generatedResult().dayPlan;
  const commitment: Commitment = {
    id: "commitment-1",
    dayPlanId: dayPlan.id,
    title: "Fixed appointment",
    startTime: "2026-07-23T16:00:00Z",
    endTime: "2026-07-23T17:00:00Z",
    responsibilityArea: null,
    createdAt: "2026-07-23T10:00:00Z",
  };
  const handler = createProposeDayPlanRegenerationHandler(
    fakeProposeDeps({
      propose: (expected) =>
        proposeDayPlanRegenerationWithContext("2026-07-23", expected, {
          async getDayPlanForDate() {
            return dayPlan;
          },
          async listTasks() {
            return [];
          },
          async listCommitments() {
            return [commitment];
          },
          provider: {
            async recommend() {
              providerCalls += 1;
              throw new Error("must not run");
            },
          },
        }),
    }),
  );

  const response = await handler(
    jsonRequest("/api/day-plan/regenerate", {
      expectedCheckInCompletedAt: EXPECTED_CHECK_IN,
    }),
  );
  const body = (await response.json()) as ProposeDayPlanRegenerationResult;

  assert.equal(response.status, 200);
  assert.equal(providerCalls, 0);
  assert.deepEqual(body.proposal.recommendation.recommendations, []);
  assert.deepEqual(body.proposal.taskSummaries, []);
  assert.deepEqual(body.planningContext, planningContext());
});

test("apply POST passes only the strict authoritative proposal fields", async () => {
  let captured: unknown;
  const handler = createApplyDayPlanRegenerationHandler(
    fakeApplyDeps({
      async apply(request) {
        captured = request;
        return generatedResult();
      },
    }),
  );
  const requestBody = {
    schemaVersion: 1,
    recommendation: { explanation: "Keep focus.", recommendations: [] },
    inputFingerprint: "a".repeat(64),
    expectedCheckInCompletedAt: EXPECTED_CHECK_IN,
  };

  const response = await handler(
    jsonRequest("/api/day-plan/regenerate/apply", requestBody),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(captured, requestBody);
  assert.deepEqual(await response.json(), generatedResult());
});

for (const extraField of ["taskSummaries", "planningContext", "maxScheduledTaskMinutes"]) {
  test(`apply POST rejects client field ${extraField}`, async () => {
    let calls = 0;
    const handler = createApplyDayPlanRegenerationHandler(
      fakeApplyDeps({
        async apply() {
          calls += 1;
          return generatedResult();
        },
      }),
    );
    const body = {
      schemaVersion: 1,
      recommendation: { explanation: "Keep focus.", recommendations: [] },
      inputFingerprint: "a".repeat(64),
      expectedCheckInCompletedAt: EXPECTED_CHECK_IN,
      [extraField]: {},
    };

    const response = await handler(
      jsonRequest("/api/day-plan/regenerate/apply", body),
    );

    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  });
}

test("apply POST rejects a non-object recommendation", async () => {
  let calls = 0;
  const handler = createApplyDayPlanRegenerationHandler(
    fakeApplyDeps({
      async apply() {
        calls += 1;
        return generatedResult();
      },
    }),
  );

  const response = await handler(
    jsonRequest("/api/day-plan/regenerate/apply", {
      schemaVersion: 1,
      recommendation: [],
      inputFingerprint: "a".repeat(64),
      expectedCheckInCompletedAt: EXPECTED_CHECK_IN,
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("apply POST rejects a malformed input fingerprint", async () => {
  let calls = 0;
  const handler = createApplyDayPlanRegenerationHandler(
    fakeApplyDeps({
      async apply() {
        calls += 1;
        return generatedResult();
      },
    }),
  );

  const response = await handler(
    jsonRequest("/api/day-plan/regenerate/apply", {
      schemaVersion: 1,
      recommendation: { explanation: "Keep focus.", recommendations: [] },
      inputFingerprint: "not-a-sha-256-fingerprint",
      expectedCheckInCompletedAt: EXPECTED_CHECK_IN,
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

const invalidProposalCause = new InvalidDayPlanRegenerationProposalError("invalid output");
const mappedErrors: Array<{ name: string; error: Error; status: number }> = [
  { name: "missing plan", error: new DayPlanNotFoundError("2026-07-23"), status: 404 },
  {
    name: "incomplete check-in",
    error: new IncompleteCheckInError("2026-07-23", ["stress"]),
    status: 409,
  },
  {
    name: "stale proposal",
    error: new StaleDayPlanRegenerationProposalError("planning-inputs-changed"),
    status: 409,
  },
  {
    name: "provider unavailable",
    error: new DayPlanRecommendationProviderUnavailableError(new Error("offline")),
    status: 502,
  },
  {
    name: "invalid model output",
    error: new InvalidDayPlanRecommendationProviderOutputError(invalidProposalCause),
    status: 502,
  },
  {
    name: "invalid application",
    error: new InvalidDayPlanRegenerationApplicationError("bad request"),
    status: 400,
  },
  {
    name: "invalid recommendation",
    error: invalidProposalCause,
    status: 400,
  },
  {
    name: "invalid check-in state",
    error: new InvalidCheckInStateError("bad capacity input"),
    status: 400,
  },
  {
    name: "missing migration",
    error: new MissingDailyCheckInMigrationError(),
    status: 500,
  },
  { name: "repository failure", error: new Error("database unavailable"), status: 500 },
];

for (const mapped of mappedErrors) {
  test(`maps ${mapped.name} to HTTP ${mapped.status}`, async () => {
    const handler = createProposeDayPlanRegenerationHandler(
      fakeProposeDeps({
        async propose() {
          throw mapped.error;
        },
      }),
    );

    const response = await handler(
      jsonRequest("/api/day-plan/regenerate", {
        expectedCheckInCompletedAt: EXPECTED_CHECK_IN,
      }),
    );

    assert.equal(response.status, mapped.status);
  });
}

test("maps a typed atomic check-in race during persistence to HTTP 409", async () => {
  const handler = createApplyDayPlanRegenerationHandler(
    fakeApplyDeps({
      async apply() {
        throw new StaleDayPlanRegenerationProposalError("check-in-changed");
      },
    }),
  );

  const response = await handler(
    jsonRequest("/api/day-plan/regenerate/apply", {
      schemaVersion: 1,
      recommendation: { explanation: "Keep focus.", recommendations: [] },
      inputFingerprint: "a".repeat(64),
      expectedCheckInCompletedAt: EXPECTED_CHECK_IN,
    }),
  );

  assert.equal(response.status, 409);
});
