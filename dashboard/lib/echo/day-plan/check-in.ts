import type { DayPlan } from "../types/day-plan.ts";

type CheckInState = Pick<
  DayPlan,
  "energy" | "stress" | "sleepQuality" | "hasEaten" | "checkInCompletedAt"
>;

export function missingCheckInFields(dayPlan: CheckInState): string[] {
  const missing: string[] = [];
  if (!Number.isInteger(dayPlan.energy)) missing.push("energy");
  if (!Number.isInteger(dayPlan.stress)) missing.push("stress");
  if (
    dayPlan.sleepQuality !== "poor" &&
    dayPlan.sleepQuality !== "okay" &&
    dayPlan.sleepQuality !== "good"
  ) {
    missing.push("sleepQuality");
  }
  if (typeof dayPlan.hasEaten !== "boolean") missing.push("hasEaten");
  if (
    typeof dayPlan.checkInCompletedAt !== "string" ||
    dayPlan.checkInCompletedAt.length === 0
  ) {
    missing.push("checkInCompletedAt");
  }
  return missing;
}

export function isCheckInComplete(dayPlan: CheckInState): boolean {
  return missingCheckInFields(dayPlan).length === 0;
}
