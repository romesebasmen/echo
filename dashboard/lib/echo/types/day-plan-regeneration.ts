export const TASK_RECOMMENDATION_DISPOSITIONS = [
  "prioritize",
  "keep",
  "deprioritize",
  "defer",
] as const;

export type TaskRecommendationDisposition =
  (typeof TASK_RECOMMENDATION_DISPOSITIONS)[number];

export interface DayPlanTaskRecommendation {
  readonly taskId: string;
  readonly disposition: TaskRecommendationDisposition;
}

// This is the complete model-facing contract. It deliberately contains no
// scheduling arithmetic or mutable task/commitment fields.
export interface DayPlanRegenerationProposal {
  readonly explanation: string;
  readonly recommendations: readonly DayPlanTaskRecommendation[];
}

declare const validatedProposalBrand: unique symbol;

// Only the strict runtime validator may produce this branded form. Downstream
// conversion and scheduling code therefore cannot accidentally accept an
// unvalidated model response without an explicit unsafe cast.
export type ValidatedDayPlanRegenerationProposal = DayPlanRegenerationProposal & {
  readonly [validatedProposalBrand]: true;
};

// Internal, trusted scheduler input. This is not part of the model contract
// and is only produced from a ValidatedDayPlanRegenerationProposal.
export interface TaskSchedulingGuidance {
  readonly taskDispositions: ReadonlyMap<string, TaskRecommendationDisposition>;
}
