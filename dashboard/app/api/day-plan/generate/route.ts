import {
  DayPlanNotFoundError,
  generateAndPersistDayPlan,
  IncompleteCheckInError,
  InvalidAvailableTimeRangeError,
  InvalidCheckInStateError,
} from "@/lib/echo/day-plan/service";
import {
  getDayPlanForDate,
  listCommitments,
  MissingCommitmentsTableError,
  MissingDayPlansTableError,
} from "@/lib/echo/day-plan/repository";
import {
  CheckInChangedDuringGenerationError,
  MissingScheduleBlocksTableError,
  persistGeneratedSchedule,
} from "@/lib/echo/day-plan/schedule-blocks-repository";
import { MissingDailyCheckInMigrationError } from "@/lib/echo/day-plan/migration-error";
import { listTasks, MissingTasksTableError } from "@/lib/echo/tasks/repository";
import { formatError } from "@/lib/echo/errors";
import { toUserDateString } from "@/lib/echo/timezone";

function handleGenerateError(error: unknown) {
  if (error instanceof DayPlanNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof IncompleteCheckInError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof CheckInChangedDuringGenerationError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof MissingDailyCheckInMigrationError) {
    console.error("POST /api/day-plan/generate failed: daily-checkin migration is missing.");
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (
    error instanceof InvalidCheckInStateError ||
    error instanceof InvalidAvailableTimeRangeError
  ) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (
    error instanceof MissingDayPlansTableError ||
    error instanceof MissingCommitmentsTableError ||
    error instanceof MissingScheduleBlocksTableError ||
    error instanceof MissingTasksTableError
  ) {
    console.error("POST /api/day-plan/generate failed: required table is missing.");
    return Response.json(
      { error: "A required planning table is missing. Run the setup SQL, then try again." },
      { status: 500 },
    );
  }

  console.error("POST /api/day-plan/generate failed:", formatError(error));
  return Response.json({ error: "Could not generate today's plan." }, { status: 500 });
}

export async function POST() {
  try {
    const planDate = toUserDateString(new Date());
    const result = await generateAndPersistDayPlan(planDate, {
      getDayPlanForDate,
      listTasks,
      listCommitments,
      persistGeneratedSchedule,
    });

    return Response.json(result);
  } catch (error) {
    return handleGenerateError(error);
  }
}
