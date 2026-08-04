export type SleepQuality = "poor" | "okay" | "good";
export type CapacityTier = "minimal" | "reduced" | "steady" | "strong";

export interface PlanningContextInput {
  planDate: string;
  availableFrom: string;
  endOfWorkTime: string;
  energy: number;
  stress: number;
  sleepQuality: SleepQuality;
  hasEaten: boolean;
  checkInNotes: string | null;
  checkInCompletedAt: string;
}

// A deterministic snapshot of the user's reported state and the capacity
// policy derived from it. Free-text notes are carried for later AI reasoning,
// but never influence the hard scheduling values below.
export interface PlanningContext extends PlanningContextInput {
  effectiveEnergy: number;
  capacityTier: CapacityTier;
  maxScheduledTaskMinutes: number;
  breakAfterMinutes: number;
  breakDurationMinutes: number;
}
