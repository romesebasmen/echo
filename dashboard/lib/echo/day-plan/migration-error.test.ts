import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMissingDailyCheckInMigrationError,
  MissingDailyCheckInMigrationError,
  throwIfDailyCheckInMigrationMissing,
} from "./migration-error.ts";

test("detects a missing daily check-in column from PostgREST", () => {
  assert.equal(
    isMissingDailyCheckInMigrationError({
      code: "PGRST204",
      message: "Could not find the 'check_in_completed_at' column of 'day_plans' in the schema cache",
    }),
    true,
  );
});

test("detects a missing transaction RPC from the PostgREST schema cache", () => {
  assert.equal(
    isMissingDailyCheckInMigrationError({
      code: "PGRST202",
      message: "Could not find the function public.replace_day_plan_schedule in the schema cache",
    }),
    true,
  );
});

test("does not relabel an unrelated missing column", () => {
  assert.equal(
    isMissingDailyCheckInMigrationError({
      code: "PGRST204",
      message: "Could not find the 'unrelated_column' column in the schema cache",
    }),
    false,
  );
});

test("throws the useful typed migration error", () => {
  assert.throws(
    () =>
      throwIfDailyCheckInMigrationMissing({
        code: "42703",
        message: "column day_plans.sleep_quality does not exist",
      }),
    MissingDailyCheckInMigrationError,
  );
});
