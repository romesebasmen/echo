import {
  createCommitment,
  getDayPlanForDate,
  listCommitments,
} from "@/lib/echo/day-plan/repository";
import {
  InvalidCommitmentRequestError,
  parseCommitmentCreateRequest,
} from "@/lib/echo/day-plan/commitment-request";
import { handleCommitmentHttpError } from "@/lib/echo/day-plan/commitment-http";
import { isCheckInComplete } from "@/lib/echo/day-plan/check-in";
import { loadCurrentDayPlanState } from "@/lib/echo/day-plan/current-state";
import { listScheduleBlocks } from "@/lib/echo/day-plan/schedule-blocks-repository";
import { listTasks } from "@/lib/echo/tasks/repository";
import { toUserDateString } from "@/lib/echo/timezone";

export async function POST(request: Request) {
  const routeLabel = "POST /api/day-plan/commitments";
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new InvalidCommitmentRequestError(
        "Request body must be valid JSON.",
      );
    }

    const planDate = toUserDateString(new Date());
    const dayPlan = await getDayPlanForDate(planDate);
    if (!dayPlan) {
      return Response.json(
        { error: "Save today's check-in before adding a commitment." },
        { status: 404 },
      );
    }
    if (!isCheckInComplete(dayPlan)) {
      return Response.json(
        { error: "Complete and save today's check-in before adding a commitment." },
        { status: 409 },
      );
    }
    const input = parseCommitmentCreateRequest(body, planDate);
    await createCommitment({ dayPlanId: dayPlan.id, ...input });

    const state = await loadCurrentDayPlanState(planDate, {
      getDayPlanForDate,
      listCommitments,
      listScheduleBlocks,
      listTasks,
    });
    return Response.json(state, { status: 201 });
  } catch (error) {
    return handleCommitmentHttpError(routeLabel, error);
  }
}
