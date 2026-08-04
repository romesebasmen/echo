export interface DatabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const DAILY_CHECK_IN_SCHEMA_MARKERS = [
  "stress",
  "sleep_quality",
  "has_eaten",
  "check_in_notes",
  "check_in_completed_at",
  "save_day_plan_check_in",
  "replace_day_plan_schedule",
];

export class MissingDailyCheckInMigrationError extends Error {
  constructor() {
    super(
      "The daily-checkin database migration has not been applied. Apply the version-controlled Supabase migrations, then try again.",
    );
    this.name = "MissingDailyCheckInMigrationError";
  }
}

export function isMissingDailyCheckInMigrationError(error: DatabaseErrorLike): boolean {
  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const mentionsDailyCheckInSchema = DAILY_CHECK_IN_SCHEMA_MARKERS.some((marker) =>
    text.includes(marker),
  );

  return (
    (error.code === "PGRST204" && mentionsDailyCheckInSchema) ||
    (error.code === "42703" && mentionsDailyCheckInSchema) ||
    (error.code === "PGRST202" && mentionsDailyCheckInSchema) ||
    (error.code === "42883" && mentionsDailyCheckInSchema) ||
    (text.includes("schema cache") && mentionsDailyCheckInSchema)
  );
}

export function throwIfDailyCheckInMigrationMissing(error: DatabaseErrorLike): void {
  if (isMissingDailyCheckInMigrationError(error)) {
    throw new MissingDailyCheckInMigrationError();
  }
}
