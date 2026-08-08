import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InvalidDayPlanRegenerationProposalError,
  MAX_REGENERATION_EXPLANATION_LENGTH,
  proposalToSchedulerGuidance,
  validateDayPlanRegenerationProposal,
} from "./regeneration-proposal.ts";

const SCOPE = {
  openTaskIds: ["task-1", "task-2", "task-3", "task-4"],
  completedTaskIds: ["task-completed"],
  commitmentIds: ["commitment-1"],
} as const;

function validProposal() {
  return {
    explanation: "Focus on the deadline and leave lower-impact work for later.",
    recommendations: [
      { taskId: "task-1", disposition: "prioritize" },
      { taskId: "task-2", disposition: "keep" },
      { taskId: "task-3", disposition: "deprioritize" },
      { taskId: "task-4", disposition: "defer" },
    ],
  };
}

test("accepts the exact contract and all four dispositions", () => {
  const proposal = validateDayPlanRegenerationProposal(validProposal(), SCOPE);

  assert.deepEqual(proposal, validProposal());
});

test("normalizes surrounding whitespace in the user-facing explanation", () => {
  const input = validProposal();
  input.explanation = "  A calm, focused plan.  ";

  const proposal = validateDayPlanRegenerationProposal(input, SCOPE);

  assert.equal(proposal.explanation, "A calm, focused plan.");
});

test("accepts an explanation at the exact length limit", () => {
  const input = validProposal();
  input.explanation = "a".repeat(MAX_REGENERATION_EXPLANATION_LENGTH);

  assert.doesNotThrow(() => validateDayPlanRegenerationProposal(input, SCOPE));
});

test("rejects non-object proposals", () => {
  assert.throws(
    () => validateDayPlanRegenerationProposal(null, SCOPE),
    InvalidDayPlanRegenerationProposalError,
  );
});

test("rejects empty explanations", () => {
  const input = validProposal();
  input.explanation = "   ";

  assert.throws(
    () => validateDayPlanRegenerationProposal(input, SCOPE),
    /explanation must be non-empty text/,
  );
});

test("rejects explanations above the length limit", () => {
  const input = validProposal();
  input.explanation = "a".repeat(MAX_REGENERATION_EXPLANATION_LENGTH + 1);

  assert.throws(
    () => validateDayPlanRegenerationProposal(input, SCOPE),
    /explanation must be at most 600 characters/,
  );
});

test("rejects an invalid disposition", () => {
  const input = validProposal();
  input.recommendations[0].disposition = "schedule-at-nine";

  assert.throws(
    () => validateDayPlanRegenerationProposal(input, SCOPE),
    /disposition must be prioritize, keep, deprioritize, or defer/,
  );
});

test("rejects duplicate task IDs", () => {
  const input = validProposal();
  input.recommendations[1].taskId = "task-1";

  assert.throws(
    () => validateDayPlanRegenerationProposal(input, SCOPE),
    /task task-1 appears more than once/,
  );
});

test("rejects omitted open tasks", () => {
  const input = validProposal();
  input.recommendations.pop();

  assert.throws(
    () => validateDayPlanRegenerationProposal(input, SCOPE),
    /every open task must appear exactly once; omitted: task-4/,
  );
});

test("rejects unknown task IDs", () => {
  const input = validProposal();
  input.recommendations[3].taskId = "task-unknown";

  assert.throws(
    () => validateDayPlanRegenerationProposal(input, SCOPE),
    /unknown task task-unknown/,
  );
});

test("rejects completed task IDs", () => {
  const input = validProposal();
  input.recommendations[3].taskId = "task-completed";

  assert.throws(
    () => validateDayPlanRegenerationProposal(input, SCOPE),
    /completed task task-completed/,
  );
});

test("rejects commitment IDs", () => {
  const input = validProposal();
  input.recommendations[3].taskId = "commitment-1";

  assert.throws(
    () => validateDayPlanRegenerationProposal(input, SCOPE),
    /commitment commitment-1 cannot appear as a task recommendation/,
  );
});

test("rejects extra top-level fields", () => {
  const input = { ...validProposal(), scheduleBlocks: [] };

  assert.throws(
    () => validateDayPlanRegenerationProposal(input, SCOPE),
    /top-level object must contain exactly explanation and recommendations/,
  );
});

for (const forbiddenField of [
  "startTime",
  "score",
  "durationMinutes",
  "scheduleBlocks",
  "maxScheduledTaskMinutes",
  "commitmentAction",
  "breakAfterMinutes",
] as const) {
  test(`rejects forbidden recommendation field ${forbiddenField}`, () => {
    const input = validProposal() as unknown as {
      explanation: string;
      recommendations: Array<Record<string, unknown>>;
    };
    input.recommendations[0][forbiddenField] = "not allowed";

    assert.throws(
      () => validateDayPlanRegenerationProposal(input, SCOPE),
      /each recommendation must contain exactly taskId and disposition/,
    );
  });
}

test("converts only validated task dispositions into scheduler guidance", () => {
  const validated = validateDayPlanRegenerationProposal(validProposal(), SCOPE);
  const guidance = proposalToSchedulerGuidance(validated);

  assert.deepEqual([...guidance.taskDispositions.entries()], [
    ["task-1", "prioritize"],
    ["task-2", "keep"],
    ["task-3", "deprioritize"],
    ["task-4", "defer"],
  ]);
  assert.equal("explanation" in guidance, false);
});

test("accepts an empty recommendation list only when there are no open tasks", () => {
  const proposal = validateDayPlanRegenerationProposal(
    { explanation: "There is no task work to schedule.", recommendations: [] },
    { openTaskIds: [], completedTaskIds: [], commitmentIds: ["commitment-1"] },
  );

  assert.deepEqual(proposal.recommendations, []);
});
