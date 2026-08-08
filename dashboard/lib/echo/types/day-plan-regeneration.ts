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

export type DayPlanRecommendationTaskInput = Pick<
  Task,
  | "id"
  | "title"
  | "description"
  | "responsibilityArea"
  | "dueAt"
  | "estimatedMinutes"
  | "energyRequired"
  | "priority"
  | "deepWork"
  | "createdAt"
  | "updatedAt"
>;

export type DayPlanRecommendationCommitmentInput = Pick<
  Commitment,
  "id" | "title" | "startTime" | "endTime" | "responsibilityArea"
>;

export interface DayPlanRecommendationInput {
  readonly planningContext: PlanningContext;
  readonly tasks: readonly DayPlanRecommendationTaskInput[];
  readonly commitments: readonly DayPlanRecommendationCommitmentInput[];
}

export interface DayPlanRegenerationTaskSummary {
  readonly id: string;
  readonly title: string;
  readonly responsibilityArea: ResponsibilityArea;
  readonly estimatedMinutes: number | null;
}

export interface DayPlanRegenerationProposalEnvelope {
  readonly schemaVersion: typeof DAY_PLAN_REGENERATION_SCHEMA_VERSION;
  readonly recommendation: ValidatedDayPlanRegenerationProposal;
  readonly inputFingerprint: string;
  readonly expectedCheckInCompletedAt: string;
  readonly generatedAt: string;
  // Server-sourced display data. Apply never treats these summaries as input.
  readonly taskSummaries: readonly DayPlanRegenerationTaskSummary[];
}

// Runtime-untrusted application input. The service revalidates recommendation
// and reloads all authoritative task, commitment, check-in, and capacity data.
export interface ApplyDayPlanRegenerationRequest {
  readonly schemaVersion: number;
  readonly recommendation: unknown;
  readonly inputFingerprint: string;
  readonly expectedCheckInCompletedAt: string;
}
import type { Commitment } from "@/lib/echo/types/day-plan";
import type { PlanningContext } from "@/lib/echo/types/planning-context";
import type { ResponsibilityArea } from "@/lib/echo/types/responsibility-area";
import type { Task } from "@/lib/echo/types/task";

export const DAY_PLAN_REGENERATION_SCHEMA_VERSION = 1 as const;
