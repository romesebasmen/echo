import {
  TASK_RECOMMENDATION_DISPOSITIONS,
  type DayPlanTaskRecommendation,
  type TaskRecommendationDisposition,
  type TaskSchedulingGuidance,
  type ValidatedDayPlanRegenerationProposal,
} from "../types/day-plan-regeneration.ts";

export const MAX_REGENERATION_EXPLANATION_LENGTH = 600;

export interface DayPlanRegenerationProposalScope {
  openTaskIds: readonly string[];
  completedTaskIds?: readonly string[];
  commitmentIds?: readonly string[];
}

export class InvalidDayPlanRegenerationProposalError extends Error {
  constructor(reason: string) {
    super(`Day-plan regeneration proposal is invalid: ${reason}`);
    this.name = "InvalidDayPlanRegenerationProposalError";
  }
}

function invalid(reason: string): never {
  throw new InvalidDayPlanRegenerationProposalError(reason);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isDisposition(value: unknown): value is TaskRecommendationDisposition {
  return (
    typeof value === "string" &&
    TASK_RECOMMENDATION_DISPOSITIONS.some((disposition) => disposition === value)
  );
}

export function validateDayPlanRegenerationProposal(
  value: unknown,
  scope: DayPlanRegenerationProposalScope,
): ValidatedDayPlanRegenerationProposal {
  if (!isRecord(value) || !hasExactKeys(value, ["explanation", "recommendations"])) {
    invalid("the top-level object must contain exactly explanation and recommendations");
  }

  if (typeof value.explanation !== "string" || value.explanation.trim().length === 0) {
    invalid("explanation must be non-empty text");
  }
  const explanation = value.explanation.trim();
  if (explanation.length > MAX_REGENERATION_EXPLANATION_LENGTH) {
    invalid(
      `explanation must be at most ${MAX_REGENERATION_EXPLANATION_LENGTH} characters`,
    );
  }

  if (!Array.isArray(value.recommendations)) {
    invalid("recommendations must be an array");
  }

  const openTaskIds = new Set(scope.openTaskIds);
  const completedTaskIds = new Set(scope.completedTaskIds ?? []);
  const commitmentIds = new Set(scope.commitmentIds ?? []);
  const seenTaskIds = new Set<string>();
  const recommendations: DayPlanTaskRecommendation[] = [];

  for (const recommendation of value.recommendations) {
    if (
      !isRecord(recommendation) ||
      !hasExactKeys(recommendation, ["taskId", "disposition"])
    ) {
      invalid("each recommendation must contain exactly taskId and disposition");
    }
    if (typeof recommendation.taskId !== "string" || recommendation.taskId.length === 0) {
      invalid("each taskId must be a non-empty string");
    }
    if (!isDisposition(recommendation.disposition)) {
      invalid(
        "disposition must be prioritize, keep, deprioritize, or defer",
      );
    }

    const taskId = recommendation.taskId;
    if (seenTaskIds.has(taskId)) {
      invalid(`task ${taskId} appears more than once`);
    }
    if (commitmentIds.has(taskId)) {
      invalid(`commitment ${taskId} cannot appear as a task recommendation`);
    }
    if (completedTaskIds.has(taskId)) {
      invalid(`completed task ${taskId} cannot appear in the proposal`);
    }
    if (!openTaskIds.has(taskId)) {
      invalid(`unknown task ${taskId} cannot appear in the proposal`);
    }

    seenTaskIds.add(taskId);
    recommendations.push(Object.freeze({ taskId, disposition: recommendation.disposition }));
  }

  const omittedTaskIds = scope.openTaskIds.filter((taskId) => !seenTaskIds.has(taskId));
  if (omittedTaskIds.length > 0) {
    invalid(`every open task must appear exactly once; omitted: ${omittedTaskIds.join(", ")}`);
  }

  return Object.freeze({
    explanation,
    recommendations: Object.freeze(recommendations),
  }) as ValidatedDayPlanRegenerationProposal;
}

export function proposalToSchedulerGuidance(
  proposal: ValidatedDayPlanRegenerationProposal,
): TaskSchedulingGuidance {
  return {
    taskDispositions: new Map(
      proposal.recommendations.map(({ taskId, disposition }) => [taskId, disposition]),
    ),
  };
}
