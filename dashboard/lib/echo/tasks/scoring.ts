// Relative imports here (not the usual "@/..." alias) so this pure,
// dependency-free module can also run directly under Node's native test
// runner, which has no bundler-style path-alias resolution. Both files are
// plain TS with no Next-specific requirements, so this is safe for the
// app's own bundler resolution too.
import { calendarDayDifference } from "../timezone.ts";
import type { Task, TaskEnergyLevel, TaskPriority } from "../types/task.ts";

// Deterministic task prioritization — no AI anywhere in this file. This is
// the mechanism that decides priority; an AI-assisted regenerate (later
// milestone) may explain a plan built from these scores, but must never be
// the thing computing them.

export type UrgencyTier = "overdue" | "due-today" | "due-soon" | "due-this-week" | "later-or-none";

const URGENCY_SCORES: Record<UrgencyTier, number> = {
  overdue: 100,
  "due-today": 80,
  "due-soon": 50,
  "due-this-week": 25,
  "later-or-none": 0,
};

export function classifyUrgency(dueAt: string | null, now: Date): UrgencyTier {
  if (!dueAt) return "later-or-none";

  const daysUntilDue = calendarDayDifference(now, new Date(dueAt));

  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue === 0) return "due-today";
  if (daysUntilDue <= 3) return "due-soon";
  if (daysUntilDue <= 7) return "due-this-week";
  return "later-or-none";
}

const PRIORITY_SCORES: Record<TaskPriority, number> = {
  high: 30,
  medium: 15,
  low: 5,
};

// The minimum reported energy (1-10) required for a task of this level to
// count as a fit. "low" tasks always fit — you can always do a low-energy
// task regardless of how tired you are.
const ENERGY_TIER_THRESHOLD: Record<TaskEnergyLevel, number> = {
  low: 0,
  medium: 4,
  high: 7,
};

const ENERGY_FIT_BONUS = 10;
const ENERGY_MISMATCH_PENALTY = -15;

export function energyFitScore(energyRequired: TaskEnergyLevel, currentEnergy: number): number {
  return currentEnergy >= ENERGY_TIER_THRESHOLD[energyRequired]
    ? ENERGY_FIT_BONUS
    : ENERGY_MISMATCH_PENALTY;
}

const MAX_STALENESS_BONUS = 10;

// Surfaces tasks that keep losing to more urgent items — the deterministic
// answer to "what may I be forgetting," growing by 1 point per day open,
// capped so a very old task doesn't permanently dominate every other signal.
export function stalenessBonus(createdAt: string, now: Date): number {
  const daysOpen = calendarDayDifference(new Date(createdAt), now);
  return Math.min(Math.max(daysOpen, 0), MAX_STALENESS_BONUS);
}

export interface ScoreTaskContext {
  now: Date;
  // 1-10, today's reported energy.
  currentEnergy: number;
}

export function scoreTask(task: Task, context: ScoreTaskContext): number {
  const urgency = URGENCY_SCORES[classifyUrgency(task.dueAt, context.now)];
  const priority = PRIORITY_SCORES[task.priority];
  const energyFit = energyFitScore(task.energyRequired, context.currentEnergy);
  const staleness = stalenessBonus(task.createdAt, context.now);

  return urgency + priority + energyFit + staleness;
}
