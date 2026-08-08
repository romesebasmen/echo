import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayPlanRegenerationErrorMessage,
  groupDayPlanRegenerationProposal,
} from "./regeneration-presentation.ts";
import type {
  DayPlanRegenerationProposalEnvelope,
  DayPlanRegenerationTaskSummary,
} from "../types/day-plan-regeneration.ts";

function summary(
  id: string,
  title: string,
): DayPlanRegenerationTaskSummary {
  return {
    id,
    title,
    responsibilityArea: "echo",
    estimatedMinutes: 30,
  };
}

function proposal(): DayPlanRegenerationProposalEnvelope {
  return {
    schemaVersion: 1,
    recommendation: {
      explanation: "Protect the most important work and leave room to recover.",
      recommendations: [
        { taskId: "task-defer", disposition: "defer" },
        { taskId: "task-prioritize", disposition: "prioritize" },
        { taskId: "task-keep", disposition: "keep" },
      ],
    },
    inputFingerprint: "a".repeat(64),
    expectedCheckInCompletedAt: "2026-08-08T14:00:00.000Z",
    generatedAt: "2026-08-08T14:01:00.000Z",
    taskSummaries: [
      summary("task-prioritize", "Finish the review"),
      summary("task-keep", "Reply to messages"),
      summary("task-defer", "Reorganize notes"),
    ],
  } as DayPlanRegenerationProposalEnvelope;
}

test("groups server task summaries in the fixed recommendation category order", () => {
  const groups = groupDayPlanRegenerationProposal(proposal());

  assert.deepEqual(
    groups.map((group) => ({
      disposition: group.disposition,
      label: group.label,
      taskIds: group.tasks.map((task) => task.id),
    })),
    [
      {
        disposition: "prioritize",
        label: "Prioritize",
        taskIds: ["task-prioritize"],
      },
      { disposition: "keep", label: "Keep", taskIds: ["task-keep"] },
      { disposition: "defer", label: "Defer", taskIds: ["task-defer"] },
    ],
  );
});

test("hides empty recommendation groups", () => {
  const groups = groupDayPlanRegenerationProposal(proposal());

  assert.equal(groups.some((group) => group.disposition === "deprioritize"), false);
});

test("uses taskSummaries as display data instead of recommendation metadata", () => {
  const groups = groupDayPlanRegenerationProposal(proposal());
  const prioritized = groups.find((group) => group.disposition === "prioritize");

  assert.equal(prioritized?.tasks[0]?.title, "Finish the review");
  assert.equal(prioritized?.tasks[0]?.estimatedMinutes, 30);
});

test("formats useful regeneration, stale, and apply errors", () => {
  assert.equal(
    dayPlanRegenerationErrorMessage({ kind: "regenerate", message: "Try again later." }),
    "Echo couldn't prepare a recommendation. Try again later.",
  );
  assert.equal(
    dayPlanRegenerationErrorMessage({ kind: "stale-proposal", message: "ignored" }),
    "That recommendation is out of date. Regenerate with Echo to review a fresh one.",
  );
  assert.equal(
    dayPlanRegenerationErrorMessage({ kind: "apply", message: "Try again." }),
    "Echo's recommendation couldn't be applied. Try again.",
  );
});
