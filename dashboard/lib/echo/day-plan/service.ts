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
import type { Commitment, DayPlan, DayPlanStatus, ScheduleBlock } from "../types/day-plan.ts";
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

export interface GenerateAndPersistDayPlanDeps {
  getDayPlanForDate: (planDate: string) => Promise<DayPlan | null>;
  listTasks: (options: { status?: TaskStatus }) => Promise<Task[]>;
  listCommitments: (dayPlanId: string) => Promise<Commitment[]>;
  replaceScheduleBlocks: (
    dayPlanId: string,
    blocks: DraftScheduleBlock[],
  ) => Promise<ScheduleBlock[]>;
  updateDayPlanStatus: (id: string, status: DayPlanStatus) => Promise<DayPlan>;
}

export interface GenerateAndPersistDayPlanResult {
  dayPlan: DayPlan;
  scheduleBlocks: ScheduleBlock[];
  // Open tasks that didn't fit today — surfaced, never silently dropped.
  unscheduled: Task[];
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
  const dayPlan = await deps.getDayPlanForDate(planDate);
  if (!dayPlan) {
    throw new DayPlanNotFoundError(planDate);
  }

  const availableFrom = new Date(dayPlan.availableFrom);
  const endOfWorkTime = new Date(dayPlan.endOfWorkTime);
  if (availableFrom.getTime() >= endOfWorkTime.getTime()) {
    throw new InvalidAvailableTimeRangeError(dayPlan.availableFrom, dayPlan.endOfWorkTime);
  }

  const [openTasks, commitments] = await Promise.all([
    deps.listTasks({ status: "open" }),
    deps.listCommitments(dayPlan.id),
  ]);

  let generated: { blocks: DraftScheduleBlock[]; unscheduled: Task[] };
  try {
    generated = generateSchedule({
      tasks: openTasks,
      commitments,
      availableFrom,
      endOfWorkTime,
      currentEnergy: dayPlan.energy,
      now,
    });
  } catch (error) {
    throw new ScheduleGenerationError(error instanceof Error ? error.message : String(error));
  }

  const persistedBlocks = await deps.replaceScheduleBlocks(dayPlan.id, generated.blocks);
  if (persistedBlocks.length !== generated.blocks.length) {
    throw new SchedulePersistenceError(
      `expected ${generated.blocks.length} block(s) to be persisted, but ${persistedBlocks.length} were returned`,
    );
  }

  const updatedDayPlan = await deps.updateDayPlanStatus(dayPlan.id, "generated");

  return {
    dayPlan: updatedDayPlan,
    scheduleBlocks: persistedBlocks,
    unscheduled: generated.unscheduled,
  };
}
