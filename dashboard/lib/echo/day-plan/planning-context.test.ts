import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPlanningContext,
  InvalidPlanningContextError,
  MAX_CHECK_IN_NOTES_LENGTH,
} from "./planning-context.ts";
import type { PlanningContextInput } from "../types/planning-context.ts";

function validInput(overrides: Partial<PlanningContextInput> = {}): PlanningContextInput {
  return {
    planDate: "2026-08-02",
    availableFrom: "2026-08-02T14:00:00Z",
    endOfWorkTime: "2026-08-03T01:00:00Z",
    energy: 8,
    stress: 3,
    sleepQuality: "good",
    hasEaten: true,
    checkInNotes: null,
    checkInCompletedAt: "2026-08-02T13:55:00Z",
    ...overrides,
  };
}

test("capacity tier boundary: effective energy 3 is minimal", () => {
  const context = createPlanningContext(validInput({ energy: 3 }));
  assert.deepEqual(
    {
      tier: context.capacityTier,
      taskMinutes: context.maxScheduledTaskMinutes,
      breakAfter: context.breakAfterMinutes,
      breakDuration: context.breakDurationMinutes,
    },
    { tier: "minimal", taskMinutes: 90, breakAfter: 30, breakDuration: 15 },
  );
});

test("capacity tier boundary: effective energy 4 begins reduced", () => {
  assert.equal(createPlanningContext(validInput({ energy: 4 })).capacityTier, "reduced");
});

test("capacity tier boundary: effective energy 5 remains reduced", () => {
  const context = createPlanningContext(validInput({ energy: 5 }));
  assert.deepEqual(
    [context.capacityTier, context.maxScheduledTaskMinutes, context.breakAfterMinutes],
    ["reduced", 180, 45],
  );
});

test("capacity tier boundary: effective energy 6 begins steady", () => {
  assert.equal(createPlanningContext(validInput({ energy: 6 })).capacityTier, "steady");
});

test("capacity tier boundary: effective energy 7 remains steady", () => {
  const context = createPlanningContext(validInput({ energy: 7 }));
  assert.deepEqual(
    [context.capacityTier, context.maxScheduledTaskMinutes, context.breakAfterMinutes],
    ["steady", 300, 75],
  );
});

test("capacity tier boundary: effective energy 8 begins strong", () => {
  assert.equal(createPlanningContext(validInput({ energy: 8 })).capacityTier, "strong");
});

test("capacity tier boundary: effective energy 10 remains strong", () => {
  const context = createPlanningContext(validInput({ energy: 10 }));
  assert.deepEqual(
    [context.capacityTier, context.maxScheduledTaskMinutes, context.breakAfterMinutes],
    ["strong", 420, 90],
  );
});

test("stress boundary: stress 5 has no penalty", () => {
  assert.equal(createPlanningContext(validInput({ stress: 5 })).effectiveEnergy, 8);
});

test("stress boundary: stress 6 begins the elevated-stress penalty", () => {
  assert.equal(createPlanningContext(validInput({ stress: 6 })).effectiveEnergy, 7);
});

test("stress boundary: stress 7 remains the elevated-stress penalty", () => {
  assert.equal(createPlanningContext(validInput({ stress: 7 })).effectiveEnergy, 7);
});

test("stress boundary: stress 8 begins the high-stress penalty", () => {
  assert.equal(createPlanningContext(validInput({ stress: 8 })).effectiveEnergy, 6);
});

test("sleep quality applies explicit zero, one, and two point penalties", () => {
  assert.equal(createPlanningContext(validInput({ sleepQuality: "good" })).effectiveEnergy, 8);
  assert.equal(createPlanningContext(validInput({ sleepQuality: "okay" })).effectiveEnergy, 7);
  assert.equal(createPlanningContext(validInput({ sleepQuality: "poor" })).effectiveEnergy, 6);
});

test("not having eaten applies a one-point penalty", () => {
  assert.equal(createPlanningContext(validInput({ hasEaten: false })).effectiveEnergy, 7);
});

test("combined negative conditions compound into minimal capacity", () => {
  const context = createPlanningContext(
    validInput({ energy: 6, stress: 9, sleepQuality: "poor", hasEaten: false }),
  );
  assert.equal(context.effectiveEnergy, 1);
  assert.equal(context.capacityTier, "minimal");
  assert.equal(context.maxScheduledTaskMinutes, 90);
});

test("effective energy is clamped at 1", () => {
  const context = createPlanningContext(
    validInput({ energy: 1, stress: 10, sleepQuality: "poor", hasEaten: false }),
  );
  assert.equal(context.effectiveEnergy, 1);
});

test("checkInNotes is carried through but does not alter deterministic capacity", () => {
  const withoutNotes = createPlanningContext(validInput({ checkInNotes: null }));
  const withNotes = createPlanningContext(validInput({ checkInNotes: "Travel made today messy." }));
  assert.equal(withNotes.checkInNotes, "Travel made today messy.");
  assert.deepEqual(
    {
      effectiveEnergy: withNotes.effectiveEnergy,
      capacityTier: withNotes.capacityTier,
      maxScheduledTaskMinutes: withNotes.maxScheduledTaskMinutes,
    },
    {
      effectiveEnergy: withoutNotes.effectiveEnergy,
      capacityTier: withoutNotes.capacityTier,
      maxScheduledTaskMinutes: withoutNotes.maxScheduledTaskMinutes,
    },
  );
});

test("invalid energy and stress boundaries are rejected", () => {
  assert.throws(() => createPlanningContext(validInput({ energy: 0 })), InvalidPlanningContextError);
  assert.throws(() => createPlanningContext(validInput({ energy: 11 })), InvalidPlanningContextError);
  assert.throws(() => createPlanningContext(validInput({ stress: 0 })), InvalidPlanningContextError);
  assert.throws(() => createPlanningContext(validInput({ stress: 11 })), InvalidPlanningContextError);
});

test("overlong check-in notes are rejected", () => {
  assert.throws(
    () =>
      createPlanningContext(
        validInput({ checkInNotes: "x".repeat(MAX_CHECK_IN_NOTES_LENGTH + 1) }),
      ),
    InvalidPlanningContextError,
  );
});

test("invalid or reversed availability timestamps are rejected", () => {
  assert.throws(
    () => createPlanningContext(validInput({ availableFrom: "not-a-date" })),
    InvalidPlanningContextError,
  );
  assert.throws(
    () =>
      createPlanningContext(
        validInput({
          availableFrom: "2026-08-03T01:00:00Z",
          endOfWorkTime: "2026-08-02T14:00:00Z",
        }),
      ),
    InvalidPlanningContextError,
  );
});
