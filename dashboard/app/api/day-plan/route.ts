import {
  getDayPlanForDate,
  MissingDayPlansTableError,
  saveDayPlanCheckIn,
} from "@/lib/echo/day-plan/repository";
import { isCheckInComplete } from "@/lib/echo/day-plan/check-in";
import { MissingDailyCheckInMigrationError } from "@/lib/echo/day-plan/migration-error";
import {
  createPlanningContext,
  InvalidPlanningContextError,
  MAX_CHECK_IN_NOTES_LENGTH,
} from "@/lib/echo/day-plan/planning-context";
import { formatError } from "@/lib/echo/errors";
import { parseTimestampWithExplicitOffset, toUserDateString } from "@/lib/echo/timezone";
import type { DayPlan, PlanningContext, SleepQuality } from "@/lib/echo/types";

const SLEEP_QUALITIES: SleepQuality[] = ["poor", "okay", "good"];

function contextForCompletePlan(dayPlan: DayPlan): PlanningContext | null {
  if (!isCheckInComplete(dayPlan)) return null;

  return createPlanningContext({
    planDate: dayPlan.planDate,
    availableFrom: dayPlan.availableFrom,
    endOfWorkTime: dayPlan.endOfWorkTime,
    energy: dayPlan.energy,
    stress: dayPlan.stress!,
    sleepQuality: dayPlan.sleepQuality!,
    hasEaten: dayPlan.hasEaten!,
    checkInNotes: dayPlan.checkInNotes,
    checkInCompletedAt: dayPlan.checkInCompletedAt!,
  });
}

function handleDayPlanError(routeLabel: string, error: unknown) {
  if (error instanceof MissingDailyCheckInMigrationError) {
    console.error(`${routeLabel} failed: daily-checkin migration is missing.`);
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (error instanceof MissingDayPlansTableError) {
    console.error(`${routeLabel} failed: day_plans table is missing.`);
    return Response.json(
      { error: "The day_plans table doesn't exist yet. Run the setup SQL, then try again." },
      { status: 500 },
    );
  }
  if (error instanceof InvalidPlanningContextError) {
    console.error(`${routeLabel} failed:`, error.message);
    return Response.json({ error: error.message }, { status: 400 });
  }

  console.error(`${routeLabel} failed:`, formatError(error));
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

export async function GET() {
  try {
    const planDate = toUserDateString(new Date());
    const dayPlan = await getDayPlanForDate(planDate);
    return Response.json({
      dayPlan,
      planningContext: dayPlan ? contextForCompletePlan(dayPlan) : null,
    });
  } catch (error) {
    return handleDayPlanError("GET /api/day-plan", error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const energy = body.energy;
    const stress = body.stress;
    const sleepQuality = body.sleepQuality;
    const hasEaten = body.hasEaten;
    const availableFrom = body.availableFrom;
    const endOfWorkTime = body.endOfWorkTime;

    if (!Number.isInteger(energy) || (energy as number) < 1 || (energy as number) > 10) {
      return Response.json({ error: "energy must be an integer from 1 to 10." }, { status: 400 });
    }
    if (!Number.isInteger(stress) || (stress as number) < 1 || (stress as number) > 10) {
      return Response.json({ error: "stress must be an integer from 1 to 10." }, { status: 400 });
    }
    if (
      typeof sleepQuality !== "string" ||
      !SLEEP_QUALITIES.includes(sleepQuality as SleepQuality)
    ) {
      return Response.json(
        { error: "sleepQuality must be poor, okay, or good." },
        { status: 400 },
      );
    }
    if (typeof hasEaten !== "boolean") {
      return Response.json({ error: "hasEaten must be a boolean." }, { status: 400 });
    }

    let checkInNotes: string | null = null;
    if (body.checkInNotes !== undefined && body.checkInNotes !== null) {
      if (typeof body.checkInNotes !== "string") {
        return Response.json(
          { error: "checkInNotes must be text or null." },
          { status: 400 },
        );
      }
      if (body.checkInNotes.length > MAX_CHECK_IN_NOTES_LENGTH) {
        return Response.json(
          { error: `checkInNotes must be at most ${MAX_CHECK_IN_NOTES_LENGTH} characters.` },
          { status: 400 },
        );
      }
      checkInNotes = body.checkInNotes.trim() || null;
    }

    if (typeof availableFrom !== "string" || typeof endOfWorkTime !== "string") {
      return Response.json(
        { error: "availableFrom and endOfWorkTime must be timestamps." },
        { status: 400 },
      );
    }

    const availableFromDate = parseTimestampWithExplicitOffset(availableFrom);
    const endOfWorkTimeDate = parseTimestampWithExplicitOffset(endOfWorkTime);
    if (!availableFromDate || !endOfWorkTimeDate) {
      return Response.json(
        { error: "availableFrom and endOfWorkTime must be valid timestamps with an offset." },
        { status: 400 },
      );
    }
    if (availableFromDate.getTime() >= endOfWorkTimeDate.getTime()) {
      return Response.json(
        { error: "availableFrom must be earlier than endOfWorkTime." },
        { status: 400 },
      );
    }

    const now = new Date();
    const planDate = toUserDateString(now);
    if (
      toUserDateString(availableFromDate) !== planDate ||
      toUserDateString(endOfWorkTimeDate) !== planDate
    ) {
      return Response.json(
        { error: "Availability must fall within today's Chicago calendar date." },
        { status: 400 },
      );
    }

    const dayPlan = await saveDayPlanCheckIn({
      planDate,
      availableFrom: availableFromDate.toISOString(),
      endOfWorkTime: endOfWorkTimeDate.toISOString(),
      energy: energy as number,
      stress: stress as number,
      sleepQuality: sleepQuality as SleepQuality,
      hasEaten,
      checkInNotes,
      checkInCompletedAt: now.toISOString(),
    });

    return Response.json({ dayPlan, planningContext: contextForCompletePlan(dayPlan) });
  } catch (error) {
    return handleDayPlanError("PUT /api/day-plan", error);
  }
}
