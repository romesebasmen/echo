import type {
  DayPlanRegenerationProposalEnvelope,
  DayPlanRegenerationTaskSummary,
  TaskRecommendationDisposition,
} from "../types/day-plan-regeneration.ts";

const GROUPS: readonly {
  disposition: TaskRecommendationDisposition;
  label: string;
}[] = [
  { disposition: "prioritize", label: "Prioritize" },
  { disposition: "keep", label: "Keep" },
  { disposition: "deprioritize", label: "Deprioritize" },
  { disposition: "defer", label: "Defer" },
];

export interface DayPlanRegenerationPresentationGroup {
  disposition: TaskRecommendationDisposition;
  label: string;
  tasks: readonly DayPlanRegenerationTaskSummary[];
}

export function groupDayPlanRegenerationProposal(
  proposal: DayPlanRegenerationProposalEnvelope,
): readonly DayPlanRegenerationPresentationGroup[] {
  const dispositionByTaskId = new Map(
    proposal.recommendation.recommendations.map((recommendation) => [
      recommendation.taskId,
      recommendation.disposition,
    ]),
  );

  return GROUPS.map((group) => ({
    ...group,
    tasks: proposal.taskSummaries.filter(
      (task) => dispositionByTaskId.get(task.id) === group.disposition,
    ),
  })).filter((group) => group.tasks.length > 0);
}

export function dayPlanRegenerationErrorMessage(error: {
  kind: string;
  message: string;
}): string {
  if (error.kind === "regenerate") {
    return `Echo couldn't prepare a recommendation. ${error.message}`;
  }
  if (error.kind === "stale-proposal") {
    return "That recommendation is out of date. Regenerate with Echo to review a fresh one.";
  }
  if (error.kind === "apply") {
    return `Echo's recommendation couldn't be applied. ${error.message}`;
  }
  return error.message;
}
