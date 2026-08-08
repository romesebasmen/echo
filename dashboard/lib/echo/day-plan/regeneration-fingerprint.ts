import { createHash } from "node:crypto";
import type { Commitment, DayPlan } from "../types/day-plan.ts";
import type { PlanningContext } from "../types/planning-context.ts";
import type { Task } from "../types/task.ts";

export interface DayPlanRegenerationFingerprintInput {
  dayPlan: DayPlan;
  planningContext: PlanningContext;
  openTasks: readonly Task[];
  commitments: readonly Commitment[];
}

function compareIds(a: { id: string }, b: { id: string }): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])]),
  );
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function createDayPlanRegenerationFingerprint(
  input: DayPlanRegenerationFingerprintInput,
): string {
  const payload = {
    dayPlan: {
      id: input.dayPlan.id,
      planDate: input.dayPlan.planDate,
    },
    planningContext: input.planningContext,
    tasks: [...input.openTasks].sort(compareIds).map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      responsibilityArea: task.responsibilityArea,
      status: task.status,
      dueAt: task.dueAt,
      estimatedMinutes: task.estimatedMinutes,
      energyRequired: task.energyRequired,
      priority: task.priority,
      deepWork: task.deepWork,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    })),
    commitments: [...input.commitments].sort(compareIds).map((commitment) => ({
      id: commitment.id,
      title: commitment.title,
      startTime: commitment.startTime,
      endTime: commitment.endTime,
      responsibilityArea: commitment.responsibilityArea,
    })),
  };

  return createHash("sha256").update(canonicalStringify(payload)).digest("hex");
}
