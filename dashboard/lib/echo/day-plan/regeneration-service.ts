import { generateSchedule } from "./scheduler.ts";
import type { DraftScheduleBlock } from "./scheduler.ts";
import {
  loadDayPlanPlanningInputs,
  ScheduleGenerationError,
  SchedulePersistenceError,
  type GenerateAndPersistDayPlanResult,
  type LoadDayPlanPlanningInputsDeps,
} from "./service.ts";
import {
  InvalidDayPlanRegenerationProposalError,
  proposalToSchedulerGuidance,
  validateDayPlanRegenerationProposal,
} from "./regeneration-proposal.ts";
import { createDayPlanRegenerationFingerprint } from "./regeneration-fingerprint.ts";
import {
  DAY_PLAN_REGENERATION_SCHEMA_VERSION,
  type ApplyDayPlanRegenerationRequest,
  type DayPlanRecommendationInput,
  type DayPlanRegenerationProposalEnvelope,
} from "../types/day-plan-regeneration.ts";
import type { DayPlan, ScheduleBlock } from "../types/day-plan.ts";
import type { PlanningContext } from "../types/planning-context.ts";

export interface DayPlanRecommendationProvider {
  recommend(input: DayPlanRecommendationInput): Promise<unknown>;
}

export class DayPlanRecommendationProviderUnavailableError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("The day-plan recommendation provider is unavailable.");
    this.name = "DayPlanRecommendationProviderUnavailableError";
    this.cause = cause;
  }
}

export class InvalidDayPlanRecommendationProviderOutputError extends Error {
  readonly cause: InvalidDayPlanRegenerationProposalError;

  constructor(cause: InvalidDayPlanRegenerationProposalError) {
    super(`The day-plan recommendation provider returned invalid output: ${cause.message}`);
    this.name = "InvalidDayPlanRecommendationProviderOutputError";
    this.cause = cause;
  }
}

export type StaleDayPlanRegenerationReason =
  | "check-in-changed"
  | "planning-inputs-changed";

export class StaleDayPlanRegenerationProposalError extends Error {
  readonly reason: StaleDayPlanRegenerationReason;

  constructor(reason: StaleDayPlanRegenerationReason) {
    super(
      reason === "check-in-changed"
        ? "The daily check-in changed after this regeneration flow started."
        : "Tasks, commitments, or planning inputs changed after this proposal was created.",
    );
    this.name = "StaleDayPlanRegenerationProposalError";
    this.reason = reason;
  }
}

export class InvalidDayPlanRegenerationApplicationError extends Error {
  constructor(reason: string) {
    super(`Cannot apply the day-plan regeneration proposal: ${reason}`);
    this.name = "InvalidDayPlanRegenerationApplicationError";
  }
}

export interface ProposeDayPlanRegenerationDeps extends LoadDayPlanPlanningInputsDeps {
  provider: DayPlanRecommendationProvider;
}

export interface ApplyDayPlanRegenerationDeps extends LoadDayPlanPlanningInputsDeps {
  persistGeneratedSchedule: (
    dayPlanId: string,
    expectedCheckInCompletedAt: string,
    blocks: DraftScheduleBlock[],
  ) => Promise<{ dayPlan: DayPlan; scheduleBlocks: ScheduleBlock[] }>;
  // Optional seam for tests. Production callers use the existing pure scheduler.
  generateSchedule?: typeof generateSchedule;
}

export interface ProposeDayPlanRegenerationResult {
  proposal: DayPlanRegenerationProposalEnvelope;
  planningContext: PlanningContext;
}

function compareIds(a: { id: string }, b: { id: string }): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function assertExpectedCheckIn(
  actualCheckInCompletedAt: string | null,
  expectedCheckInCompletedAt: string,
): asserts actualCheckInCompletedAt is string {
  if (actualCheckInCompletedAt !== expectedCheckInCompletedAt) {
    throw new StaleDayPlanRegenerationProposalError("check-in-changed");
  }
}

function recommendationInput(
  planningContext: DayPlanRecommendationInput["planningContext"],
  openTasks: Parameters<typeof createDayPlanRegenerationFingerprint>[0]["openTasks"],
  commitments: Parameters<typeof createDayPlanRegenerationFingerprint>[0]["commitments"],
): DayPlanRecommendationInput {
  const tasks = [...openTasks].sort(compareIds).map((task) =>
    Object.freeze({
      id: task.id,
      title: task.title,
      description: task.description,
      responsibilityArea: task.responsibilityArea,
      dueAt: task.dueAt,
      estimatedMinutes: task.estimatedMinutes,
      energyRequired: task.energyRequired,
      priority: task.priority,
      deepWork: task.deepWork,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }),
  );
  const fixedCommitments = [...commitments].sort(compareIds).map((commitment) =>
    Object.freeze({
      id: commitment.id,
      title: commitment.title,
      startTime: commitment.startTime,
      endTime: commitment.endTime,
      responsibilityArea: commitment.responsibilityArea,
    }),
  );

  return Object.freeze({
    planningContext: Object.freeze({ ...planningContext }),
    tasks: Object.freeze(tasks),
    commitments: Object.freeze(fixedCommitments),
  });
}

export async function proposeDayPlanRegeneration(
  planDate: string,
  expectedCheckInCompletedAt: string,
  deps: ProposeDayPlanRegenerationDeps,
  now: Date = new Date(),
): Promise<DayPlanRegenerationProposalEnvelope> {
  const result = await proposeDayPlanRegenerationWithContext(
    planDate,
    expectedCheckInCompletedAt,
    deps,
    now,
  );
  return result.proposal;
}

export async function proposeDayPlanRegenerationWithContext(
  planDate: string,
  expectedCheckInCompletedAt: string,
  deps: ProposeDayPlanRegenerationDeps,
  now: Date = new Date(),
): Promise<ProposeDayPlanRegenerationResult> {
  const loaded = await loadDayPlanPlanningInputs(planDate, deps);
  assertExpectedCheckIn(loaded.dayPlan.checkInCompletedAt, expectedCheckInCompletedAt);

  const inputFingerprint = createDayPlanRegenerationFingerprint(loaded);
  let recommendation;
  if (loaded.openTasks.length === 0) {
    recommendation = validateDayPlanRegenerationProposal(
      {
        explanation: "There are no open tasks to schedule today.",
        recommendations: [],
      },
      {
        openTaskIds: [],
        commitmentIds: loaded.commitments.map((commitment) => commitment.id),
      },
    );
  } else {
    const providerInput = recommendationInput(
      loaded.planningContext,
      loaded.openTasks,
      loaded.commitments,
    );

    let providerOutput: unknown;
    try {
      providerOutput = await deps.provider.recommend(providerInput);
    } catch (error) {
      if (
        error instanceof DayPlanRecommendationProviderUnavailableError ||
        error instanceof InvalidDayPlanRecommendationProviderOutputError
      ) {
        throw error;
      }
      throw new DayPlanRecommendationProviderUnavailableError(error);
    }

    try {
      recommendation = validateDayPlanRegenerationProposal(providerOutput, {
        openTaskIds: loaded.openTasks.map((task) => task.id),
        commitmentIds: loaded.commitments.map((commitment) => commitment.id),
      });
    } catch (error) {
      if (error instanceof InvalidDayPlanRegenerationProposalError) {
        throw new InvalidDayPlanRecommendationProviderOutputError(error);
      }
      throw error;
    }
  }

  const proposal = Object.freeze({
    schemaVersion: DAY_PLAN_REGENERATION_SCHEMA_VERSION,
    recommendation,
    inputFingerprint,
    expectedCheckInCompletedAt,
    generatedAt: now.toISOString(),
    taskSummaries: Object.freeze(
      [...loaded.openTasks].sort(compareIds).map((task) =>
        Object.freeze({
          id: task.id,
          title: task.title,
          responsibilityArea: task.responsibilityArea,
          estimatedMinutes: task.estimatedMinutes,
        }),
      ),
    ),
  });

  return { proposal, planningContext: loaded.planningContext };
}

function validateApplicationRequest(
  request: unknown,
): asserts request is ApplyDayPlanRegenerationRequest {
  if (typeof request !== "object" || request === null || Array.isArray(request)) {
    throw new InvalidDayPlanRegenerationApplicationError("request must be an object");
  }
  const candidate = request as Record<string, unknown>;
  if (candidate.schemaVersion !== DAY_PLAN_REGENERATION_SCHEMA_VERSION) {
    throw new InvalidDayPlanRegenerationApplicationError("unsupported schema version");
  }
  if (
    typeof candidate.inputFingerprint !== "string" ||
    candidate.inputFingerprint.length === 0
  ) {
    throw new InvalidDayPlanRegenerationApplicationError("inputFingerprint is required");
  }
  if (
    typeof candidate.expectedCheckInCompletedAt !== "string" ||
    candidate.expectedCheckInCompletedAt.length === 0
  ) {
    throw new InvalidDayPlanRegenerationApplicationError(
      "expectedCheckInCompletedAt is required",
    );
  }
  if (!Object.prototype.hasOwnProperty.call(candidate, "recommendation")) {
    throw new InvalidDayPlanRegenerationApplicationError("recommendation is required");
  }
}

export async function applyDayPlanRegeneration(
  planDate: string,
  request: unknown,
  deps: ApplyDayPlanRegenerationDeps,
  now: Date = new Date(),
): Promise<GenerateAndPersistDayPlanResult> {
  validateApplicationRequest(request);
  const loaded = await loadDayPlanPlanningInputs(planDate, deps);
  assertExpectedCheckIn(
    loaded.dayPlan.checkInCompletedAt,
    request.expectedCheckInCompletedAt,
  );

  const currentFingerprint = createDayPlanRegenerationFingerprint(loaded);
  if (currentFingerprint !== request.inputFingerprint) {
    throw new StaleDayPlanRegenerationProposalError("planning-inputs-changed");
  }

  const recommendation = validateDayPlanRegenerationProposal(request.recommendation, {
    openTaskIds: loaded.openTasks.map((task) => task.id),
    commitmentIds: loaded.commitments.map((commitment) => commitment.id),
  });
  const recommendationGuidance = proposalToSchedulerGuidance(recommendation);

  const schedule = deps.generateSchedule ?? generateSchedule;
  let generated;
  try {
    generated = schedule({
      tasks: loaded.openTasks,
      commitments: loaded.commitments,
      availableFrom: loaded.availableFrom,
      endOfWorkTime: loaded.endOfWorkTime,
      planningContext: loaded.planningContext,
      recommendationGuidance,
      now,
    });
  } catch (error) {
    throw new ScheduleGenerationError(error instanceof Error ? error.message : String(error));
  }

  const persisted = await deps.persistGeneratedSchedule(
    loaded.dayPlan.id,
    request.expectedCheckInCompletedAt,
    generated.blocks,
  );
  if (persisted.scheduleBlocks.length !== generated.blocks.length) {
    throw new SchedulePersistenceError(
      `expected ${generated.blocks.length} block(s) to be persisted, but ${persisted.scheduleBlocks.length} were returned`,
    );
  }

  return {
    dayPlan: persisted.dayPlan,
    planningContext: loaded.planningContext,
    scheduleBlocks: persisted.scheduleBlocks,
    unscheduled: generated.unscheduled,
  };
}
