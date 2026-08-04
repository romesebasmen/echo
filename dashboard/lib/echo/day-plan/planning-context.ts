import type {
  CapacityTier,
  PlanningContext,
  PlanningContextInput,
  SleepQuality,
} from "../types/planning-context.ts";

const MIN_CHECK_IN_SCORE = 1;
const MAX_CHECK_IN_SCORE = 10;
export const MAX_CHECK_IN_NOTES_LENGTH = 1_000;

export const PLANNING_CAPACITY_RULES = {
  stress: {
    elevatedFrom: 6,
    elevatedPenalty: 1,
    highFrom: 8,
    highPenalty: 2,
  },
  sleepPenalty: {
    good: 0,
    okay: 1,
    poor: 2,
  } satisfies Record<SleepQuality, number>,
  notEatenPenalty: 1,
  tiers: [
    {
      tier: "minimal",
      maximumEffectiveEnergy: 3,
      maxScheduledTaskMinutes: 90,
      breakAfterMinutes: 30,
      breakDurationMinutes: 15,
    },
    {
      tier: "reduced",
      maximumEffectiveEnergy: 5,
      maxScheduledTaskMinutes: 180,
      breakAfterMinutes: 45,
      breakDurationMinutes: 15,
    },
    {
      tier: "steady",
      maximumEffectiveEnergy: 7,
      maxScheduledTaskMinutes: 300,
      breakAfterMinutes: 75,
      breakDurationMinutes: 10,
    },
    {
      tier: "strong",
      maximumEffectiveEnergy: 10,
      maxScheduledTaskMinutes: 420,
      breakAfterMinutes: 90,
      breakDurationMinutes: 10,
    },
  ] satisfies Array<{
    tier: CapacityTier;
    maximumEffectiveEnergy: number;
    maxScheduledTaskMinutes: number;
    breakAfterMinutes: number;
    breakDurationMinutes: number;
  }>,
} as const;

export class InvalidPlanningContextError extends Error {
  constructor(reason: string) {
    super(`Invalid planning context: ${reason}`);
    this.name = "InvalidPlanningContextError";
  }
}

function assertCheckInScore(name: "energy" | "stress", value: number): void {
  if (!Number.isInteger(value) || value < MIN_CHECK_IN_SCORE || value > MAX_CHECK_IN_SCORE) {
    throw new InvalidPlanningContextError(`${name} must be an integer from 1 to 10.`);
  }
}

function isSleepQuality(value: string): value is SleepQuality {
  return value === "poor" || value === "okay" || value === "good";
}

function stressPenalty(stress: number): number {
  if (stress >= PLANNING_CAPACITY_RULES.stress.highFrom) {
    return PLANNING_CAPACITY_RULES.stress.highPenalty;
  }
  if (stress >= PLANNING_CAPACITY_RULES.stress.elevatedFrom) {
    return PLANNING_CAPACITY_RULES.stress.elevatedPenalty;
  }
  return 0;
}

function clampEnergy(value: number): number {
  return Math.min(Math.max(value, MIN_CHECK_IN_SCORE), MAX_CHECK_IN_SCORE);
}

export function createPlanningContext(input: PlanningContextInput): PlanningContext {
  assertCheckInScore("energy", input.energy);
  assertCheckInScore("stress", input.stress);

  if (!isSleepQuality(input.sleepQuality)) {
    throw new InvalidPlanningContextError("sleepQuality must be poor, okay, or good.");
  }
  if (typeof input.hasEaten !== "boolean") {
    throw new InvalidPlanningContextError("hasEaten must be a boolean.");
  }
  if (
    input.checkInNotes !== null &&
    (typeof input.checkInNotes !== "string" ||
      input.checkInNotes.length > MAX_CHECK_IN_NOTES_LENGTH)
  ) {
    throw new InvalidPlanningContextError(
      `checkInNotes must be null or at most ${MAX_CHECK_IN_NOTES_LENGTH} characters.`,
    );
  }

  const availableFromMs = new Date(input.availableFrom).getTime();
  const endOfWorkTimeMs = new Date(input.endOfWorkTime).getTime();
  if (!Number.isFinite(availableFromMs) || !Number.isFinite(endOfWorkTimeMs)) {
    throw new InvalidPlanningContextError("available times must be valid timestamps.");
  }
  if (availableFromMs >= endOfWorkTimeMs) {
    throw new InvalidPlanningContextError("availableFrom must be earlier than endOfWorkTime.");
  }
  if (!Number.isFinite(new Date(input.checkInCompletedAt).getTime())) {
    throw new InvalidPlanningContextError("checkInCompletedAt must be a valid timestamp.");
  }

  const effectiveEnergy = clampEnergy(
    input.energy -
      stressPenalty(input.stress) -
      PLANNING_CAPACITY_RULES.sleepPenalty[input.sleepQuality] -
      (input.hasEaten ? 0 : PLANNING_CAPACITY_RULES.notEatenPenalty),
  );
  const policy = PLANNING_CAPACITY_RULES.tiers.find(
    (tier) => effectiveEnergy <= tier.maximumEffectiveEnergy,
  );

  // The final tier covers effective energy through 10. Keeping this guard
  // makes policy edits fail clearly instead of producing a partial context.
  if (!policy) {
    throw new InvalidPlanningContextError("no capacity policy covers effective energy.");
  }

  return {
    ...input,
    effectiveEnergy,
    capacityTier: policy.tier,
    maxScheduledTaskMinutes: policy.maxScheduledTaskMinutes,
    breakAfterMinutes: policy.breakAfterMinutes,
    breakDurationMinutes: policy.breakDurationMinutes,
  };
}
