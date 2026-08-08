// Relative imports only, throughout this file — no "@/..." alias anywhere,
// so the orchestration below can be unit-tested via Node's native test
// runner with mocked dependencies, without pulling in the real Supabase
// client (same rationale as scoring.ts and scheduler.ts). This file has no
// default/real repository wiring baked in: the caller (a future API route)
// passes the real repository functions in as `deps`, exactly the same
// functions it would otherwise import and call directly. That keeps this
// module fully decoupled from Supabase while adding no indirection for
// production callers.
import { generateSchedule } from "./scheduler.ts";
import type { DraftScheduleBlock } from "./scheduler.ts";
import { missingCheckInFields } from "./check-in.ts";
import {
  createPlanningContext,
  InvalidPlanningContextError,
} from "./planning-context.ts";
import type { Commitment, DayPlan, ScheduleBlock } from "../types/day-plan.ts";
import type { PlanningContext } from "../types/planning-context.ts";
import type { Task, TaskStatus } from "../types/task.ts";

export class DayPlanNotFoundError extends Error {
  constructor(planDate: string) {
    super(`No day plan exists for ${planDate}. Create one before generating a schedule.`);
    this.name = "DayPlanNotFoundError";
  }
}

export class InvalidAvailableTimeRangeError extends Error {
  constructor(availableFrom: string, endOfWorkTime: string) {
    super(
      `availableFrom (${availableFrom}) must be earlier than endOfWorkTime (${endOfWorkTime}).`,
    );
    this.name = "InvalidAvailableTimeRangeError";
  }
}

export class IncompleteCheckInError extends Error {
  readonly missingFields: string[];

  constructor(planDate: string, missingFields: string[]) {
    super(`The daily check-in for ${planDate} is incomplete: ${missingFields.join(", ")}.`);
    this.name = "IncompleteCheckInError";
    this.missingFields = missingFields;
  }
}

export class InvalidCheckInStateError extends Error {
  constructor(reason: string) {
    super(`The daily check-in is invalid: ${reason}`);
    this.name = "InvalidCheckInStateError";
  }
}

// Wraps an unexpected throw from the (normally pure, exception-free)
// scheduler — not expected to trigger under valid input, but the boundary
// exists so a scheduling failure is always a typed, identifiable error
// rather than an opaque one leaking out of this function.
export class ScheduleGenerationError extends Error {
  constructor(reason: string) {
    super(`Schedule generation failed: ${reason}`);
    this.name = "ScheduleGenerationError";
  }
}

// Deliberately narrow: this is NOT a catch-all for repository errors (those
// are already typed and clear — e.g. MissingScheduleBlocksTableError — and
// must propagate unchanged, not be hidden behind a generic wrapper). This
// only fires when replaceScheduleBlocks succeeds but silently returns a
// different number of rows than were sent, a genuine persistence anomaly.
export class SchedulePersistenceError extends Error {
  constructor(reason: string) {
    super(`Failed to persist the generated schedule: ${reason}`);
    this.name = "SchedulePersistenceError";
  }
}

export interface LoadDayPlanPlanningInputsDeps {
  getDayPlanForDate: (planDate: string) => Promise<DayPlan | null>;
  listTasks: (options: { status?: TaskStatus }) => Promise<Task[]>;
  listCommitments: (dayPlanId: string) => Promise<Commitment[]>;
}

export interface GenerateAndPersistDayPlanDeps extends LoadDayPlanPlanningInputsDeps {
  persistGeneratedSchedule: (
    dayPlanId: string,
    expectedCheckInCompletedAt: string,
    blocks: DraftScheduleBlock[],
  ) => Promise<{ dayPlan: DayPlan; scheduleBlocks: ScheduleBlock[] }>;
}

export interface LoadedDayPlanPlanningInputs {
  dayPlan: DayPlan;
  planningContext: PlanningContext;
  openTasks: Task[];
  commitments: Commitment[];
  availableFrom: Date;
  endOfWorkTime: Date;
}

export interface GenerateAndPersistDayPlanResult {
  dayPlan: DayPlan;
  planningContext: PlanningContext;
  scheduleBlocks: ScheduleBlock[];
  // Open tasks that didn't fit today — surfaced, never silently dropped.
  unscheduled: Task[];
}

// Shared read-only boundary for deterministic generation and reviewed
// regeneration. It validates the saved check-in before exposing any planning
// inputs, so both flows derive exactly the same trusted PlanningContext.
export async function loadDayPlanPlanningInputs(
  planDate: string,
  deps: LoadDayPlanPlanningInputsDeps,
): Promise<LoadedDayPlanPlanningInputs> {
  const dayPlan = await deps.getDayPlanForDate(planDate);
  if (!dayPlan) {
    throw new DayPlanNotFoundError(planDate);
  }

  const missingFields = missingCheckInFields(dayPlan);
  if (missingFields.length > 0) {
    throw new IncompleteCheckInError(planDate, missingFields);
  }
  const { stress, sleepQuality, hasEaten, checkInCompletedAt } = dayPlan;

  const availableFrom = new Date(dayPlan.availableFrom);
  const endOfWorkTime = new Date(dayPlan.endOfWorkTime);
  if (availableFrom.getTime() >= endOfWorkTime.getTime()) {
    throw new InvalidAvailableTimeRangeError(dayPlan.availableFrom, dayPlan.endOfWorkTime);
  }

  let planningContext: PlanningContext;
  try {
    planningContext = createPlanningContext({
      planDate: dayPlan.planDate,
      availableFrom: dayPlan.availableFrom,
      endOfWorkTime: dayPlan.endOfWorkTime,
      energy: dayPlan.energy,
      stress: stress!,
      sleepQuality: sleepQuality!,
      hasEaten: hasEaten!,
      checkInNotes: dayPlan.checkInNotes,
      checkInCompletedAt: checkInCompletedAt!,
    });
  } catch (error) {
    if (error instanceof InvalidPlanningContextError) {
      throw new InvalidCheckInStateError(error.message);
    }
    throw error;
  }

  const [openTasks, commitments] = await Promise.all([
    deps.listTasks({ status: "open" }),
    deps.listCommitments(dayPlan.id),
  ]);

  return {
    dayPlan,
    planningContext,
    openTasks,
    commitments,
    availableFrom,
    endOfWorkTime,
  };
}

// Loads a day plan and its inputs, runs the existing deterministic
// scheduler, persists the result, and marks the plan generated. This
// function decides nothing about priority or timing itself — all of that
// stays inside scheduler.ts. It only sequences repository reads/writes
// around a single call to the existing scheduling function.
export async function generateAndPersistDayPlan(
  planDate: string,
  deps: GenerateAndPersistDayPlanDeps,
  now: Date = new Date(),
): Promise<GenerateAndPersistDayPlanResult> {
  const {
    dayPlan,
    planningContext,
    openTasks,
    commitments,
    availableFrom,
    endOfWorkTime,
  } = await loadDayPlanPlanningInputs(planDate, deps);
  const checkInCompletedAt = dayPlan.checkInCompletedAt!;

  let generated: { blocks: DraftScheduleBlock[]; unscheduled: Task[] };
  try {
    generated = generateSchedule({
      tasks: openTasks,
      commitments,
      availableFrom,
      endOfWorkTime,
      planningContext,
      now,
    });
  } catch (error) {
    throw new ScheduleGenerationError(error instanceof Error ? error.message : String(error));
  }

  const persisted = await deps.persistGeneratedSchedule(
    dayPlan.id,
    checkInCompletedAt,
    generated.blocks,
  );
  if (persisted.scheduleBlocks.length !== generated.blocks.length) {
    throw new SchedulePersistenceError(
      `expected ${generated.blocks.length} block(s) to be persisted, but ${persisted.scheduleBlocks.length} were returned`,
    );
  }

  return {
    dayPlan: persisted.dayPlan,
    planningContext,
    scheduleBlocks: persisted.scheduleBlocks,
    unscheduled: generated.unscheduled,
  };
}
